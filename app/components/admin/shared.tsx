"use client";

/** Building blocks shared by the /admin sections: proposal-builder cards, tables, sub-area headings. */
import type { ReactNode } from "react";
import { RoleTag } from "@/components/RoleTag";
import { StatusBadge } from "@/components/StatusBadge";
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

/** A sub-area inside an /admin section, with its own anchor. */
export function Sub({ id, title, badge, children }: { id: string; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 24, scrollMarginTop: 112 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, margin: 0 }}>{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** The one-line "what this is" under a section heading. */
export function WhatThis({ children }: { children: ReactNode }) {
  return <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", margin: 0, maxWidth: 860, lineHeight: 1.6 }}>{children}</p>;
}

/** A control's on-chain value, the bound the program enforces, and what it does. */
export function Facts({ now, bound, does }: { now: ReactNode; bound: ReactNode; does: ReactNode }) {
  const row = (k: string, v: ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "104px minmax(0, 1fr)", gap: 10, padding: "6px 0", borderTop: "1px solid var(--color-border)" }}>
      <dt className="font-mono" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-3)", paddingTop: 2 }}>{k}</dt>
      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
    </div>
  );
  return (
    <dl style={{ margin: "4px 0 0", borderBottom: "1px solid var(--color-border)" }}>
      {row("On-chain now", now)}
      {row("Program bound", bound)}
      {row("What it does", <span className="font-body" style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-2)" }}>{does}</span>)}
    </dl>
  );
}

export function DataTable({ label, head, children }: { label: string; head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** A grid of action cards. */
export const Cards = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(360px, 100%), 1fr))", gap: 16 }}>{children}</div>
);

export const LIVE = <StatusBadge color="var(--color-success)" label="LIVE · ON-CHAIN" />;
export const PLANNED = <StatusBadge color="var(--color-text-3)" label="PLANNED · NOT IN THIS PROGRAM BINARY" />;

/** Nora, the BRS issuer: outside the program's roles. */
export function ExternalTag({ label = "Nora · external" }: { label?: string }) {
  return (
    <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, border: "1px dashed var(--color-text-3)", display: "inline-block" }} />
      {label}
    </span>
  );
}

/** A direct-signed card (pauser key or admin, no time lock): pause, revoke_operator. */
export function PauserAction({ title, note, children }: { title: string; note: ReactNode; children: ReactNode }) {
  return (
    <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 15, margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        {title} <RoleTag role="admin" prefix="pauser key or" />
      </h3>
      <Note>{note}</Note>
      {children}
    </article>
  );
}
