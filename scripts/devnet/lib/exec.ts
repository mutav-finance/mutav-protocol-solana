/**
 * Runs the Solana CLIs for every script (deploy.ts included, against devnet).
 * Kept out of the local-only harness in local.ts, which the key check
 * allowlists, so this module is scanned like any other.
 */

/** Run a CLI to completion; throw with its output on failure. */
export function run(cmd: string[], opts: { quiet?: boolean } = {}): string {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const out = p.stdout.toString() + p.stderr.toString();
  if (p.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} … failed (${p.exitCode}):\n${out}`);
  if (!opts.quiet) process.stdout.write(out);
  return p.stdout.toString();
}
