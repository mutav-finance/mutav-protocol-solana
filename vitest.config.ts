import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    // Unit tests only. Playwright specs in e2e/ run through `bun run e2e`.
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
