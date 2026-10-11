import { defineConfig } from "@playwright/test";
import { BASE_URL, DPR, VIEWPORT } from "./env";

/**
 * Demo-video capture (not a test suite): `bun run demo:capture`.
 * One worker, scenarios in storyboard order, no retries (a retry would
 * replay on-chain actions), no watch mode. See e2e/demo/README.md.
 */
export default defineConfig({
  testDir: ".",
  testMatch: /scenarios\.ts$/,
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "../../test-results/demo",
  use: {
    baseURL: BASE_URL,
    viewport: VIEWPORT,
    deviceScaleFactor: DPR,
    headless: true,
    colorScheme: "light",
    reducedMotion: "no-preference",
    trace: "off",
  },
});
