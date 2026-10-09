"use client";

/**
 * /dashboard — the capital provider's view (the Investor role). Everyone can
 * read it; only a wallet whose Merkle proof verifies against the on-chain
 * allowlist root can send `request_deposit` / `request_redeem` (the server
 * builds the proof from ALLOWLIST). Cancels and claims need only the request's
 * owner (spec §5.5). The pilot runs on MUTAV's own capital and is not open to
 * public investment; its allowlisted capital provider is MUTAV's capital wallet.
 *
 * Layout after lending/AMM dashboards: the position in the header, anything
 * ready to claim first, the wallet's requests, and a deposit / redeem action
 * card. Same reads and requests as before.
 */
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { assetsFor } from "@mutav-finance/mutav-protocol-solana";
import { ReadError } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { Action, LiveProvider, Note, useLive } from "@/components/demo/shared";
import { ALLOWLIST_TEXT, type AllowlistState } from "@/lib/allowlist";
import { usePoll } from "@/lib/client/use-poll";
import { SHARE_DECIMALS, fmtBps, fmtBrs, fmtShares, fmtTime, parseBrs } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import { investorRequests, type InvestorRequest, type Ledger, type ReserveView } from "@/lib/view";

/** Dev only: with the mock chain and no wallet, preview MUTAV's capital wallet. */
const MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";


/** Plain-language allowlist text for this page; the Merkle wording lives in the ⓘ. */
const ALLOWLIST_PLAIN: Record<AllowlistState, string> = {
  ...ALLOWLIST_TEXT,
  allowlisted: "This wallet can send deposit and redemption requests.",
};

const ACTION_LABEL = { cancel_deposit: "Cancel deposit", claim_shares: "Claim shares", cancel_redeem: "Cancel redemption", claim_assets: "Claim BRS" } as const;

const label = "font-body text-(--color-text-2) text-xs font-medium uppercase";
const tracking = { letterSpacing: "0.01em" };

function Panel({ title, info, aside, children, flush = false }: { title: string; info?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="bg-(--color-surface) flex min-w-0 flex-col border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <span className="flex items-center gap-2">
          <h2 className="font-display text-(--color-text) m-0 text-base font-bold">{title}</h2>
          {info && <InfoTooltip label={`About ${title}`}>{info}</InfoTooltip>}
        </span>
        {aside}
      </header>
      <div className={flush ? "flex flex-col" : "flex flex-col gap-4 p-6"}>{children}</div>
    </section>
  );
}

/** Everything a wallet has in the reserve, valued at the current NAV (a preview): shares held, deposits waiting, shares to claim, shares waiting to redeem, BRS to claim. */
function positionTotal(r: ReserveView, inv: InvestorView | null, mine: InvestorRequest[]): bigint {
  const at = (sh: bigint) => assetsFor(sh, r.state.sharesOutstanding, r.solvency.netAssets);
  return at(inv?.shares.amount ?? 0n) + mine.reduce((sum, x) => sum + (x.side === "deposit" ? x.waiting + at(x.claimable) : at(x.waiting) + x.claimable), 0n);
}

