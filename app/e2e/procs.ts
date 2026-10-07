import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const STATE_DIR = ".localnet-e2e";
export const SERVER_PID = join(ROOT, STATE_DIR, "next.pid");

/** pgrep -f, as a list of pids (empty when nothing matches). */
export function pgrep(pattern: string): string[] {
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export function localnet(cmd: "up" | "down", extra: string[] = []) {
  execFileSync("bun", ["scripts/localnet.ts", cmd, ...extra], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, LOCALNET_STATE_DIR: STATE_DIR },
  });
}
