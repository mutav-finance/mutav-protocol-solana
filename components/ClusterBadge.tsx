"use client";
import { CLUSTER } from "@/lib/client/env";

export function ClusterBadge() {
  return (
    <span
      className="font-mono"
      title="Solana cluster this app reads and writes"
      style={{ fontSize: 10, letterSpacing: "0.08em", color: "var(--color-copper)", border: "1px solid var(--color-copper-dim)", padding: "2px 6px", textTransform: "uppercase" }}
    >
      {CLUSTER}
    </span>
  );
}
