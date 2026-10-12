/**
 * Cluster guard for every script that talks to an RPC (scripts/devnet and
 * scripts/release).
 *
 * The Solana CLI expands monikers (`m`, `d`, `mainnet-beta`, …) and falls back
 * to its own config for an empty `--url`, so the guard accepts only an
 * explicit http(s) URL, asks the RPC for its genesis hash, and hands the
 * normalised `href` (never the raw argument) to every CLI call:
 *
 * - mainnet's genesis hash is always refused, local URLs included;
 * - a loopback URL is `local` (a validator or a Surfpool fork);
 * - any other URL needs `--confirm-cluster devnet` and devnet's genesis hash,
 *   and is refused when its host or path names mainnet.
 */
import { createSolanaRpc } from '@solana/kit';

export const DEVNET_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

export type GuardedCluster = { cluster: 'local' | 'devnet'; url: string };
export type GenesisSource = { genesisHash: (href: string) => Promise<string> };

/** Asks the RPC itself. Tests pass a stub instead. */
export const rpcGenesis: GenesisSource = {
  genesisHash: async (href) => String(await createSolanaRpc(href).getGenesisHash().send()),
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Parses an RPC URL: http(s) only, no monikers, no empty value. */
export function normaliseRpcUrl(raw: string | undefined): URL {
  const v = (raw ?? '').trim();
  if (!v) throw new Error('an RPC URL is required (an empty --url falls back to the Solana CLI config)');
  if (!v.includes('://')) {
    throw new Error(`"${v}" is not a URL: pass a full http(s) RPC URL (cluster monikers such as m, d or mainnet-beta are refused)`);
  }
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new Error(`"${v}" is not a valid http(s) URL`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(`"${v}" must be an http(s) URL`);
  return u;
}

/** A loopback http(s) URL. Never throws. */
export function isLocalUrl(raw: string): boolean {
  try {
    return LOCAL_HOSTS.has(normaliseRpcUrl(raw).hostname);
  } catch {
    return false;
  }
}

export async function guardCluster(
  raw: string | undefined,
  confirm: string | undefined,
  source: GenesisSource = rpcGenesis,
): Promise<GuardedCluster> {
  const u = normaliseRpcUrl(raw);
  const url = u.href;
  const local = LOCAL_HOSTS.has(u.hostname);
  if (!local) {
    // Host and path, case-insensitive: providers put the network in either
    // (`mainnet.helius-rpc.com`, `…quiknode.pro/<token>/solana-mainnet`). The
    // path is not printed; it can hold an API token.
    if (`${u.host}${u.pathname}`.toLowerCase().includes('mainnet')) {
      throw new Error(`${u.host} names mainnet in its URL; mainnet goes through the spec §14.5 runbook`);
    }
    if (confirm !== 'devnet') throw new Error(`${u.host} is not local: pass --confirm-cluster devnet to run against devnet`);
  }
  let hash: string;
  try {
    hash = await source.genesisHash(url);
  } catch (e) {
    throw new Error(`could not read the genesis hash from ${u.host}: ${(e as Error).message}`);
  }
  if (hash === MAINNET_GENESIS) throw new Error(`${u.host} serves mainnet (genesis ${hash}); refused`);
  if (local) return { cluster: 'local', url };
  if (hash !== DEVNET_GENESIS) throw new Error(`${u.host} has genesis ${hash}, not devnet's ${DEVNET_GENESIS}`);
  return { cluster: 'devnet', url };
}

/** The guarded cluster must be the one the config file was written for. */
export function assertConfigCluster(guarded: GuardedCluster, configCluster: 'localnet' | 'devnet') {
  const want = configCluster === 'localnet' ? 'local' : 'devnet';
  if (guarded.cluster !== want) throw new Error(`the config is for ${configCluster}, but the RPC is ${guarded.cluster}`);
}
