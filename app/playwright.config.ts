import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests: each route renders against a seeded localnet.
 *
 * global-setup starts a solana-test-validator on its own port, seeds it
 * (scripts/localnet.ts with LOCALNET_STATE_DIR=.localnet-e2e) and serves the
 * BUILT app with `next start` (run `NEXT_PUBLIC_CLUSTER=localnet bun run build`
 * first). global-teardown stops both and asserts with pgrep that nothing is
 * left running. No watch mode, no dev server.
 */
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3210);
export const E2E_RPC_PORT = Number(process.env.E2E_RPC_PORT ?? 18899);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${E2E_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
