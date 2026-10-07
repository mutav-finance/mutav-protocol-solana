/**
 * Shared CLI plumbing for scripts/devnet. These scripts never read key
 * material: they compose instructions and write unsigned Squads proposals,
 * or pass keypair *paths* straight to the Solana CLI (deploy.ts only).
 */
import { resolve, sep } from 'node:path';

export type Args = Record<string, string | true>;

export function parseArgs(argv = process.argv.slice(2)): Args {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function req(args: Args, key: string): string {
  const v = args[key];
  if (typeof v !== 'string') throw new Error(`--${key} <value> is required`);
  return v;
}

export function opt(args: Args, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/;

export const isLocalUrl = (url: string) => LOCAL.test(url);

/**
 * Cluster guard. Local URLs pass. A remote URL needs `--confirm-cluster
 * devnet` (spelled out, so a copied command cannot hit a cluster by
 * accident). Mainnet is refused: its deploy goes through the release
 * workflow and a Squads proposal (spec §14.5).
 */
export function guardCluster(url: string, confirm: string | undefined): 'local' | 'devnet' {
  if (isLocalUrl(url)) return 'local';
  if (/mainnet/i.test(url)) throw new Error('mainnet is out of scope for scripts/devnet (spec §14.5 runbook)');
  if (confirm !== 'devnet') {
    throw new Error(`${url} is not local: pass --confirm-cluster devnet to run against devnet`);
  }
  return 'devnet';
}

/** Repo root (scripts/devnet/lib -> ../../..). */
export const REPO_ROOT = resolve(import.meta.dir, '..', '..', '..');

/** Keypair files must live outside the repo (CLAUDE.md). */
export function assertOutsideRepo(path: string, what: string): string {
  const abs = resolve(path);
  if (abs === REPO_ROOT || abs.startsWith(REPO_ROOT + sep)) {
    // target/deploy/*-keypair.json is the one exception: it is gitignored and
    // is the program-id keypair `anchor build` creates.
    if (!abs.startsWith(resolve(REPO_ROOT, 'target', 'deploy') + sep)) {
      throw new Error(`${what} (${abs}) is inside the repository; keep keypairs outside it`);
    }
  }
  return abs;
}
