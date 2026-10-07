"use client";

/**
 * Building blocks shared by the guided demo and the free-form operator panel:
 * the connected wallet's role, the "how the numbers moved" table, field
 * wrappers and the action button with its inline transaction status.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mono } from "@/components/Mono";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletProvider";
import { useTx } from "@/lib/client/use-tx";
import { fmtBrs, fmtNav, fmtShares } from "@/lib/format";
import { expectedSigner, type TxRequest } from "@/lib/tx-kinds";
import { MODE_LABEL, type Ledger, type ReserveView } from "@/lib/view";

export type Live = { reserve: ReserveView; ledger: Ledger; refresh: () => Promise<void> };

const LiveCtx = createContext<Live | null>(null);
export const LiveProvider = LiveCtx.Provider;
export function useLive(): Live {
  const v = useContext(LiveCtx);
  if (!v) throw new Error("useLive outside LiveProvider");
  return v;
}

/**
 * Optional gate over every Action below it: /operator disables actions
 * unless the connected wallet is the configured operator. /demo sets none.
 */
const GateCtx = createContext<{ locked: boolean } | null>(null);
export const ActionGate = GateCtx.Provider;

// ── Roles ───────────────────────────────────────────────────────────────────

export type Role = "operator" | "admin" | "pauser" | "capital";

export function rolesOf(address: string | null, r: ReserveView): Role[] {
  if (!address) return [];
  const c = r.config;
  return (
    [
      [c.operator, "operator"],
      [c.admin, "admin"],
      [c.pauser, "pauser"],
      [c.mutavCapitalWallet, "capital"],
    ] as const
  )
    .filter(([a]) => a === address)
    .map(([, role]) => role);
}

const ROLE_LABEL: Record<Role, string> = { operator: "Operator", admin: "Reserve Admin", pauser: "pauser", capital: "Investor (MUTAV capital wallet)" };

/** The program checks signers; the UI only warns when the wallet isn't the configured role. */
export function RoleWarning({ need }: { need: Role }) {
  const { address } = useWallet();
  const { reserve } = useLive();
  if (!address) {
    return <Note tone="dim">Connect the configured {ROLE_LABEL[need]} wallet to send this.</Note>;
  }
  if (rolesOf(address, reserve).includes(need)) return null;
  return (
    <Note tone="warn">
      The connected wallet is not the configured {ROLE_LABEL[need]}; the program will reject the signature.
    </Note>
  );
}

export function Note({ children, tone = "dim" }: { children: ReactNode; tone?: "dim" | "warn" | "ok" | "error" }) {
  const color = { dim: "var(--color-text-3)", warn: "var(--color-copper)", ok: "var(--color-success)", error: "var(--color-error)" }[tone];
  return (
    <p className="font-body" style={{ fontSize: 12, color, margin: "6px 0 0", lineHeight: 1.5 }}>
      {children}
    </p>
  );
}

// ── Numbers that moved ──────────────────────────────────────────────────────

type Snap = Record<string, { v: bigint | number | string; fmt: (x: never) => string }>;

export function snapshot(r: ReserveView): Snap {
  const s = r.state;
  const sol = r.solvency;
  return {
    "Stable assets": { v: sol.stableAssets, fmt: fmtBrs as never },
    "Coverage required": { v: sol.coverageRequired, fmt: fmtBrs as never },
    "Free capital": { v: sol.freeCapital, fmt: fmtBrs as never },
    "Open provisions": { v: s.provisions, fmt: fmtBrs as never },
    "NAV per share (from accounts)": { v: navPerShare(sol.netAssets, s.sharesOutstanding), fmt: fmtNav as never },
    "Shares outstanding": { v: s.sharesOutstanding, fmt: fmtShares as never },
    "Active guarantees": { v: s.activeGuarantees, fmt: String as never },
    "Fee take to treasury (total)": { v: s.feeTakeTotal, fmt: fmtBrs as never },
    "Claim payments (total)": { v: s.claimsPaidTotal, fmt: fmtBrs as never },
    "Pending deposits": { v: s.pendingDepositsTotal, fmt: fmtBrs as never },
    Mode: { v: MODE_LABEL(s.mode), fmt: String as never },
  };
}

