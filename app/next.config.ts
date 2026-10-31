import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import { inlineScriptHashes, PREFETCH_REQUESTS, SAFE_HEADERS, STATIC_CSP, UNPROXIED_SOURCES } from "./lib/security-headers";

// The static simulator's inline scripts, hashed at build time for the
// enforced CSP (proxy.ts), so they never go stale when the page changes.
const simulatorHashes = (() => {
  try {
    return inlineScriptHashes(readFileSync(join(process.cwd(), "public", "simulator.html"), "utf8")).join(" ");
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // The Squads SDK (and the web3.js v1 it depends on) only runs in route
  // handlers on the server. Keep it out of the server bundle.
  serverExternalPackages: ["@sqds/multisig", "@solana/web3.js"],
  poweredByHeader: false,
  env: { MUTAV_CSP_SCRIPT_HASHES: simulatorHashes },
  // The reserve simulator is a standalone page (public/simulator.html).
  async rewrites() {
    return [{ source: "/simulator", destination: "/simulator.html" }];
  },
  // A6: enforced on every response (pages, API routes, static files). The
  // CSP: proxy.ts sends the full nonce CSP on pages; the paths and prefetch
  // requests it skips get `frame-ancestors 'none'` here, and only those (see
  // lib/security-headers.ts).
  async headers() {
    return [
      { source: "/:path*", headers: SAFE_HEADERS },
      ...UNPROXIED_SOURCES.map((source) => ({ source, headers: [STATIC_CSP] })),
      ...PREFETCH_REQUESTS.map((condition) => ({ source: "/:path*", has: [condition], headers: [STATIC_CSP] })),
    ];
  },
};

export default nextConfig;
