/**
 * Demo capture teardown (TEST-ONLY): stop the next server and the localnet,
 * assert with pgrep that nothing is left, then encode the clips (after the
 * heavy processes are gone, so ffmpeg is the only one running).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { CLUSTER, DEMO_PORT, DEMO_RPC_PORT, SERVER_PID } from "./env";
import { encodeRun } from "./encode";
import { localnet } from "./global-setup";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function pgrep(pattern: string): string[] {
  try {
    return execFileSync("pgrep", ["-f", pattern], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

export default async function globalTeardown() {
  if (CLUSTER === "localnet") {
    if (existsSync(SERVER_PID)) {
      const pid = Number(readFileSync(SERVER_PID, "utf8"));
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        /* gone */
      }
      for (let i = 0; i < 20 && pgrep(`next start -p ${DEMO_PORT}`).length; i++) await sleep(250);
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* gone */
      }
    }
    localnet("down");
    const left = [...pgrep(`next start -p ${DEMO_PORT}`), ...pgrep(`solana-test-validator.*--rpc-port ${DEMO_RPC_PORT}`)];
    if (left.length) throw new Error(`processes left running after the capture: ${left.join(" ")}`);
    console.log(`teardown: no next server on ${DEMO_PORT}, no validator on ${DEMO_RPC_PORT}`);
  }
  const runDir = process.env.DEMO_RUN_DIR;
  if (runDir && process.env.DEMO_SKIP_ENCODE !== "1") {
    encodeRun(runDir);
    console.log(`manifest: ${runDir}/manifest.json`);
  }
}
