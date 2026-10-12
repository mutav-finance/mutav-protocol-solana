"use client";
import { CLUSTER } from "@/lib/client/env";

/** Dev only: the server serves fictional accounts (lib/server/mock.ts). */
const MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";

export function ClusterBadge() {
  return (
    <span
      className="font-mono"
      title={MOCK ? "Mock chain: fictional data for UI work; transactions are disabled" : "Solana cluster this app reads and writes"}
      style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-text-3)", border: "1px solid var(--color-border)", padding: "2px 6px", textTransform: "uppercase" }}
    >
      {MOCK ? `${CLUSTER} · mock data` : CLUSTER}
    </span>
  );
}