export function Moves({ before, after }: { before: Snap; after: Snap }) {
  const rows = Object.keys(after).filter((k) => String(before[k]?.v) !== String(after[k]!.v));
  if (rows.length === 0) return <Note>No reserve number changed.</Note>;
  return (
    <div className="table-wrap" style={{ marginTop: 10 }}>
      <table className="data-table" aria-label="How the reserve numbers moved">
        <thead>
          <tr>
            <th>Moved</th>
            <th className="num">Before</th>
            <th className="num">After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((k) => {
            const b = before[k]!;
            const a = after[k]!;
            const up = typeof a.v === "bigint" && typeof b.v === "bigint" ? a.v > b.v : typeof a.v === "number" && typeof b.v === "number" ? a.v > b.v : null;
            return (
              <tr key={k}>
                <td className="font-body">{k}</td>
                <td className="num"><Mono dim>{b.fmt(b.v as never)}</Mono></td>
                <td className="num">
                  <Mono style={{ color: up === null ? "var(--color-text)" : up ? "var(--color-success)" : "var(--color-copper)" }}>
                    {a.fmt(a.v as never)} {up === null ? "" : up ? "▲" : "▼"}
                  </Mono>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Action ──────────────────────────────────────────────────────────────────

/**
 * A button that sends one instruction through the wallet, then shows the
 * transaction, the accounts it touched and how the reserve numbers moved.
 */
export function Action({
  label,
  request,
  disabled,
  via,
  variant = "default",
  onDone,
}: {
  label: string;
  request: TxRequest | null | (() => Promise<TxRequest | null>);
  disabled?: boolean;
  via?: "squads" | "direct";
  variant?: "default" | "outline" | "destructive";
  onDone?: () => void;
}) {
  const live = useLive();
  const gate = useContext(GateCtx);
  const [before, setBefore] = useState<Snap | null>(null);
  const [after, setAfter] = useState<Snap | null>(null);
  // Bumped once the post-confirmation read has landed, so "after" is fresh.
  const [tick, setTick] = useState(0);
  const handled = useRef(0);
  const { state, run } = useTx(async () => {
    await live.refresh();
    setTick((t) => t + 1);
    onDone?.();
  });

  useEffect(() => {
    if (tick > handled.current) {
      handled.current = tick;
      setAfter(snapshot(live.reserve));
    }
  }, [tick, live.reserve]);

  const busy = !["idle", "confirmed", "failed"].includes(state.phase);
  const kind = typeof request === "function" ? null : request?.kind;
  return (
    <div>
      <Button
        variant={variant}
        disabled={disabled || gate?.locked || busy || request === null}
        onClick={async () => {
          const req = typeof request === "function" ? await request() : request;
          if (!req) return;
          setBefore(snapshot(live.reserve));
          setAfter(null);
          await run(req, via);
        }}
        title={kind ? `Signer the program checks: ${expectedSigner(kind)}` : undefined}
      >
        {busy ? "Working…" : label}
      </Button>
      <TxStatus state={state} />
      {state.phase === "confirmed" && before && after && <Moves before={before} after={after} />}
    </div>
  );
}

// ── Fields ──────────────────────────────────────────────────────────────────

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <Label htmlFor={id} className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)" }}>
        {label}
      </Label>
      {children}
      {hint && <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)" }}>{hint}</span>}
    </div>
  );
}

export function TextField({ id, label, value, onChange, hint, numeric }: { id: string; label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; numeric?: boolean }) {
  return (
    <Field id={id} label={label} hint={hint}>
      <Input id={id} value={value} inputMode={numeric ? "decimal" : undefined} className={numeric ? "font-mono" : undefined} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export const Grid = ({ children }: { children: ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "12px 0" }}>{children}</div>
);
