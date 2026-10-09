"use client";

/** Helpers shared by the /reserve sections. */
import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { InfoTooltip } from "@/components/InfoTooltip";
import type { Ledger, ReserveView } from "@/lib/view";

/** What /api/ledger returns. */
export type Data = { reserve: ReserveView; ledger: Ledger };

export const short = (hex: string) => `${hex.slice(0, 8)}…`;

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)", margin: 0, padding: "14px 0" }}>
      {children}
    </p>
  );
}

/** A data table. `tips` adds an ⓘ to the named column headers (what the column means, in one or two sentences). */
export function Table({ head, children, label, tips = {} }: { head: (string | [string, "num"])[]; children: ReactNode; label: string; tips?: Record<string, string> }) {
  const cell = (name: string) =>
    tips[name] ? (
      <span className="inline-flex items-center gap-1.5">
        {name}
        <InfoTooltip label={`About ${name}`} width={240}>{tips[name]}</InfoTooltip>
      </span>
    ) : (
      name
    );
  return (
    <div className="table-wrap scroll-dark">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>
            {head.map((h) => (Array.isArray(h) ? <th key={h[0]} className="num">{cell(h[0])}</th> : <th key={h}>{cell(h)}</th>))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const Num = ({ children, color }: { children: ReactNode; color?: string }) => (
  <td className="num">
    <Mono style={color ? { color } : undefined}>{children}</Mono>
  </td>
);

