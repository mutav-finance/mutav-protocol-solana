import { existsSync, readFileSync } from "node:fs";
import { E2E_PORT, E2E_RPC_PORT } from "../playwright.config";
import { localnet, pgrep, SERVER_PID } from "./procs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default async function globalTeardown() {
  if (existsSync(SERVER_PID)) {
    const pid = Number(readFileSync(SERVER_PID, "utf8"));
    try {
      process.kill(-pid, "SIGTERM"); // the whole process group (next start + its workers)
    } catch {
      /* already gone */
    }
    for (let i = 0; i < 20 && pgrep(`next start -p ${E2E_PORT}`).length; i++) await sleep(250);
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* gone */
    }
  }
  localnet("down"); // stops the validator and asserts pgrep finds none on its port

  const left = [...pgrep(`next start -p ${E2E_PORT}`), ...pgrep(`solana-test-validator.*--rpc-port ${E2E_RPC_PORT}`)];
  if (left.length) throw new Error(`processes left running after the smoke run: ${left.join(" ")}`);
  console.log(`teardown: pgrep finds no next server on ${E2E_PORT} and no validator on ${E2E_RPC_PORT}`);
}
