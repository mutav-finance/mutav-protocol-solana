/**
 * Cluster guard. The pilot app runs against `localnet` (a local validator
 * seeded by scripts/seed.ts) or `devnet`. Mainnet is refused everywhere: in the
 * env parser, in the RPC URL check and in the explorer links.
 */

export type Cluster = "localnet" | "devnet";

export const CLUSTERS: readonly Cluster[] = ["localnet", "devnet"] as const;

export class MainnetRefusedError extends Error {
  override name = "MainnetRefusedError";
  constructor(what: string) {
    super(`${what}: mainnet is out of scope for the pilot app (localnet or devnet only)`);
  }
}

/** Parse `NEXT_PUBLIC_CLUSTER`. Defaults to devnet; mainnet or anything unknown throws. */
export function parseCluster(value: string | undefined): Cluster {
  const v = (value ?? "devnet").trim().toLowerCase();
  if (/mainnet/.test(v)) throw new MainnetRefusedError(`NEXT_PUBLIC_CLUSTER=${value}`);
  if (v === "localnet" || v === "devnet") return v;
  throw new Error(`NEXT_PUBLIC_CLUSTER must be "localnet" or "devnet", got "${value}"`);
}

const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/;

export const isLocalUrl = (url: string) => LOCAL_URL.test(url);

/**
 * An RPC URL as protocol and host only (A5): a provider API key can sit in the
 * path (`/v2/<key>`) or the query (`?api-key=`), so neither is ever shown.
 */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "(unparseable URL)";
  }
}

/** Every http(s) URL inside `text`, redacted to protocol and host. */
export const redactUrls = (text: string) => text.replace(/https?:\/\/[^\s"'<>)\]]+/gi, (m) => redactUrl(m));

/** Mainnet RPC hosts: any host naming mainnet, and the bare public endpoint. */
const MAINNET_HOST = /mainnet|^api\.solana\.com$/i;

/**
 * Check an RPC URL against the cluster: an explicit http(s) URL; refuse any
 * host that looks like mainnet (a "devnet" elsewhere in the URL no longer
 * exempts it, A4); require a local URL for localnet and a non-local one for
 * devnet. The genesis hash (`assertGenesis`) is the real check.
 */
export function assertRpcUrl(url: string, cluster: Cluster): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`RPC_URL is not a URL (monikers such as "devnet" are refused): ${redactUrl(url)}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error(`RPC_URL must be http(s): ${redactUrl(url)}`);
  if (MAINNET_HOST.test(u.hostname)) throw new MainnetRefusedError(`RPC_URL=${redactUrl(url)}`);
  if (cluster === "localnet" && !isLocalUrl(`${u.protocol}//${u.host}`)) {
    throw new Error(`RPC_URL=${redactUrl(url)} is not local, but NEXT_PUBLIC_CLUSTER=localnet`);
  }
  if (cluster === "devnet" && isLocalUrl(`${u.protocol}//${u.host}`)) {
    throw new Error(`RPC_URL=${redactUrl(url)} is local, but NEXT_PUBLIC_CLUSTER=devnet`);
  }
  return url;
}

export const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export const TESTNET_GENESIS = "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";

/**
 * Check the RPC's genesis hash against the cluster (A4): mainnet is always
 * refused; devnet must serve devnet's genesis; localnet must be a local
 * validator (its own genesis, never devnet's or testnet's).
 */
export function assertGenesis(hash: string, cluster: Cluster, rpcUrl: string): void {
  const host = redactUrl(rpcUrl);
  if (hash === MAINNET_GENESIS) throw new MainnetRefusedError(`${host} serves mainnet (genesis ${hash})`);
  if (cluster === "devnet" && hash !== DEVNET_GENESIS) throw new Error(`${host} is not devnet: genesis ${hash}, expected ${DEVNET_GENESIS}`);
  if (cluster === "localnet" && (hash === DEVNET_GENESIS || hash === TESTNET_GENESIS)) {
    throw new Error(`${host} serves a public cluster (genesis ${hash}), but NEXT_PUBLIC_CLUSTER=localnet`);
  }
}

export const DEFAULT_RPC: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
};

/** Wallet-standard chain id for the cluster. */
export const walletChain = (c: Cluster) => (c === "devnet" ? "solana:devnet" : "solana:localnet") as `solana:${string}`;

export type ExplorerKind = "address" | "tx";

/** A Solana Explorer link. Localnet links point the explorer at the local RPC. */
export function explorerUrl(kind: ExplorerKind, value: string, cluster: Cluster, localRpc = DEFAULT_RPC.localnet): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  if (cluster === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(localRpc)}`;
}
