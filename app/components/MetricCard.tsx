"use client";

/**
 * MetricCard — a single metric in the reserve dashboard metric grid.
 *
 * Design: brand card (STYLE.md §3.1) — Inter Medium 12px ALL CAPS label in
 * text-2, bold value in JetBrains Mono (figures are always mono), sub-value
 * note in Inter (body font), text-3.
 * - Optional tooltip on label
 * - No rounded corners, no shadows, surface-1 background
 */

import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { InfoTooltip } from "@/components/InfoTooltip";

interface MetricCardProps {
  label: string;
  /** A string, or a node such as `<Money>` (BRS with its US$ hint). */
  value: ReactNode;
  unit?: string;
  tooltip?: string;
  /** amber accent on the value — use only for Net APY */
  accentValue?: boolean;
  /** quieter borderless variant (smaller value, no box) — supporting metrics */
  compact?: boolean;
  /** keeps the box but shrinks padding + value — for secondary metric grids
   *  that should sit visually below a primary chart. */
  dense?: boolean;
  /** loading skeleton */
  loading?: boolean;
  /** error message */
  error?: string;
}

export function MetricCard({
  label,
  value,
  unit,
  tooltip,
  accentValue = false,
  compact = false,
  dense = false,
  loading = false,
  error,
}: MetricCardProps) {
  return (
    <div
      style={{
        backgroundColor: compact ? "transparent" : "var(--color-surface)",
        border: compact ? "none" : "1px solid var(--color-border)",
        padding: compact ? 0 : dense ? "16px" : "24px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: dense ? "10px" : "8px",
        // Become a sizing container + allow the grid item to shrink, so the
        // value below can scale to the card width (long R$ figures overflowed).
        containerType: "inline-size",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      {/* Label row — Inter Medium, ALL CAPS, with optional tooltip trigger */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          position: "relative",
        }}
      >
        <p
          className="font-body"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "0.01em",
            color: "var(--color-text-2)",
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {label}
        </p>
        {tooltip && (
          <InfoTooltip label={`Info: ${label}`} width={220}>
            {tooltip}
          </InfoTooltip>
        )}
      </div>

      {/* Value — Geist Bold, large */}
      {loading ? (
        <div
          aria-hidden="true"
          style={{
            height: "32px",
            width: "80%",
            backgroundColor: "var(--color-surface-2)",
            opacity: 0.6,
          }}
        />
      ) : error ? (
        <p
          className="font-mono"
          style={{
            fontSize: "12px",
            color: "var(--color-error)",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          —
        </p>
      ) : (
        <p
          className="font-mono"
          style={{
            fontWeight: 700,
            // Scale to the card width (cqi) so any value length fits, capped at
            // the original size; floor keeps it legible on the narrowest card.
            fontSize: compact
              ? "clamp(13px, 8cqi, 20px)"
              : dense
                ? "clamp(14px, 7cqi, 18px)"
                : "clamp(14px, 9cqi, 24px)",
            color: accentValue ? "var(--color-accent)" : "var(--color-text)",
            letterSpacing: 0,
            lineHeight: 1.1,
            margin: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          <Mono>{value}</Mono>
        </p>
      )}

      {/* Unit / sub-note — body font (prose), dim; tabular figures */}
      {unit && !loading && !error && (
        <p
          className="font-body"
          style={{
            fontSize: "11px",
            color: "var(--color-text-3)",
            fontVariantNumeric: "tabular-nums",
            margin: 0,
            lineHeight: 1.4,
          }}
        >
          {unit}
        </p>
      )}
    </div>
  );
}
