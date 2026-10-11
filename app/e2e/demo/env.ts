/**
 * Capture settings, from env (TEST-ONLY). The same harness runs against the
 * seeded localnet (default) or devnet by changing env only:
 *
 *   DEMO_CLUSTER   localnet (default) | devnet
 *   DEMO_BASE_URL  the app; localnet default http://127.0.0.1:3001 (served by global-setup)
 *   DEMO_RPC_URL   the RPC the test wallet signs/sends against; localnet: read from the seeded env
 *   DEMO_PARAMS    localnet seed config: storyboard (c = 0.10, default) | adr0028 (c = 0.25)
 *   DEMO_DPR       device scale factor, 2 (3840×2160 frames, default) or 1
 *   DEMO_PACE      pause multiplier (1 = recording pace, 0 = fast dry run)
 *   DEMO_ONLY      comma list of beat names to capture (default: all)
 *   DEMO_OUT_DIR   output root (default: <workspace>/.claude/notes/demo-capture)
 *   DEMO_RUN_ID    run folder name (default: a timestamp)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DemoCluster } from "./wallets";

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const STATE_DIR = ".localnet-demo";
export const SERVER_PID = join(APP_ROOT, STATE_DIR, "next.pid");
export const DEMO_PORT = 3001;
export const DEMO_RPC_PORT = Number(process.env.DEMO_RPC_PORT ?? 18999);

export const CLUSTER = (process.env.DEMO_CLUSTER ?? "localnet") as DemoCluster;
if (CLUSTER !== "localnet" && CLUSTER !== "devnet") throw new Error(`DEMO_CLUSTER must be localnet or devnet (mainnet is refused), got ${CLUSTER}`);

export const BASE_URL = process.env.DEMO_BASE_URL ?? `http://127.0.0.1:${DEMO_PORT}`;
export const DPR = Number(process.env.DEMO_DPR ?? 2);
export const VIEWPORT = { width: 1920, height: 1080 };
export const ONLY = process.env.DEMO_ONLY ? new Set(process.env.DEMO_ONLY.split(",").map((s) => s.trim())) : null;

export function readEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

export function rpcUrl(): string {
  if (process.env.DEMO_RPC_URL) return process.env.DEMO_RPC_URL;
  if (CLUSTER === "devnet") throw new Error("DEMO_RPC_URL is required on devnet (the RPC the test wallet sends through)");
  const env = join(APP_ROOT, STATE_DIR, "env");
  if (!existsSync(env)) throw new Error(`no ${STATE_DIR}/env: is the demo localnet up?`);
  return readEnvFile(env).RPC_URL!;
}

/** <workspace>/.claude/notes/demo-capture: the workspace is the parent of the main checkout. */
export function outRoot(): string {
  if (process.env.DEMO_OUT_DIR) return resolve(process.env.DEMO_OUT_DIR);
  const common = resolve(APP_ROOT, execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: APP_ROOT, encoding: "utf8" }).trim());
  return join(dirname(dirname(common)), ".claude", "notes", "demo-capture");
}

export const runId = () => process.env.DEMO_RUN_ID ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
