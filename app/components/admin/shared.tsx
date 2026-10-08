"use client";

/** Building blocks shared by the /admin sections: the proposal-builder card, a key/value table. */
import type { ReactNode } from "react";
import { RoleTag } from "@/components/RoleTag";
import { Action, Note } from "@/components/demo/shared";
import type { AdminTx, TxRequest } from "@/lib/tx-kinds";

/** How admin actions are sent on this deployment. */
export type Mode = { via: "squads" | "direct"; label: string } | null;

/** One admin action: a Squads proposal builder (or direct signing on localnet). */
export function AdminAction({ title, children, mode, request, label, note }: { title: string; children?: ReactNode; mode: Mode; request: AdminTx | TxRequest | null | (() => Promise<AdminTx | null>); label: string; note?: ReactNode }) {
  return (
    <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 15, margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        {title} <RoleTag role="admin" />
      </h3>
      {note && <Note>{note}</Note>}
      {children}
      {mode ? (
        <Action label={mode.via === "squads" ? `Propose: ${label}` : `Sign directly: ${label}`} request={request} via={mode.via} variant={mode.via === "direct" ? "outline" : "default"} />
      ) : (
        <Note tone="warn">No Squads multisig configured, and direct signing is localnet-only.</Note>
      )}
    </article>
  );
}

export function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}>
              <td className="font-body" style={{ fontSize: 13, width: "40%" }}>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A config label with its meaning underneath, for fields whose name alone does not say what they do. */
export function Meaning({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {label}
      <span className="font-body" style={{ fontSize: 11, color: "var(--color-text-3)", lineHeight: 1.45 }}>{children}</span>
    </span>
  );
}
