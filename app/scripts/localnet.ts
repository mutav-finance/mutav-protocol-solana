/**
 * A seeded local validator for the demo and the Playwright smoke test.
 *
 *   bun scripts/localnet.ts up   [--port 8899] [--keys-dir DIR] [--admin-keypair PATH] [--operator PUBKEY]
 *   bun scripts/localnet.ts scenario under-covered|normal
 *   bun scripts/localnet.ts down
 *
 * `up` starts solana-test-validator (detached, ledger in a temp dir outside
 * the repo) with the MUTAV program preloaded at its declared id and the admin
 * key as upgrade authority, seeds it (scripts/seed.ts), and writes
 * `.localnet/env` (addresses only, no keys) and `.localnet/state.json`.
 * `down` stops it, deletes the ledger and asserts with pgrep that no
 * validator is left on the port. Localnet only.
 *
 * `up` refuses a port where anything already answers JSON-RPC (another
 * validator, Surfpool, a forgotten localnet), fails at once if the validator
 * exits during startup, and on a failed seed keeps `validator.log` in the
 * temp dir and prints its tail before stopping the validator. The seed's
 * transactions are re-sent until they land (scripts/devnet/lib/local.ts).
 */
import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { APP_ROOT, defaultKeysDir, localKeys, protocolLib, waitForRpc } from "./lib/local";
import { seed, setScenario } from "./seed";

// LOCALNET_STATE_DIR lets the Playwright run keep its own state next to a manual localnet.
const STATE_DIR = process.env.LOCALNET_STATE_DIR ? join(APP_ROOT, process.env.LOCALNET_STATE_DIR) : join(APP_ROOT, ".localnet");
const STATE = join(STATE_DIR, "state.json");

type State = { pid: number; port: number; url: string; ledger: string; keysDir: string; config: string; operator: string; allowlist: string[] };

function args() {
  const a = process.argv.slice(3);
  const out: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) if (a[i]!.startsWith("--")) out[a[i]!.slice(2)] = a[i + 1] ?? "";
  return out;
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** `true` if anything answers JSON-RPC at `url` (any validator, Surfpool, …). */
async function rpcAnswers(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      signal: AbortSignal.timeout(1_000),
    });
    return true;
  } catch {
    return false;
  }
}

/** Keeps a failed run's validator log (the ledger is deleted) and prints its tail. */
function keepLog(ledger: string): string | null {
  const log = join(ledger, "validator.log");
  if (!existsSync(log)) return null;
  const kept = join(tmpdir(), `mutav-localnet-failed-${Date.now()}.log`);
  copyFileSync(log, kept);
  const tail = readFileSync(kept, "utf8").trimEnd().split("\n").slice(-25).join("\n");
  console.error(`--- validator.log (last 25 lines; full log kept at ${kept}) ---\n${tail}\n---`);
  return kept;
}

function pgrep(pattern: string): string {
  const p = Bun.spawnSync(["pgrep", "-f", pattern], { stdout: "pipe" });
  return p.stdout.toString().trim();
}

