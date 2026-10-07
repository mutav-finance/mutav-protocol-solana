import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Squads SDK (and the web3.js v1 it depends on) only runs in route
  // handlers on the server. Keep it out of the server bundle.
  serverExternalPackages: ["@sqds/multisig", "@solana/web3.js"],
  poweredByHeader: false,
  // The reserve simulator is a standalone page (public/simulator.html).
  async rewrites() {
    return [{ source: "/simulator", destination: "/simulator.html" }];
  },
};

export default nextConfig;
