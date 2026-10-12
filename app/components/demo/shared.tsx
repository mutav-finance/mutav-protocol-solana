"use client";

/**
 * Building blocks shared by the operator console, /admin and /capital:
 * the connected wallet's role, the "how the numbers moved" table, field
 * wrappers and the action button with its inline transaction status.
 */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletProvider";
import { useTx } from "@/lib/client/use-tx";
import { fmtBrs, fmtNav, fmtShares } from "@/lib/format";
import type { RefusalContext } from "@/lib/tx-error";
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
 * unless the connected wallet is the configured operator.
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
  const sol = r.coverage;
  return {
    "Reserve balance": { v: sol.stableAssets, fmt: fmtBrs as never },
    "Coverage required": { v: sol.coverageRequired, fmt: fmtBrs as never },
    "Free capital": { v: sol.freeCapital, fmt: fmtBrs as never },
    "Set aside for claims": { v: s.provisions, fmt: fmtBrs as never },
    "Share price (live, from accounts)": { v: navPerShare(sol.netAssets, s.sharesOutstanding), fmt: fmtNav as never },
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
  onConfirmed,
  next,
  refusal,
}: {
  label: string;
  request: TxRequest | null | (() => Promise<TxRequest | null>);
  disabled?: boolean;
  via?: "squads" | "direct";
  variant?: "default" | "outline" | "destructive";
  onDone?: () => void;
  /** Called as soon as the transaction confirms, before the post-confirmation read, with the numbers read before the send. */
  onConfirmed?: (signature: string, before: Snap | null) => void;
  /** Shown in place of the send button once confirmed: the result holds until the user starts the next one. */
  next?: ReactNode;
  /** Preview numbers for the plain-English refusal line. */
  refusal?: RefusalContext;
}) {
  const live = useLive();
  const gate = useContext(GateCtx);
  const [before, setBefore] = useState<Snap | null>(null);
  const [after, setAfter] = useState<Snap | null>(null);
  // Bumped once the post-confirmation read has landed, so "after" is fresh.
  const [tick, setTick] = useState(0);
  const handled = useRef(0);
  // The confirm callback closes over the render that started the send, so it reads "before" from a ref.
  const beforeRef = useRef<Snap | null>(null);
  const { state, run } = useTx(async (signature) => {
    onConfirmed?.(signature, beforeRef.current);
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
      {state.phase === "confirmed" && next ? next : (
      <Button
        variant={variant}
        disabled={disabled || gate?.locked || busy || request === null}
        onClick={async () => {
          const req = typeof request === "function" ? await request() : request;
          if (!req) return;
          beforeRef.current = snapshot(live.reserve);
          setBefore(beforeRef.current);
          setAfter(null);
          await run(req, via);
        }}
        title={kind ? `Signer the program checks: ${expectedSigner(kind)}` : undefined}
      >
        {busy ? "Working…" : label}
      </Button>
      )}
      <TxStatus state={state} refusal={refusal} />
      {state.phase === "confirmed" && before && after && <Moves before={before} after={after} />}
    </div>
  );
}

// ── Last action ─────────────────────────────────────────────────────────────

type LastResult = { label: string; signature: string; before: Snap | null; after: Snap | null; refreshed: boolean };

/**
 * Keeps the result of a send whose row leaves its list once confirmed (a
 * paid claim leaves the pay list, a settled one the settle list), so the
 * confirmation, the signature and the before/after stay on the tab. Pass
 * `confirmed(label)` to the row's Action as `onConfirmed` and `done` as its
 * `onDone`.
 */
export function useLastAction() {
  const live = useLive();
  const [last, setLast] = useState<LastResult | null>(null);
  // "after" is the first read once the post-confirmation refresh has landed
  // (set during render, React's pattern for state derived from a new prop).
  if (last && last.refreshed && !last.after) setLast({ ...last, after: snapshot(live.reserve) });
  return {
    last,
    confirmed: (label: string) => (signature: string, before: Snap | null) => setLast({ label, signature, before, after: null, refreshed: false }),
    done: () => setLast((l) => (l ? { ...l, refreshed: true } : l)),
  };
}

export function LastAction({ last }: { last: LastResult | null }) {
  if (!last) return null;
  return (
    <div role="status" aria-live="polite" style={{ border: "1px solid var(--color-success)", background: "var(--color-surface)", padding: "12px 14px", margin: "12px 0" }}>
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)" }}>Last action</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, background: "var(--color-success)", flexShrink: 0 }} />
        <span className="font-body" style={{ fontSize: 12, color: "var(--color-success)" }}>Confirmed</span>
        <Mono style={{ fontSize: 12 }}>{last.label}</Mono>
        <Explorer kind="tx" value={last.signature} />
      </div>
      {last.before && last.after ? <Moves before={last.before} after={last.after} /> : <Note>Reading the new state…</Note>}
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
