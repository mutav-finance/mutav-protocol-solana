/**
 * Localnet-only harness for scripts/localnet.ts and scripts/seed.ts.
 *
 * - Reuses the protocol's dry-run harness and deploy composers at the repo
 *   root (scripts/devnet/lib/{local,compose,config}.ts) for the validator CLIs,
 *   airdrops, `initialize` and the allowlist root.
 * - Every entry point refuses a non-local RPC URL.
 * - Keys are throwaway localnet keys created by `solana-keygen` in a temp
 *   directory OUTSIDE the repository; only their paths are printed. Nothing
 *   here runs against devnet or mainnet.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import {
  appendTransactionMessageInstructions,
  compileTransaction,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransaction,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { isLocalUrl } from "../../lib/cluster";

export const APP_ROOT = resolve(import.meta.dir, "..", "..");
/** The protocol repo root: `app/` lives inside it. */
export const REPO_ROOT = resolve(APP_ROOT, "..");

/** The protocol checkout with the program build and dry-run scripts: this repo, unless MUTAV_PROTOCOL_DIR overrides it. */
export function protocolDir(): string {
  const candidates = [process.env.MUTAV_PROTOCOL_DIR, REPO_ROOT].filter(Boolean) as string[];
  for (const c of candidates) {
    if (existsSync(join(c, "scripts", "devnet", "lib", "local.ts")) && existsSync(join(c, "target", "deploy", "mutav.so"))) return c;
  }
  throw new Error(
    `no protocol checkout with scripts/devnet/lib/local.ts and target/deploy/mutav.so; tried:\n  ${candidates.join("\n  ")}\n` +
      "Run `anchor build` at the repo root (or set MUTAV_PROTOCOL_DIR to another checkout).",
  );
}

/** The protocol's dry-run harness and deploy composers (typed loosely: they live outside app/). */
export async function protocolLib() {
  const p = protocolDir();
  const local = await import(join(p, "scripts/devnet/lib/local.ts"));
  const compose = await import(join(p, "scripts/devnet/lib/compose.ts"));
  const config = await import(join(p, "scripts/devnet/lib/config.ts"));
  return {
    dir: p,
    programSo: join(p, "target", "deploy", "mutav.so"),
    run: local.run as (cmd: string[], o?: { quiet?: boolean }) => string,
    airdrop: local.airdrop as (rpc: unknown, to: Address, sol: number) => Promise<void>,
    send: local.send as (rpc: unknown, feePayer: KeyPairSigner, ixs: Instruction[]) => Promise<string>,
    assertNoProcess: local.assertNoProcess as (pattern: string) => void,
    composeInitialize: compose.composeInitialize as (cfg: unknown, s: { upgradeAuthority: KeyPairSigner; payer: KeyPairSigner }) => Promise<Instruction>,
    composeSetAllowlistRoot: compose.composeSetAllowlistRoot as (cfg: unknown, root: Uint8Array, admin: KeyPairSigner) => Promise<Instruction>,
    associatedTokenAddress: compose.associatedTokenAddress as (owner: Address, mint: Address) => Promise<Address>,
    TOKEN_PROGRAM: compose.TOKEN_PROGRAM as Address,
    parseConfig: config.parseConfig as (raw: unknown) => unknown,
  };
}

export function assertLocal(url: string): string {
  if (!isLocalUrl(url)) throw new Error(`refusing non-local URL ${url}: scripts/ are localnet-only`);
  return url;
}

export function assertOutsideRepo(path: string, what: string): string {
  const abs = resolve(path);
  if (abs === REPO_ROOT || abs.startsWith(REPO_ROOT + sep)) throw new Error(`${what} (${abs}) is inside the repository; keep keys outside it`);
  return abs;
}

export const defaultKeysDir = () => join(tmpdir(), "mutav-pilot-localnet-keys");

export type Role = "admin" | "operator" | "pauser" | "capital" | "treasuryOwner" | "paymentsOwner" | "deployer";
export const ROLES: Role[] = ["admin", "operator", "pauser", "capital", "treasuryOwner", "paymentsOwner", "deployer"];

/**
 * A throwaway localnet keypair file per role, created with `solana-keygen` if
 * missing, then loaded into an in-memory signer. `override` paths (e.g.
 * --admin-keypair) are used as given.
 */
export async function localKeys(dir: string, run: (cmd: string[], o?: { quiet?: boolean }) => string, override: Partial<Record<Role, string>> = {}) {
  assertOutsideRepo(dir, "keys dir");
  mkdirSync(dir, { recursive: true });
  const out = {} as Record<Role, { path: string; signer: KeyPairSigner }>;
  for (const role of ROLES) {
    const path = override[role] ? assertOutsideRepo(override[role]!, `--${role}-keypair`) : join(dir, `${role}.json`);
    if (!existsSync(path)) run(["solana-keygen", "new", "--no-bip39-passphrase", "--silent", "--force", "-o", path], { quiet: true });
    const bytes = new Uint8Array(JSON.parse(readFileSync(path, "utf8")));
    out[role] = { path, signer: await createKeyPairSignerFromBytes(bytes) };
  }
  return out;
}

export type LocalRpc = ReturnType<typeof createSolanaRpc>;

/** Compile, sign with local keys, send and confirm. For instructions composed with no-op signers. */
export async function signAndSend(rpc: LocalRpc, feePayer: Address, signers: KeyPairSigner[], ixs: Instruction[]): Promise<string> {
  const { value } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(value, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  const tx = await signTransaction(
    signers.map((s) => s.keyPair),
    compileTransaction(msg),
  );
  const sig = getSignatureFromTransaction(tx);
  try {
    await rpc.sendTransaction(getBase64EncodedWireTransaction(tx), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  } catch (e) {
    const logs = (e as { context?: { logs?: string[] } }).context?.logs;
    throw new Error(`${(e as Error).message}${logs ? "\n" + logs.join("\n") : ""}`);
  }
  for (let i = 0; i < 120; i++) {
    const { value: st } = await rpc.getSignatureStatuses([sig]).send();
    const s = st[0];
    if (s?.err) throw new Error(`transaction ${sig} failed: ${JSON.stringify(s.err, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`);
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return sig;
    await Bun.sleep(250);
  }
  throw new Error(`transaction ${sig} not confirmed`);
}

export async function waitForRpc(url: string, timeoutMs = 120_000) {
  const rpc = createSolanaRpc(assertLocal(url));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await rpc.getSlot().send()) > 0n) return rpc;
    } catch {
      /* not up yet */
    }
    await Bun.sleep(500);
  }
  throw new Error(`validator at ${url} did not come up in ${timeoutMs} ms`);
}
