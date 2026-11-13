/**
 * Governance watcher (docs/security/governance-watch.md): a stateless,
 * read-only comparison of the chain against
 * `governance/expected-state.<cluster>.json`. Run on a schedule by
 * .github/workflows/governance-watch.yml; any finding or run error is mailed
 * by scripts/governance/notify.ts.
 *
 *   bun scripts/governance/watch.ts --expected governance/expected-state.devnet.json \
 *     --url <rpc> --confirm-cluster devnet [--report <file>]
 *
 * `--url` falls back to the RPC_URL environment variable. Mainnet is refused
 * by the shared cluster guard.
 *
 * Exit codes: 0 no findings; 1 findings; 2 the watcher could not complete
 * (bad expected-state, RPC error, refused cluster). Silence is not success:
 * the workflow alerts on 1 and 2 alike.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertConfigCluster, guardCluster, opt, parseArgs, REPO_ROOT, type Args } from '../devnet/lib/cli';
import { checkConfig, checkMultisig, checkNonces, checkOutflows, checkProgram, checkProposals, type Finding } from './lib/checks';
import { parseExpectedState, type ExpectedState } from './lib/expected';
import { kitSource, type WatchSource } from './lib/source';

export type RunResult = { findings: Finding[]; errors: { check: string; message: string }[]; ran: string[] };

/** Runs every check; one failing check does not stop the others. */
export async function runChecks(
  src: WatchSource,
  e: ExpectedState,
  o: { nowSecs: number; intentExists: (path: string) => boolean },
): Promise<RunResult> {
  const r: RunResult = { findings: [], errors: [], ran: [] };
  const run = async (check: string, f: () => Promise<Finding[] | void>) => {
    try {
      const out = await f();
      if (out) r.findings.push(...out);
      r.ran.push(check);
    } catch (err) {
      r.errors.push({ check, message: (err as Error).message ?? String(err) });
    }
  };
  for (const [label, m] of Object.entries(e.multisigs)) {
    let index: bigint | null = null;
    await run(`multisig ${label}`, async () => {
      const { findings, decoded } = await checkMultisig(src, label, m);
      index = decoded?.transactionIndex ?? null;
      return findings;
    });
    const at = index;
    if (at === null) r.errors.push({ check: `proposals ${label}`, message: 'skipped: the multisig account could not be read' });
    else await run(`proposals ${label}`, () => checkProposals(src, e.cluster, label, m, at, o.intentExists));
  }
  await run('program', () => checkProgram(src, e.program));
  await run('config', () => checkConfig(src, e));
  const members = [...e.multisigs.admin.members, ...e.multisigs.upgrade.members].map((x) => x.key);
  await run('nonces', () => checkNonces(src, members));
  let summary = '';
  await run('outflows', async () => {
    const s = await checkOutflows(src, e.reserve, o.nowSecs);
    summary = `outflows (${s.scanned} transaction(s) in the window, ${s.total} base units out)`;
    return s.findings;
  });
  const i = r.ran.indexOf('outflows');
  if (i >= 0) r.ran[i] = summary;
  return r;
}

export function exitCode(r: Pick<RunResult, 'findings' | 'errors'>): 0 | 1 | 2 {
  if (r.errors.length) return 2;
  return r.findings.length ? 1 : 0;
}

/** Plain-text report. `redact` strips the RPC URL (its path can hold an API token). */
export function formatReport(
  r: RunResult,
  meta: { cluster: string; rpcHost: string; expectedPath: string; at: Date },
  redact: (s: string) => string = (s) => s,
): string {
  const code = exitCode(r);
  const status = code === 0 ? 'OK, no findings' : code === 1 ? `FINDINGS (${r.findings.length})` : `COULD NOT COMPLETE (${r.errors.length} error(s), ${r.findings.length} finding(s))`;
  const lines = [
    `MUTAV governance watch: ${meta.cluster}`,
    `Time: ${meta.at.toISOString()}`,
    `RPC host: ${meta.rpcHost}`,
    `Expected state: ${meta.expectedPath}`,
    `Result: ${status}`,
    '',
  ];
  for (const sev of ['CRITICAL', 'HIGH'] as const) {
    const fs = r.findings.filter((f) => f.severity === sev);
    if (!fs.length) continue;
    lines.push(sev);
    for (const f of fs) lines.push(`- [${f.check}] ${redact(f.message)}`);
    lines.push('');
  }
  if (r.errors.length) {
    lines.push('ERRORS (these checks did not complete; treat this run as an alert)');
    for (const e of r.errors) lines.push(`- [${e.check}] ${redact(e.message)}`);
    lines.push('');
  }
  lines.push('Checks completed:');
  for (const c of r.ran) lines.push(`- ${c}`);
  if (code !== 0) {
    lines.push('', 'What to do: docs/security/governance-watch.md (findings) and docs/security/signing-ceremony.md (proposals).');
  }
  return lines.join('\n') + '\n';
}

export async function main(args: Args): Promise<0 | 1 | 2> {
  const expectedPath = opt(args, 'expected') ?? 'governance/expected-state.devnet.json';
  const reportPath = opt(args, 'report');
  const raw = opt(args, 'url') ?? process.env.RPC_URL;
  let host = '(unknown)';
  let url = '';
  const redact = (s: string) => (url ? s.split(url).join(host) : s);
  const emit = (text: string) => {
    process.stdout.write(text);
    if (reportPath) writeFileSync(reportPath, text);
  };
  const at = new Date();
  let e: ExpectedState;
  try {
    // The expected state is JSON in the repo: addresses and parameters, never keys.
    e = parseExpectedState(JSON.parse(readFileSync(resolve(expectedPath), 'utf8')));
    try {
      host = new URL(String(raw)).host;
    } catch {
      /* the guard reports the bad URL */
    }
    const guarded = await guardCluster(raw, opt(args, 'confirm-cluster'));
    assertConfigCluster(guarded, e.cluster);
    url = guarded.url;
  } catch (err) {
    emit(
      formatReport(
        { findings: [], errors: [{ check: 'setup', message: (err as Error).message }], ran: [] },
        { cluster: '(unknown)', rpcHost: host, expectedPath, at },
        redact,
      ),
    );
    return 2;
  }
  const r = await runChecks(kitSource(url), e, {
    nowSecs: Math.floor(at.getTime() / 1000),
    intentExists: (p) => existsSync(join(REPO_ROOT, p)),
  });
  emit(formatReport(r, { cluster: e.cluster, rpcHost: host, expectedPath, at }, redact));
  return exitCode(r);
}

if (import.meta.main) {
  try {
    process.exitCode = await main(parseArgs());
  } catch (err) {
    console.error(`governance watch could not run: ${(err as Error).message}`);
    process.exitCode = 2;
  }
}
