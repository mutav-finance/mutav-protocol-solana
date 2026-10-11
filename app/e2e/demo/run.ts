/**
 * `bun run demo:capture`: one command for the demo-video capture (TEST-ONLY).
 *
 * Refuses to start when the 1-min load is above 10. On localnet it builds the
 * app for localnet when the last build was not (marker .next/demo-cluster),
 * then runs the scenarios (playwright.demo.config.ts: one worker), whose
 * global setup/teardown start and stop the seeded localnet and the server on
 * 3001 and encode the clips. Every step exits on its own.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { join } from "node:path";
import { APP_ROOT, CLUSTER } from "./env";

const load = loadavg()[0]!;
if (load > 10) {
  console.error(`1-min load is ${load.toFixed(1)} (> 10): try again later`);
  process.exit(1);
}

if (CLUSTER === "localnet" && !process.env.DEMO_BASE_URL) {
  const marker = join(APP_ROOT, ".next", "demo-cluster");
  const built = existsSync(join(APP_ROOT, ".next", "BUILD_ID")) && existsSync(marker) && readFileSync(marker, "utf8").trim() === "localnet";
  if (!built || process.env.DEMO_BUILD === "1") {
    console.log("building the app for localnet (next build)…");
    execFileSync(join(APP_ROOT, "node_modules", ".bin", "next"), ["build"], { cwd: APP_ROOT, stdio: "inherit", env: { ...process.env, NEXT_PUBLIC_CLUSTER: "localnet" } });
    writeFileSync(marker, "localnet\n");
  }
}

try {
  execFileSync(join(APP_ROOT, "node_modules", ".bin", "playwright"), ["test", "-c", "e2e/demo/playwright.demo.config.ts", "--workers=1", ...process.argv.slice(2)], { cwd: APP_ROOT, stdio: "inherit" });
} catch {
  process.exit(1);
}