/** The position, inline in the page header: one highlight, three secondary figures, no boxes. */
function HeaderStats({ r, inv, pending, owner, mine }: { r: ReserveView; inv: InvestorView | null; pending: { deposits: bigint; redeemShares: bigint }; owner: string | null; mine: ReturnType<typeof investorRequests> }) {
  if (!owner) return <Note>Connect a wallet to see its position.</Note>;
  const s = r.state;
  const shares = inv?.shares.amount ?? 0n;
  const at = (sh: bigint) => assetsFor(sh, s.sharesOutstanding, r.solvency.netAssets);
  const value = at(shares);
  // Everything this wallet has in the reserve, valued now: shares held, deposits waiting (BRS), shares to claim,
  // shares waiting to redeem, BRS to claim. A preview: fills happen at the NAV of their moment.
  const total = positionTotal(r, inv, mine);
  const ownBps = s.sharesOutstanding === 0n ? 0n : (shares * 10_000n) / s.sharesOutstanding;
  const stat = (k: string, v: ReactNode, note: ReactNode, tip?: ReactNode, lead = false) => (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-1 px-5 py-4">
      <span className="font-body text-(--color-text-2) flex items-center gap-2 text-xs">
        {k}
        {tip && <InfoTooltip label={`About ${k}`}>{tip}</InfoTooltip>}
      </span>
      <Mono
        style={{
          fontSize: lead ? "clamp(22px, 6vw, 28px)" : "clamp(15px, 4vw, 18px)",
          fontWeight: 700,
          lineHeight: 1.1,
          color: lead ? "var(--color-text)" : "var(--color-text-2)",
          whiteSpace: "nowrap",
        }}
      >
        {v}
      </Mono>
      <span className="font-mono text-(--color-text-3) text-2xs">{note}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-px border sm:grid-cols-2 lg:grid-cols-4" style={{ background: "var(--color-border)" }}>
      {stat(
        "Total in the reserve",
        inv ? fmtBrs(total) : "—",
        "PREVIEW · at current NAV",
        "Shares held, deposits waiting in the queue, shares waiting to redeem and anything ready to claim, valued at the current NAV. Fills happen at the NAV of their moment, not now. Computed with the client's math mirror of the program's assets_for(shares).",
        true,
      )}
      {stat("Value of shares held", inv ? fmtBrs(value) : "—", "PREVIEW · at current NAV")}
      {stat("Reserve shares held", inv ? fmtShares(shares) : "—", inv?.shares.amount === null ? "no share account yet" : `${fmtBps(ownBps)} of shares outstanding`)}
      {stat(
        "In the queue",
        fmtBrs(pending.deposits),
        `deposit · ${fmtShares(pending.redeemShares)} shares to redeem`,
        "Locked in escrow until the Reserve Admin processes the queue: deposits until fulfilled, shares until filled.",
      )}
    </div>
  );
}

/** Status as a brand badge: 6px square + mono label. */
function StatusOf({ x }: { x: InvestorRequest }) {
  if (x.claimable > 0n) return <StatusBadge color="var(--color-success)" label="READY TO CLAIM" />;
  const s = x.status.toUpperCase();
  const color = "var(--color-text-3)";
  return <StatusBadge color={color} label={s} />;
}

const sideName = (x: InvestorRequest) => (x.side === "deposit" ? "Deposit" : "Redemption");
const waitingOf = (x: InvestorRequest) => (x.waiting === 0n ? "—" : x.side === "deposit" ? fmtBrs(x.waiting) : `${fmtShares(x.waiting)} sh`);
const claimOf = (x: InvestorRequest) => (x.claimable === 0n ? "—" : x.side === "deposit" ? `${fmtShares(x.claimable)} sh` : fmtBrs(x.claimable));
const positionOf = (x: InvestorRequest) => (x.position === null ? "—" : `#${x.position} in line`);

function RowActions({ x, connected }: { x: InvestorRequest; connected: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {x.actions.map((a) => (
        <Action key={a} label={ACTION_LABEL[a]} variant={a.startsWith("cancel") ? "outline" : "default"} disabled={!connected} request={{ kind: a, seq: x.seq }} />
      ))}
    </div>
  );
}

