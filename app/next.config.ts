import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Squads SDK (and the web3.js v1 it depends on) only runs in route
  // handlers on the server. Keep it out of the server bundle.
  serverExternalPackages: ["@sqds/multisig", "@solana/web3.js"],
  poweredByHeader: false,
};

export default nextConfig;
