"use client";

/** Helpers shared by the /reserve sections. */
import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
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

export function Table({ head, children, label }: { head: (string | [string, "num"])[]; children: ReactNode; label: string }) {
  return (
    <div className="table-wrap scroll-dark">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>
            {head.map((h) => (Array.isArray(h) ? <th key={h[0]} className="num">{h[0]}</th> : <th key={h}>{h}</th>))}
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