async function up() {
  const a = args();
  if (existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, "utf8")) as State;
    if (alive(s.pid)) throw new Error(`a localnet is already running (pid ${s.pid}); run \`bun run localnet:down\` first`);
  }
  const port = Number(a.port ?? 8899);
  const url = `http://127.0.0.1:${port}`;
  if (pgrep(`solana-test-validator.*--rpc-port ${port}`)) throw new Error(`a solana-test-validator already listens on ${port}`);
  // Anything else serving JSON-RPC on the port (Surfpool, a validator started
  // by hand) would answer waitForRpc and receive the seed instead.
  if (await rpcAnswers(url)) throw new Error(`something already serves JSON-RPC on ${url} (another validator or Surfpool?); stop it or pass --port`);
  const p = await protocolLib();
  const keysDir = a["keys-dir"] || defaultKeysDir();
  const keys = await localKeys(keysDir, p.run, a["admin-keypair"] ? { admin: a["admin-keypair"] } : {});
  const ledger = mkdtempSync(join(tmpdir(), "mutav-pilot-ledger-"));
  const logFd = openSync(join(ledger, "validator.log"), "a");
  const child = spawn(
    "solana-test-validator",
    [
      "--ledger", join(ledger, "ledger"),
      "--reset",
      "--quiet",
      "--bind-address", "127.0.0.1",
      "--rpc-port", String(port),
      "--faucet-port", String(port + 1001),
      "--gossip-port", String(port + 2),
      "--dynamic-port-range", `${port + 3}-${port + 40}`,
      "--mint", keys.deployer.signer.address,
      "--upgradeable-program", MUTAV_PROGRAM_ADDRESS, p.programSo, keys.admin.signer.address,
    ],
    { detached: true, stdio: ["ignore", logFd, logFd] },
  );
  // A validator that cannot start (a port taken, a bad flag) exits at once;
  // report that instead of waiting for an RPC that never comes.
  const died = new Promise<never>((_, reject) =>
    child.once("exit", (code, signal) => reject(new Error(`solana-test-validator exited during startup (${code ?? signal})`))),
  );
  died.catch(() => undefined);
  child.unref();
  const pid = child.pid!;
  mkdirSync(STATE_DIR, { recursive: true });
  const partial = { pid, port, url, ledger, keysDir, config: "", operator: "", allowlist: [] as string[] };
  writeFileSync(STATE, JSON.stringify(partial, null, 2));
  console.log(`solana-test-validator pid ${pid} at ${url} (program ${MUTAV_PROGRAM_ADDRESS} from ${p.programSo})`);
  try {
    await Promise.race([waitForRpc(url), died]);
    if (!alive(pid)) throw new Error("solana-test-validator exited during startup");
    const r = await seed({ url, keysDir, adminKeypair: a["admin-keypair"], operator: a.operator });
    const state: State = { ...partial, config: r.config, operator: r.operator, allowlist: r.allowlist };
    writeFileSync(STATE, JSON.stringify(state, null, 2));
    writeFileSync(
      join(STATE_DIR, "env"),
      [
        "# Written by scripts/localnet.ts — addresses only, no keys.",
        "NEXT_PUBLIC_CLUSTER=localnet",
        `RPC_URL=${url}`,
        `PROGRAM_ID=${MUTAV_PROGRAM_ADDRESS}`,
        `CONFIG_ADDRESS=${r.config}`,
        `ALLOWLIST=${r.allowlist.join(",")}`,
        "SQUADS_MULTISIG=",
        "",
      ].join("\n"),
    );
    console.log(`\nSeeded. VaultConfig ${r.config}`);
    console.log("Throwaway localnet keys (outside the repo; import into a wallet to act as each role):");
    for (const [role, v] of Object.entries(r.keys)) console.log(`  ${role.padEnd(14)} ${v.address}  ${v.path}`);
    const rel = STATE_DIR.slice(APP_ROOT.length + 1);
    console.log(`\nApp env: ${rel}/env  →  cp ${rel}/env .env.local && bun run dev`);
  } catch (e) {
    console.error("seed failed; stopping the validator.");
    keepLog(ledger);
    await down();
    throw e;
  }
}

async function down() {
  if (!existsSync(STATE)) {
    console.log("no localnet state; nothing to stop");
    return;
  }
  const s = JSON.parse(readFileSync(STATE, "utf8")) as State;
  if (alive(s.pid)) {
    process.kill(s.pid, "SIGTERM");
    for (let i = 0; i < 40 && alive(s.pid); i++) await Bun.sleep(250);
    if (alive(s.pid)) process.kill(s.pid, "SIGKILL");
    for (let i = 0; i < 20 && alive(s.pid); i++) await Bun.sleep(250);
  }
  rmSync(s.ledger, { recursive: true, force: true });
  rmSync(STATE_DIR, { recursive: true, force: true });
  const left = pgrep(`solana-test-validator.*--rpc-port ${s.port}`);
  if (left) throw new Error(`still running on port ${s.port}: ${left.replace(/\n/g, " ")}`);
  console.log(`validator ${s.pid} stopped; ledger removed; pgrep finds no solana-test-validator on ${s.port}`);
}

async function scenario() {
  const which = process.argv[3];
  if (which !== "under-covered" && which !== "normal") throw new Error("usage: localnet.ts scenario under-covered|normal");
  const s = JSON.parse(readFileSync(STATE, "utf8")) as State;
  await setScenario(s.url, s.keysDir, which, s.config);
  console.log(`scenario: ${which}`);
}

const cmd = process.argv[2];
if (cmd === "up") await up();
else if (cmd === "down") await down();
else if (cmd === "scenario") await scenario();
else {
  console.error("usage: bun scripts/localnet.ts up|down|scenario");
  process.exit(1);
}
process.exit(0);