function Requests({ owner, connected }: { owner: string | null; connected: boolean }) {
  const { reserve, ledger } = useLive();
  const rows = investorRequests(owner, reserve.state, ledger);
  if (!owner) return <div className="p-6"><Note>Connect a wallet to see its requests. The whole queue is public on <Link href="/reserve/queue" className="ext-link">/reserve/queue</Link>.</Note></div>;
  if (rows.length === 0) return <div className="p-6"><Note>This wallet has no open request.</Note></div>;
  return (
    <>
      {/* Phones: one card per request, so the actions stay visible. */}
      <ul className="m-0 flex list-none flex-col p-0 sm:hidden" aria-label="Your queue entries">
        {rows.map((x) => (
          <li key={x.address} className="flex flex-col gap-3 border-b p-4 last:border-b-0">
            <div className="flex items-center justify-between gap-3">
              <Explorer value={x.address} label={sideName(x)} />
              <StatusOf x={x} />
            </div>
            <dl className="font-mono m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <dt className="text-(--color-text-3)">Queue position</dt>
              <dd className="m-0 text-right">{positionOf(x)}</dd>
              <dt className="text-(--color-text-3)">Waiting</dt>
              <dd className="m-0 text-right">{waitingOf(x)}</dd>
              <dt className="text-(--color-text-3)">To claim</dt>
              <dd className="m-0 text-right">{claimOf(x)}</dd>
              <dt className="text-(--color-text-3)">Requested</dt>
              <dd className="text-(--color-text-3) m-0 text-right">{fmtTime(x.requestedAt)}</dd>
            </dl>
            <RowActions x={x} connected={connected} />
          </li>
        ))}
      </ul>
      <div className="table-wrap hidden border-0 sm:block">
        <table className="data-table" aria-label="Your queue entries">
          <thead>
            <tr>
              <th>Side</th>
              <th>Status</th>
              <th className="num">Queue position</th>
              <th className="num">Waiting</th>
              <th className="num">To claim</th>
              <th>Requested</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.address} title={`seq ${x.seq.toString()}`}>
                <td><Explorer value={x.address} label={sideName(x)} /></td>
                <td><StatusOf x={x} /></td>
                <td className="num"><Mono dim={x.position === null}>{positionOf(x)}</Mono></td>
                <td className="num"><Mono>{waitingOf(x)}</Mono></td>
                <td className="num"><Mono>{claimOf(x)}</Mono></td>
                <td><Mono dim>{fmtTime(x.requestedAt)}</Mono></td>
                <td style={{ whiteSpace: "normal" }}>
                  <RowActions x={x} connected={connected} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Shown above everything else when shares or BRS are waiting to be claimed. */
function ReadyToClaim({ rows, connected }: { rows: InvestorRequest[]; connected: boolean }) {
  const ready = rows.filter((x) => x.claimable > 0n);
  if (ready.length === 0) return null;
  return (
    <section aria-labelledby="ready-h" className="bg-(--color-surface) flex flex-col gap-4 border p-6" style={{ borderTop: "4px solid var(--color-success)" }}>
      <h2 id="ready-h" className="font-display text-(--color-text) m-0 text-base font-bold">
        Ready to claim
      </h2>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {ready.map((x) => (
          <li key={x.address} className="flex flex-wrap items-center justify-between gap-3">
            <span className="font-body text-(--color-text-2) text-sm">
              {sideName(x)} · <Mono style={{ color: "var(--color-text)", fontWeight: 700 }}>{claimOf(x)}</Mono>
            </span>
            <div className="flex flex-wrap gap-2">
              {x.actions
                .filter((a) => a.startsWith("claim"))
                .map((a) => (
                  <Action key={a} label={ACTION_LABEL[a]} disabled={!connected} request={{ kind: a, seq: x.seq }} />
                ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One side of the action card: a large amount field with the wallet balance and Max. */
function AmountField({ id, title, unit, value, onChange, balance, onMax }: { id: string; title: string; unit: string; value: string; onChange: (v: string) => void; balance: ReactNode; onMax?: () => void }) {
  return (
    <div className="bg-(--color-canvas) flex flex-col gap-3 border p-4">
      <label htmlFor={id} className={label} style={tracking}>
        {title}
      </label>
      <div className="flex items-center gap-3">
        <Input id={id} value={value} placeholder="0.00" inputMode="decimal" onChange={(e) => onChange(e.target.value)} className="font-mono h-12 border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0" />
        <span className="font-mono text-(--color-text-2) shrink-0 text-sm">{unit}</span>
      </div>
      <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
        <span>{balance}</span>
        {onMax && (
          <Button type="button" variant="ghost" size="sm" onClick={onMax} className="h-6 px-2 text-2xs">
            Max
          </Button>
        )}
      </div>
    </div>
  );
}

function ActionCard({ allowed, inv }: { allowed: boolean; inv: InvestorView | null }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const [amount, setAmount] = useState("");
  const [sharesIn, setSharesIn] = useState("");
  const assets = parseBrs(amount);
  const shares = parseBrs(sharesIn, SHARE_DECIMALS);
  const depOut = assets !== null && (assets < caps.minRequest || assets > caps.maxRequest);
  const redValue = shares ? assetsFor(shares, reserve.state.sharesOutstanding, reserve.solvency.netAssets) : null;
  const redOut = redValue !== null && (redValue < caps.minRequest || redValue > caps.maxRequest);
  const brs = inv?.brs.amount ?? null;
  const held = inv?.shares.amount ?? null;
  const limits = `${fmtBrs(caps.minRequest, 0)} – ${fmtBrs(caps.maxRequest, 0)} per request`;
  // One rule for the badge and the gate: no real wallet vs. a wallet that is not allowlisted.
  const paused = reserve.config.paused;
  const canRequest = allowed && !paused;
  const pausedNote = paused && <Note tone="warn">Requests are paused by the Reserve Admin. Cancels and claims stay open.</Note>;
  return (
    <Panel
      title="New request"
      info="Your wallet signs the request. The program checks a Merkle proof of the wallet against the on-chain allowlist root; the proof is built for you."
    >
      <Tabs defaultValue="deposit">
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
          <TabsTrigger value="redeem" className="flex-1">Redeem</TabsTrigger>
        </TabsList>
        <TabsContent value="deposit" className="flex flex-col gap-4">
          <AmountField
            id="dash-dep"
            title="You deposit"
            unit="BRS"
            value={amount}
            onChange={setAmount}
            balance={<>Wallet {brs === null ? "—" : fmtBrs(brs)}</>}
            onMax={brs !== null && brs > 0n ? () => setAmount((Number(brs) / 1e6).toString()) : undefined}
          />
          <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
            <span>limits {limits}</span>
            <InfoTooltip label="How a deposit works">BRS moves to the pending-deposits escrow and waits in FIFO order; the Reserve Admin fulfils it at the NAV of that moment, then you claim the shares.</InfoTooltip>
          </div>
          <div className="[&>div>button]:h-11 [&>div>button]:w-full">
            <Action label="Request deposit" disabled={!canRequest} request={assets ? { kind: "request_deposit", assets } : null} />
          </div>
          {depOut && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
          {pausedNote}
        </TabsContent>
        <TabsContent value="redeem" className="flex flex-col gap-4">
          <AmountField
            id="dash-red"
            title="You redeem"
            unit="shares"
            value={sharesIn}
            onChange={setSharesIn}
            balance={<>Held {held === null ? "—" : fmtShares(held)}</>}
            onMax={held !== null && held > 0n ? () => setSharesIn((Number(held) / 10 ** SHARE_DECIMALS).toString()) : undefined}
          />
          <p className="font-body text-(--color-text-2) m-0 text-xs">Filled in queue order from free capital; paused while the reserve is under-covered.</p>
          <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
            <span>{redValue !== null ? `PREVIEW ≈ ${fmtBrs(redValue)} at NAV now` : `limits ${limits}`}</span>
            <InfoTooltip label="How a redemption works">Shares move to the pending-redemptions escrow. The Reserve Admin fills them in FIFO order, only out of free capital and never in under-coverage; you then claim the BRS. Reserve shares have 6 decimals.</InfoTooltip>
          </div>
          <div className="[&>div>button]:h-11 [&>div>button]:w-full">
            <Action label="Request redemption" disabled={!canRequest} request={shares ? { kind: "request_redeem", shares } : null} />
          </div>
          {redOut && <Note tone="warn">Worth less than {fmtBrs(caps.minRequest, 0)} or more than {fmtBrs(caps.maxRequest, 0)} at the current NAV: the program will refuse it.</Note>}
          {pausedNote}
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

/**
 * Chart template: the frame of the portfolio-value chart. The chain keeps no
 * balance history, so the series needs an indexer (out of scope for the
 * pilot); until then the plot area is a labelled placeholder, never invented data.
 */
const PERIODS = { "7D": { n: 7, step: 86_400 }, "30D": { n: 30, step: 86_400 }, "90D": { n: 13, step: 7 * 86_400 }, "1Y": { n: 12, step: 30 * 86_400 } } as const;
type Period = keyof typeof PERIODS;

/** Mock only: a deterministic, illustrative walk that ends at today's value. Never shown outside the mock chain. */
function mockSeries(end: number, period: Period, now: number): { t: number; v: number }[] {
  const { n, step } = PERIODS[period];
  let seed = 7 + n;
  const rand = () => ((seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647);
  const raw: number[] = [];
  let v = 1;
  for (let i = 0; i < n; i++) raw.push((v *= 1 + (rand() - 0.42) * 0.04));
  const k = end / raw[raw.length - 1]!;
  return raw.map((x, i) => ({ t: now - (n - 1 - i) * step, v: x * k }));
}

const brl = (v: number) => `R$ ${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const day = (t: number, period: Period) => new Date(t * 1000).toLocaleDateString("en-US", period === "1Y" ? { month: "short", year: "2-digit" } : { month: "short", day: "numeric" });

/**
 * Portfolio value over time. The chain stores current balances only, so a real
 * series needs an indexer (out of scope for the pilot). Under the dev mock chain
 * it draws an illustrative series, labelled MOCK; otherwise a labelled placeholder.
 */
function PortfolioChart({ total, now }: { total: bigint | null; now: number }) {
  const [period, setPeriod] = useState<Period>("1Y");
  const series = MOCK && total !== null && total > 0n ? mockSeries(Number(total) / 1e6, period, now) : null;
  const W = 600;
  const H = 240;
  let path = "";
  let area = "";
  let ticks: number[] = [];
  if (series) {
    const vs = series.map((p) => p.v);
    const lo = Math.min(...vs) * 0.98;
    const hi = Math.max(...vs) * 1.02;
    const x = (i: number) => (i / (series.length - 1)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    path = series.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    area = `${path} L${W},${H} L0,${H} Z`;
    ticks = [hi, (hi + lo) / 2, lo];
  }
  const first = series?.[0]?.v ?? 0;
  const last = series?.[series.length - 1]?.v ?? 0;
  const delta = last - first;
  return (
    <Panel
      title="Portfolio value"
      info="Your position's value over time. The chain stores current balances only, so a real history needs an indexer that records it."
      aside={
        <div className="flex gap-1" role="group" aria-label="Period">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Button key={p} type="button" variant={p === period ? "secondary" : "ghost"} size="sm" onClick={() => setPeriod(p)} aria-pressed={p === period} className="font-mono text-2xs">
              {p}
            </Button>
          ))}
        </div>
      }
    >
      {series ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="inline-flex items-baseline gap-3">
              <Mono style={{ fontSize: 24, fontWeight: 700, color: "var(--color-text)" }}>{brl(last)}</Mono>
              <Mono style={{ fontSize: 12, color: delta >= 0 ? "var(--color-success)" : "var(--color-error)" }}>
                {delta >= 0 ? "+" : "−"}
                {brl(Math.abs(delta))} ({((delta / first) * 100).toFixed(1)}%)
              </Mono>
            </span>
            <span className="font-mono text-(--color-copper) text-2xs uppercase" style={{ letterSpacing: "0.08em" }}>
              mock data · illustrative history
            </span>
          </div>
          <div className="relative flex min-h-[260px] flex-1 gap-3">
            <div className="font-mono text-(--color-text-3) flex flex-col justify-between py-1 text-2xs" aria-hidden="true">
              {ticks.map((t) => (
                <span key={t}>{brl(t)}</span>
              ))}
            </div>
            <div className="relative flex flex-1 flex-col">
              <svg role="img" aria-label={`Illustrative portfolio value, ${period}`} className="h-full min-h-[240px] w-full flex-1" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                {[0, H / 2, H].map((g) => (
                  <line key={g} x1="0" y1={g} x2={W} y2={g} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                ))}
                <path d={area} fill="var(--color-surface-3)" />
                <path d={path} fill="none" stroke="var(--color-chart-1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="font-mono text-(--color-text-3) flex justify-between pt-2 text-2xs" aria-hidden="true">
                <span>{day(series[0]!.t, period)}</span>
                <span>{day(series[Math.floor(series.length / 2)]!.t, period)}</span>
                <span>{day(series[series.length - 1]!.t, period)}</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="relative min-h-[320px] flex-1 border" data-chart-slot="portfolio-value">
          <svg aria-hidden="true" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            {[25, 50, 75].map((g) => (
              <line key={g} x1="0" y1={g} x2="100" y2={g} stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <span className="font-mono text-(--color-text-3) absolute top-3 right-3 text-2xs uppercase" style={{ letterSpacing: "0.08em" }}>
            chart · portfolio value · history pending
          </span>
        </div>
      )}
    </Panel>
  );
}

/**
 * Access dialog over the dashboard: no wallet connected, or a wallet that is
 * not on the allowlist. It blocks the page until a wallet connects; "Back"
 * leaves for the home page. Under the dev mock chain, Escape also closes it
 * so the page can be reviewed without a wallet.
 * No glass or shadow: a canvas scrim and a bordered surface card.
 */
function AccessGate({ connected, state }: { connected: boolean; state: AllowlistState | null }) {
  const [open, setOpen] = useState(true);
  const blocked = !connected || (state !== null && state !== "allowlisted");
  useEffect(() => {
    if (!MOCK || !open || !blocked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, blocked]);
  if (!open || !blocked) return null;
  const title = connected ? "Wallet not allowlisted" : "Connect your wallet";
  const body = connected ? "This wallet can only view the dashboard." : "Connect the allowlisted wallet to send requests.";
  // Amber card, canvas-colored text and controls (STYLE.md: dark text on amber fill).
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: "color-mix(in oklab, var(--color-canvas) 70%, transparent)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="gate-h"
        className="flex w-full max-w-[360px] flex-col gap-3 p-6 [&_button]:!border-(--color-canvas)"
        style={{ background: "var(--color-accent)", color: "var(--color-canvas)" }}
      >
        <h2 id="gate-h" className="font-display m-0 text-lg font-bold">
          {title}
        </h2>
        <p className="font-body m-0 text-sm">{body}</p>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          {!connected && (
            <span className="[&_button]:!bg-(--color-canvas) [&_button]:!text-(--color-accent)">
              <ConnectButton />
            </span>
          )}
          <Button asChild variant="ghost" className="!text-(--color-canvas) hover:!bg-transparent underline-offset-4 hover:underline">
            <Link href="/">Back</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Allowlisted: a compact line. Otherwise the panel stays prominent, since it explains why the page is read-only. */
function Allowlist({ inv, connected }: { inv: InvestorView | null; connected: boolean }) {
  const state = inv?.allowlist.state ?? null;
  const evidence = inv
    ? ` On-chain root ${inv.allowlist.root.slice(0, 24)}…; ${inv.allowlist.listSize} wallet${inv.allowlist.listSize === 1 ? "" : "s"} in the server's public ALLOWLIST.`
    : "";
  const info = `The Reserve Admin sets the allowlist root through set_allowlist_root. KYC is done off-chain. The program checks a Merkle proof of your wallet against the root; the proof is built for you from the public list.${evidence}`;
  if (state === "allowlisted")
    return (
      <div className="bg-(--color-surface) flex flex-wrap items-center justify-between gap-3 border px-6 py-4">
        <span className="font-body text-(--color-text-2) flex items-center gap-2 text-sm">
          {ALLOWLIST_PLAIN.allowlisted}
          <InfoTooltip label="About the allowlist">{info}</InfoTooltip>
        </span>
      </div>
    );
  return (
    <Panel title="Allowlist" info={info}>
      <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">
        {state ? ALLOWLIST_PLAIN[state] : connected ? "Checking the allowlist…" : "Connect a wallet to check it against the allowlist. Without one, this view is read-only."}
      </p>
    </Panel>
  );
}

export function DashboardPage() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const d = poll.data;
  const previewOwner = !address && MOCK && d ? d.reserve.config.mutavCapitalWallet : null;
  const owner = address ?? previewOwner;
  const connected = !!address;
  const inv = usePoll<InvestorView>(`/api/investor${owner ? `?owner=${owner}` : ""}`, 10_000);
  const invData = inv.data && inv.data.owner === owner ? inv.data : null;
  const allowed = connected && invData?.allowlist.state === "allowlisted";
  const mine = d && owner ? investorRequests(owner, d.reserve.state, d.ledger) : [];
  const pending = {
    deposits: mine.filter((x) => x.side === "deposit").reduce((s, x) => s + x.waiting, 0n),
    redeemShares: mine.filter((x) => x.side === "redeem").reduce((s, x) => s + x.waiting, 0n),
  };
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  const queue = (
    <Panel
      flush
      title="Your queue entries"
      info={
        <>
          Requested, cancelled and claimed by the Investor; fulfilled by the Reserve Admin in FIFO order. Cancelling and claiming need only the request&apos;s owner, not the
          allowlist, and are never paused. Each row&apos;s queue seq is in its tooltip.{" "}
          {invData?.holderState ? (
            <>
              HolderState <Explorer value={invData.holderState.address} /> · last shares in {fmtTime(invData.holderState.lastSharesInTs)}.
            </>
          ) : (
            "No HolderState yet: it is created by the first request_deposit or claim_shares."
          )}
        </>
      }
    >
      <Requests owner={owner} connected={connected} />
    </Panel>
  );
  return (
    <main className="flex w-full flex-1 flex-col gap-6 py-8" style={pad}>
      {d && <AccessGate key={`${address ?? "none"}-${invData?.allowlist.state ?? "?"}`} connected={connected} state={invData?.allowlist.state ?? null} />}
      {/* Top: title, position, deposit / redeem (order after the web investidor deposit page), at the standard page width. */}
      <div className="flex w-full flex-col gap-6">
        <header className="flex flex-col gap-3">
          <h1 className="font-display text-(--color-text) m-0 flex items-center gap-3 text-3xl font-bold tracking-tight">
            Dashboard
            <InfoTooltip label="About this dashboard">
              The capital provider&apos;s side of the reserve: position, queue entries and requests. The pilot runs on MUTAV&apos;s own capital and is not open to public
              investment; nothing here is an offer to invest. Only a wallet on the on-chain allowlist (KYC done off-chain) can send requests, and in the pilot that is
              MUTAV&apos;s capital wallet.
            </InfoTooltip>
          </h1>
        </header>
        {poll.error && !d && <ReadError error={poll.error} />}
        {!d && !poll.error && <p className="font-mono text-(--color-text-3) text-xs">Reading the chain…</p>}
        {d && (inv.error && !inv.data ? <ReadError error={inv.error} /> : <HeaderStats r={d.reserve} inv={invData} pending={pending} owner={owner} mine={mine} />)}
      </div>
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), inv.refresh()]); } }}>
          {/* Portfolio chart (2/3) beside the deposit / redeem card (1/3). */}
          <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex min-w-0 flex-col lg:col-span-2 [&>section]:flex-1 [&>section>div]:flex-1">
              <PortfolioChart total={owner ? positionTotal(d.reserve, invData, mine) : null} now={Number(d.reserve.now)} />
            </div>
            <div className="flex min-w-0 flex-col">
              <ActionCard allowed={allowed} inv={invData} />
            </div>
          </div>
          {/* Below the deposit / redeem card: what doesn't fit the column. */}
          <div className="flex w-full flex-col gap-6 border-t pt-6">
            <ReadyToClaim rows={mine} connected={connected} />
            {queue}
            <Allowlist inv={invData} connected={!!owner} />
          </div>
        </LiveProvider>
      )}
    </main>
  );
}
