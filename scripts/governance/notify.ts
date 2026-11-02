/**
 * Mails the governance watch report through Resend's HTTP API
 * (POST https://api.resend.com/emails, Bearer auth, JSON body with `from`,
 * `to`, `subject`, `text`; resend.com/docs/api-reference/emails/send-email).
 *
 *   bun scripts/governance/notify.ts --report <file> --exit-code <0|1|2>
 *
 * Environment: RESEND_API_KEY (a Resend API key, not a signing key),
 * ALERT_FROM (a sender on a domain verified in Resend), ALERT_TO (comma
 * list, at most 50). Any missing value fails loudly: an alert that cannot be
 * sent must turn the workflow red. The API key is never printed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { opt, parseArgs, type Args } from '../devnet/lib/cli';

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const MAX_RECIPIENTS = 50;

export type AlertConfig = { apiKey: string; from: string; to: string[] };
type Env = Record<string, string | undefined>;

/** Reads the three settings; throws naming every missing one (never echoing the key). */
export function loadAlertConfig(env: Env): AlertConfig {
  const apiKey = env.RESEND_API_KEY?.trim() ?? '';
  const from = env.ALERT_FROM?.trim() ?? '';
  const to = (env.ALERT_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const missing = [!apiKey && 'RESEND_API_KEY (secret)', !from && 'ALERT_FROM (variable)', !to.length && 'ALERT_TO (variable)'].filter(Boolean);
  if (missing.length) {
    throw new Error(`cannot send the governance alert: ${missing.join(', ')} not set. See docs/security/governance-watch.md#alert-settings`);
  }
  if (to.length > MAX_RECIPIENTS) throw new Error(`ALERT_TO lists ${to.length} recipients; Resend accepts at most ${MAX_RECIPIENTS}`);
  for (const a of [from, ...to]) {
    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(a.replace(/^.*<([^>]+)>\s*$/, '$1'))) throw new Error(`"${a}" is not an email address`);
  }
  return { apiKey, from, to };
}

export function subjectFor(exitCode: string, cluster: string): string {
  const what = exitCode === '1' ? 'findings' : exitCode === '2' ? 'watcher could not complete' : `watcher did not run (exit ${exitCode || 'unknown'})`;
  return `[MUTAV governance] ${cluster}: ${what}`;
}

export function buildRequest(cfg: AlertConfig, msg: { subject: string; text: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' };
  if (msg.idempotencyKey) headers['Idempotency-Key'] = msg.idempotencyKey.slice(0, 256);
  return {
    url: RESEND_ENDPOINT,
    init: { method: 'POST', headers, body: JSON.stringify({ from: cfg.from, to: cfg.to, subject: msg.subject, text: msg.text }) },
  };
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Sends and returns Resend's email id; throws on any non-2xx answer, with the key redacted. */
export async function send(cfg: AlertConfig, msg: Parameters<typeof buildRequest>[1], fetchFn: Fetch = fetch as unknown as Fetch): Promise<string> {
  const { url, init } = buildRequest(cfg, msg);
  const redact = (s: string) => s.split(cfg.apiKey).join('[redacted]');
  let res;
  try {
    res = await fetchFn(url, init);
  } catch (e) {
    throw new Error(`Resend request failed: ${redact((e as Error).message)}`);
  }
  const body = await res.text();
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${redact(body).slice(0, 500)}`);
  try {
    return String((JSON.parse(body) as { id?: string }).id ?? '');
  } catch {
    return '';
  }
}

/** The report, or a stand-in when the watcher died before writing one. */
export function reportText(path: string | undefined, exitCode: string, runUrl: string | undefined): string {
  // The report is the watcher's plain-text output, never a key file.
  const body = path && existsSync(path) ? readFileSync(path, 'utf8') : `The governance watcher wrote no report (exit code ${exitCode || 'unknown'}). It failed before or during setup.\n`;
  return runUrl ? `${body}\nWorkflow run: ${runUrl}\n` : body;
}

export async function main(args: Args, env: Env, fetchFn?: Fetch) {
  const cfg = loadAlertConfig(env);
  const exitCode = opt(args, 'exit-code') ?? '';
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : undefined;
  const text = reportText(opt(args, 'report'), exitCode, runUrl);
  const cluster = /^MUTAV governance watch: (\S+)/.exec(text)?.[1] ?? 'devnet';
  const id = await send(
    cfg,
    {
      subject: subjectFor(exitCode, cluster),
      text,
      idempotencyKey: env.GITHUB_RUN_ID ? `governance-watch/${env.GITHUB_RUN_ID}/${env.GITHUB_RUN_ATTEMPT ?? '1'}` : undefined,
    },
    fetchFn,
  );
  console.log(`alert sent to ${cfg.to.length} recipient(s)${id ? ` (Resend id ${id})` : ''}`);
}

if (import.meta.main) {
  try {
    await main(parseArgs(), process.env);
  } catch (err) {
    console.error(`::error::${(err as Error).message}`);
    process.exitCode = 1;
  }
}
