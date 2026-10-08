/**
 * Local-only harness for the dry run and the Surfpool fork test: start and
 * stop a local cluster, run the Solana CLIs, and send transactions signed by
 * throwaway in-memory keys. Every function refuses a non-local URL; nothing
 * here reads a key file (the deployer keypair is created by `solana-keygen`
 * in a temp dir and only its *path* is handed to the Solana CLI).
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type Rpc,
  type SolanaRpcApi,
  type TransactionSigner,
} from '@solana/kit';
import { isLocalUrl } from './cli';

/** Local clusters serve the test-cluster API (airdrops included). */
export type LocalRpc = Rpc<SolanaRpcApi>;

function assertLocal(url: string) {
  if (!isLocalUrl(url)) throw new Error(`refusing non-local URL ${url}`);
}

export function tempDir(prefix: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, remove: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Run a CLI to completion; throw with its output on failure. */
export function run(cmd: string[], opts: { quiet?: boolean } = {}): string {
  const p = Bun.spawnSync(cmd, { stdout: 'pipe', stderr: 'pipe' });
  const out = p.stdout.toString() + p.stderr.toString();
  if (p.exitCode !== 0) throw new Error(`${cmd.slice(0, 3).join(' ')} … failed (${p.exitCode}):\n${out}`);
  if (!opts.quiet) process.stdout.write(out);
  return p.stdout.toString();
}

/** A local cluster process (solana-test-validator or surfpool) with guaranteed cleanup. */
export class LocalCluster {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  readonly rpc: LocalRpc;

  constructor(
    readonly url: string,
    private readonly cmd: string[],
    private readonly logPath: string,
    private readonly cwd?: string,
  ) {
    assertLocal(url);
    this.rpc = createSolanaRpc(url) as unknown as LocalRpc;
  }

  async start(timeoutMs = 120_000) {
    this.proc = Bun.spawn(this.cmd, {
      cwd: this.cwd,
      stdout: Bun.file(this.logPath),
      stderr: Bun.file(this.logPath + '.err'),
    });
    const stop = () => this.stopSync();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    process.once('exit', stop);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.proc.exitCode !== null) throw new Error(`${this.cmd[0]} exited early (${this.proc.exitCode}); see ${this.logPath}`);
      try {
        const slot = await this.rpc.getSlot().send();
        if (slot > 0n) return;
      } catch {
        /* not up yet */
      }
      await Bun.sleep(500);
    }
    throw new Error(`${this.cmd[0]} did not come up in ${timeoutMs} ms; see ${this.logPath}`);
  }

  get pid() {
    return this.proc?.pid ?? null;
  }

  private stopSync() {
    if (this.proc && this.proc.exitCode === null) this.proc.kill('SIGKILL');
  }

  /** SIGTERM, then SIGKILL after 10 s; resolves once the process is gone. */
  async stop() {
    const p = this.proc;
    if (!p || p.exitCode !== null) return;
    p.kill('SIGTERM');
    const done = await Promise.race([p.exited.then(() => true), Bun.sleep(10_000).then(() => false)]);
    if (!done) {
      p.kill('SIGKILL');
      await p.exited;
    }
  }
}

export async function airdrop(rpc: LocalRpc, to: Address, sol: number) {
  const sig = await rpc.requestAirdrop(to, lamports(BigInt(sol * 1e9))).send();
  await confirm(rpc, sig);
}

/** How long a local transaction may take to confirm before it is reported. */
export const CONFIRM_TIMEOUT_MS = 90_000;
/** How often an unconfirmed transaction is sent again. */
const RESEND_EVERY_MS = 2_000;

/**
 * Waits for `confirmed`. With `resend`, re-sends the signed transaction every
 * 2 s (skipping preflight) until it lands or its blockhash expires: a
 * validator starved of CPU, or still warming up, can drop a transaction that
 * the RPC accepted, and a single send then never confirms. The error names
 * the validator's slot, so a stalled validator is obvious.
 */
export async function confirm(
  rpc: LocalRpc,
  sig: string,
  resend?: { wire: string; lastValidBlockHeight: bigint },
) {
  const start = Date.now();
  let lastResend = start;
  while (Date.now() - start < CONFIRM_TIMEOUT_MS) {
    const { value } = await rpc.getSignatureStatuses([sig as never]).send();
    const s = value[0];
    if (s?.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(s.err, (_, v) => (typeof v === 'bigint' ? v.toString() : v))}`);
    if (s && (s.confirmationStatus === 'confirmed' || s.confirmationStatus === 'finalized')) return;
    if (resend && Date.now() - lastResend >= RESEND_EVERY_MS) {
      lastResend = Date.now();
      const height = await rpc.getBlockHeight({ commitment: 'confirmed' }).send();
      if (height > resend.lastValidBlockHeight) throw new Error(`transaction ${sig} expired (blockhash too old) without landing`);
      await rpc
        .sendTransaction(resend.wire as never, { encoding: 'base64', skipPreflight: true })
        .send()
        .catch(() => undefined);
    }
    await Bun.sleep(250);
  }
  const slot = await rpc.getSlot({ commitment: 'processed' }).send().catch(() => null);
  throw new Error(
    `transaction ${sig} not confirmed in ${CONFIRM_TIMEOUT_MS / 1000} s; the validator is at slot ${slot ?? 'unknown'} (a slot that does not move means the validator is stalled or starved of CPU)`,
  );
}

/** Sign with in-memory test signers and send to the local cluster. */
export async function send(rpc: LocalRpc, feePayer: TransactionSigner, ixs: Instruction[]): Promise<string> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: 'confirmed' }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const tx = await signTransactionMessageWithSigners(msg);
  const sig = getSignatureFromTransaction(tx);
  const wire = getBase64EncodedWireTransaction(tx);
  try {
    await rpc.sendTransaction(wire, { encoding: 'base64', preflightCommitment: 'confirmed' }).send();
  } catch (e) {
    const logs = (e as { context?: { logs?: string[] } }).context?.logs;
    throw new Error(`${(e as Error).message}${logs ? '\n' + logs.join('\n') : ''}`);
  }
  await confirm(rpc, sig, { wire, lastValidBlockHeight: blockhash.lastValidBlockHeight });
  return sig;
}

/** No process matching `pattern` is left running. */
export function assertNoProcess(pattern: string) {
  const p = Bun.spawnSync(['pgrep', '-f', pattern], { stdout: 'pipe' });
  const pids = p.stdout.toString().trim();
  if (pids) throw new Error(`still running (${pattern}): ${pids.replace(/\n/g, ' ')}`);
}
