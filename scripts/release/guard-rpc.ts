/**
 * Cluster guard for the release workflow. Reads the RPC URL from the `RPC`
 * environment variable (the `RELEASE_RPC_URL` secret), refuses monikers,
 * empty values, local URLs and any cluster whose genesis hash is not
 * devnet's, then exports the normalised URL as `RELEASE_RPC` for the
 * following steps, masked in the logs. Every later Solana CLI call uses
 * `$RELEASE_RPC`, never the raw secret.
 *
 *   RPC=<url> bun scripts/release/guard-rpc.ts --confirm-cluster devnet
 */
import { appendFileSync } from 'node:fs';
import { opt, parseArgs } from '../devnet/lib/cli';
import { guardCluster, rpcGenesis, type GenesisSource } from '../devnet/lib/cluster';

export async function exportGuardedRpc(
  raw: string | undefined,
  confirm: string | undefined,
  githubEnv: string | undefined,
  source: GenesisSource = rpcGenesis,
): Promise<string[]> {
  const g = await guardCluster(raw, confirm, source);
  if (g.cluster !== 'devnet') throw new Error(`a release targets devnet; the RPC is ${g.cluster}`);
  if (githubEnv) appendFileSync(githubEnv, `RELEASE_RPC=${g.url}\n`);
  return [`::add-mask::${g.url}`, `cluster guard: ${g.cluster}`];
}

if (import.meta.main) {
  const lines = await exportGuardedRpc(process.env.RPC, opt(parseArgs(), 'confirm-cluster'), process.env.GITHUB_ENV);
  for (const l of lines) console.log(l);
}
