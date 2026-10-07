import { spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { E2E_PORT, E2E_RPC_PORT } from "../playwright.config";
import { localnet, pgrep, ROOT, SERVER_PID, STATE_DIR } from "./procs";

function readEnv(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

export default async function globalSetup() {
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) throw new Error("no build: run `NEXT_PUBLIC_CLUSTER=localnet bun run build` first");
  if (pgrep(`solana-test-validator.*--rpc-port ${E2E_RPC_PORT}`).length) throw new Error(`a validator already runs on ${E2E_RPC_PORT}`);

  localnet("up", ["--port", String(E2E_RPC_PORT), "--keys-dir", join(tmpdir(), "mutav-pilot-e2e-keys")]);
  const env = readEnv(join(ROOT, STATE_DIR, "env"));

  const log = openSync(join(ROOT, STATE_DIR, "next.log"), "a");
  const server = spawn(join(ROOT, "node_modules", ".bin", "next"), ["start", "-p", String(E2E_PORT), "-H", "127.0.0.1"], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, ...env },
  });
  server.unref();
  writeFileSync(SERVER_PID, String(server.pid));

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${E2E_PORT}/api/reserve`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`next start did not serve /api/reserve within 60 s; see ${STATE_DIR}/next.log`);
}
