/**
 * Demo capture setup (TEST-ONLY).
 *
 * localnet: refuses to start when the 1-min load is above 10; makes the role
 * wallets; starts the repo's localnet (`scripts/localnet.ts up --seed demo`)
 * on its own port with those wallets as the role keys; funds the viewer;
 * serves the BUILT app with `next start` on 3001.
 * devnet: starts nothing; checks DEMO_BASE_URL answers and the RPC is devnet.
 * Both: create the run folder and pass it to the scenarios (DEMO_RUN_DIR).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";
import { APP_ROOT, BASE_URL, CLUSTER, DEMO_PORT, DEMO_RPC_PORT, DPR, outRoot, readEnvFile, rpcUrl, runId, SERVER_PID, STATE_DIR } from "./env";
import { assertSafeCluster } from "./signer";
import { ensureWallets, tightenPermissions, walletDir, walletPath } from "./wallets";

function pgrep(pattern: string): string[] {
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function localnet(cmd: "up" | "down", extra: string[] = []) {
  execFileSync("bun", ["scripts/localnet.ts", cmd, ...extra], { cwd: APP_ROOT, stdio: "inherit", env: { ...process.env, LOCALNET_STATE_DIR: STATE_DIR } });
}

async function rpc<T>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return ((await r.json()) as { result: T }).result;
}

async function waitFor(url: string, ms: number) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`${url} did not answer within ${ms / 1000} s`);
}

export default async function globalSetup() {
  const load = loadavg()[0]!;
  if (load > 10) throw new Error(`1-min load is ${load.toFixed(1)} (> 10): not starting a capture run now`);

  const wallets = ensureWallets(CLUSTER);
  const runDir = join(outRoot(), runId());
  mkdirSync(join(runDir, "clips"), { recursive: true });
  process.env.DEMO_RUN_DIR = runDir;

  if (CLUSTER === "localnet") {
    if (!existsSync(join(APP_ROOT, ".next", "BUILD_ID"))) throw new Error("no build: run `NEXT_PUBLIC_CLUSTER=localnet bun run build` first (or `bun run demo:capture`, which builds when missing)");
    if (pgrep(`next start -p ${DEMO_PORT}`).length) throw new Error(`a next server already runs on ${DEMO_PORT}`);
    try {
      await fetch(`http://127.0.0.1:${DEMO_PORT}`, { signal: AbortSignal.timeout(1000) });
      throw new Error(`port ${DEMO_PORT} is taken`);
    } catch (e) {
      if ((e as Error).message.includes("is taken")) throw e;
    }
    localnet("up", ["--seed", "demo", "--port", String(DEMO_RPC_PORT), "--keys-dir", walletDir("localnet"), "--admin-keypair", walletPath("localnet", "squads1")]);
    tightenPermissions("localnet");
    const env = readEnvFile(join(APP_ROOT, STATE_DIR, "env"));
    // The viewer sends the permissionless refresh; the second Squads stand-in only needs fees.
    for (const role of ["viewer", "squads2"] as const) {
      const sig = await rpc<string>(env.RPC_URL!, "requestAirdrop", [wallets[role].address, 2_000_000_000]);
      for (let i = 0; i < 40; i++) {
        const st = await rpc<{ value: ({ confirmationStatus?: string } | null)[] }>(env.RPC_URL!, "getSignatureStatuses", [[sig]]);
        if (st.value[0]?.confirmationStatus) break;
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    const log = openSync(join(APP_ROOT, STATE_DIR, "next.log"), "a");
    const server = spawn(join(APP_ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(DEMO_PORT), "-H", "127.0.0.1"], {
      cwd: APP_ROOT,
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, ...env },
    });
    server.unref();
    writeFileSync(SERVER_PID, String(server.pid));
    await waitFor(`${BASE_URL}/api/reserve`, 60_000);
  } else {
    await waitFor(`${BASE_URL}/api/reserve`, 30_000);
  }
  const genesis = await assertSafeCluster(rpcUrl(), CLUSTER);
  writeFileSync(
    join(runDir, "run.json"),
    JSON.stringify(
      {
        runId: runId(),
        cluster: CLUSTER,
        params: CLUSTER === "localnet" ? (process.env.DEMO_PARAMS ?? "storyboard") : "deployed config",
        baseUrl: BASE_URL,
        rpcHost: new URL(rpcUrl()).host,
        genesis,
        dpr: DPR,
        viewport: "1920x1080",
        startedAt: new Date().toISOString(),
        wallets: Object.fromEntries(Object.entries(wallets).map(([r, v]) => [r, v.address])),
      },
      null,
      2,
    ),
  );
  console.log(`demo capture → ${runDir}`);
}
