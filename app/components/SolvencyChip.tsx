"use client";

/**
 * SolvencyChip — the core invariant `stable_assets ≥ coverage_required`, with
 * both values and the ratio. Ported from mutav-pulse (status square + mono).
 */
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtBrs, fmtRatio } from "@/lib/format";

export function SolvencyChip({ stableAssets, coverageRequired }: { stableAssets: bigint; coverageRequired: bigint }) {
  const covered = stableAssets >= coverageRequired;
  const color = covered ? "var(--color-success)" : "var(--color-error)";
  const label = covered ? "COVERED" : "UNDER-COVERED";
  const item = (k: string, v: string, c?: string) => (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
      <span className="font-body" style={{ fontSize: 11, color: "var(--color-text-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {k}
      </span>
      <Mono style={{ fontSize: 13, color: c ?? "var(--color-text-2)" }}>{v}</Mono>
    </div>
  );
  return (
    <div
      role="status"
      aria-label={`Coverage status: ${label}`}
      style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, padding: "12px 16px", background: "var(--color-surface)", border: `1px solid ${color}` }}
    >
      <StatusBadge color={color} label={label} />
      <div aria-hidden="true" style={{ width: 1, height: 16, background: "var(--color-border)" }} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {item("Stable", fmtBrs(stableAssets))}
        {item("Required", fmtBrs(coverageRequired))}
        {coverageRequired > 0n && item("Ratio", fmtRatio(stableAssets, coverageRequired), color)}
      </div>
    </div>
  );
}
