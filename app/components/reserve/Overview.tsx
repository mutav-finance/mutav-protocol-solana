"use client";

/**
 * /reserve Overview answers one question: "Can the reserve cover every open
 * guarantee?" Above both columns: the accounts that prove it, on Explorer.
 * Main column, top to bottom:
 *   1. Hero: stable assets, their share of what is required, four figures
 *      that open their tab, and the program state.
 *   2. Where the capital sits: stable assets split by what they back.
 *   3. What never changes: the two spec promises.
 *   4. Verify it yourself: one link to the Verify tab.
 * Side column: the latest movements of the ledger, then stable assets over
 * time rebuilt from those movements.
 * Renders on-chain values from /api/ledger; nothing beyond sums and shares.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HistoryChart } from "@/components/reserve/HistoryChart";
import { capitalSplit, type CapitalSplit } from "@/lib/charts";
import { fmtBps, fmtDuration, fmtNav, fmtRatio } from "@/lib/format";
import { useFmt } from "@/components/MoneyProvider";
import { capitalQueue, claimsTimeline, coverageRows, moneyFlows, type FlowRow, type ReserveView, type Ledger } from "@/lib/view";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string, string, string][] = [
  ["Claim payments are never blocked by solvency.", "The gate stops new guarantees and redemptions only.", "/reserve/claims", "See claims"],
  ["Capital requests need an approved wallet.", "Deposits and redemptions are gated by an on-chain allowlist (KYC off-chain).", "/reserve/risks", "Read the risks"],
];

const FLOW_LABEL = { fee: "Guarantee fee", income: "Issuer income", claim: "Claim payment", deposit: "Deposit filled", redemption: "Redemption filled" } as const;
/** Movements shown in the side column, and the window the count covers. */
const ACTIVITY_ROWS = 5;
const ACTIVITY_DAYS = 60n;

const NUM = { fontVariantNumeric: "tabular-nums" } as const;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const abs = (v: bigint) => (v < 0n ? -v : v);
const share = (part: bigint, whole: bigint) => (whole === 0n ? "—" : fmtBps(Number((part * 10_000n) / whole)));

/** Inter Medium 12px caps label (STYLE.md card label), with an optional definition tooltip. */
function Label({ children, tip, dim }: { children: string; tip?: string; dim?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`font-body text-xs font-medium uppercase ${dim ? "text-(--color-text-3)" : "text-(--color-text-2)"}`} style={{ letterSpacing: "0.01em" }}>
        {children}
      </span>
      {tip && (
        <InfoTooltip label={`Info: ${children}`} width={240}>
          {tip}
        </InfoTooltip>
      )}
    </span>
  );
}

const H3 = ({ id, children }: { id?: string; children: ReactNode }) => (
  <h3 id={id} className="font-display text-(--color-text) m-0 text-base font-bold">
    {children}
  </h3>
);

const Dot = ({ color, size = 6 }: { color: string; size?: number }) => <span aria-hidden="true" className="shrink-0" style={{ width: size, height: size, background: color }} />;

export function Overview() {
  const { d } = useReserve();
  const r = d.reserve;
  const flows = moneyFlows(r.state, d.ledger).rows;
  return (
    <div className="flex flex-col gap-10">
      <ProofCards r={r} />
      <div className="grid grid-cols-1 items-start gap-10 min-[1120px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-14">
          <Hero r={r} l={d.ledger} />
          <WhereCapitalSits r={r} l={d.ledger} />
          <Promises />
        </div>
        <aside className="flex min-w-0 flex-col gap-10">
          <RecentActivity r={r} rows={flows} />
          <HistoryChart rows={flows} stableAssets={r.solvency.stableAssets} now={r.now} />
        </aside>
      </div>
    </div>
  );
}

// ── 0 · Proof cards ─────────────────────────────────────────────────────────

/** The accounts a reader checks first, each on Explorer with one plain-English line. */
function ProofCards({ r }: { r: ReserveView }) {
  const card = (key: string, title: string, address: string, what: string, extra?: { label: string; value: ReactNode; note?: string }) => (
    <li key={key} className="bg-(--color-surface) flex min-w-0 list-none flex-col gap-3 border p-6">
      <Label>{title}</Label>
      <span className="min-w-0 text-sm">
        <Explorer value={address} rpc={r.explorerRpc} />
      </span>
      <span className="font-body text-(--color-text-2) text-[13px] leading-relaxed text-pretty">{what}</span>
      {extra && (
        <span className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-3">
          <span className="font-body text-(--color-text-3) text-xs">{extra.label}</span>
          <span className="text-sm">{extra.value}</span>
          {extra.note && <span className="font-body text-(--color-text-3) text-xs">{extra.note}</span>}
        </span>
      )}
    </li>
  );
  return (
    <section aria-labelledby="proof-h" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <H3 id="proof-h">On-chain, by design</H3>
        <Link href="/reserve/verify" className="ext-link font-body text-xs">
          Every account →
        </Link>
      </div>
      <ul className="m-0 grid gap-4 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        {card("program", "Program", r.programId, "The code that enforces the reserve's rules. Every deposit, fee and claim payment runs through it.", {
          label: "Upgrade authority",
          value: <Explorer value={r.config.admin} rpc={r.explorerRpc} />,
          note: "Squads multisig",
        })}
        {card("reserve", "Reserve token account", r.addresses.reserve, "Where the stable assets sit. Only the program can move them, and only by its rules.")}
        {card("mint", "BRS mint", r.token.mint, "The token the reserve holds: BRS, a stablecoin pegged to the Brazilian real.", {
          label: "Freeze authority",
          value: r.token.freezeAuthority ? <Explorer value={r.token.freezeAuthority} rpc={r.explorerRpc} /> : <Mono style={{ fontSize: 12 }}>none</Mono>,
          note: r.token.freezeAuthority ? "can freeze any BRS account, the reserve's included" : undefined,
        })}
      </ul>
    </section>
  );
}

// ── 1 · Hero ────────────────────────────────────────────────────────────────

function Hero({ r, l }: { r: ReserveView; l: Ledger }) {
  const fmtBrs = useFmt();
  const s = r.state;
  const sol = r.solvency;
  const covered = sol.stableAssets >= sol.coverageRequired;
  const status = covered ? "var(--color-success)" : "var(--color-error)";
  const ratio = fmtRatio(sol.stableAssets, sol.coverageRequired);
  const noCover = sol.coverageRequired === 0n;
  const comparison = noCover
    ? "No cover outstanding."
    : covered
      ? `Against ${fmtBrs(sol.coverageRequired)} required.`
      : `Short ${fmtBrs(sol.coverageRequired - sol.stableAssets)} of what is required. New guarantees and redemptions are stopped; claim payments are not.`;

  const active = coverageRows(l.guarantees).filter((g) => g.active);
  const agencies = new Set(active.map((g) => g.agencyId)).size;
  const awaiting = claimsTimeline(l, r.config.payoutSlaSecs, r.now).filter((c) => c.stage === "filed").length;

  const kpis: { label: string; value: string; def: string; href?: string }[] = [
    { label: "Coverage ratio", value: ratio, def: "Stable assets held against the cover the reserve must hold." },
    { label: "NAV per share", value: fmtNav(s.navPerShare), def: "What each share is worth, after open claims are set aside.", href: "/reserve/capital" },
    {
      label: "Remaining cover",
      value: fmtBrs(s.remainingCoverTotal),
      def: `Still guaranteed on ${plural(active.length, "active guarantee")} at ${plural(agencies, "agency", "agencies")}.`,
      href: "/reserve/coverage",
    },
    { label: "Open provisions", value: fmtBrs(s.provisions), def: `Set aside for ${plural(awaiting, "claim")} filed and not yet paid.`, href: "/reserve/claims" },
  ];

  const ok = "var(--color-success)";
  const stop = "var(--color-error)";
  const badges: [string, boolean][] = [
    [`${s.mode === 0 ? "NORMAL" : "UNDERCOVERED"} MODE`, s.mode === 0],
    [s.fulfilHalted ? "QUEUE FILLS HALTED" : "QUEUE FILLS OPEN", !s.fulfilHalted],
    [r.config.paused ? "PAUSED" : "NOT PAUSED", !r.config.paused],
  ];

  return (
    <section aria-label="Reserve health" className="flex flex-col gap-6">
      <div role="status" aria-label={`Coverage status: ${covered ? "COVERED" : "UNDER-COVERED"}, ratio ${ratio}`} className="flex flex-col gap-3">
        <Label tip="BRS in the reserve token account. Excludes pending deposits and assets owed to filled redemptions.">Stable assets in the reserve</Label>
        <Mono style={{ ...NUM, fontSize: "clamp(40px, 6vw, 64px)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.03em", color: "var(--color-text)" }}>{fmtBrs(sol.stableAssets)}</Mono>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          {!noCover && (
            <span className="inline-flex items-center gap-2">
              <Dot color={status} />
              <Mono style={{ ...NUM, fontSize: 13, color: status }}>{ratio} of required</Mono>
            </span>
          )}
          <span className="font-body" style={{ color: covered ? "var(--color-text-2)" : "var(--color-error)" }}>
            {comparison}
          </span>
        </span>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        {kpis.map((k) => {
          const body = (
            <>
              <span className="flex justify-between gap-2">
                <Label>{k.label}</Label>
                {k.href && <Mono style={{ fontSize: 12, color: "var(--color-text-3)" }}>→</Mono>}
              </span>
              <Mono style={{ ...NUM, fontSize: 24, fontWeight: 700, whiteSpace: "nowrap", color: "var(--color-text)" }}>{k.value}</Mono>
              <span className="font-body text-(--color-text-2) text-[13px] leading-snug text-pretty">{k.def}</span>
            </>
          );
          const cls = "bg-(--color-surface) flex min-w-0 flex-col gap-2.5 border px-6 py-5 no-underline";
          return k.href ? (
            <Link key={k.label} href={k.href} className={`${cls} hover:[border-color:#3A3D44]`}>
              {body}
            </Link>
          ) : (
            <div key={k.label} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      <div role="group" aria-label="Program state" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <Label dim>Program state</Label>
        {badges.map(([label, fine]) => (
          <span key={label} className="inline-flex items-center gap-2">
            <Dot color={fine ? ok : stop} />
            <Mono style={{ fontSize: 11, letterSpacing: "0.06em", color: fine ? "var(--color-text-2)" : "var(--color-text)" }}>{label}</Mono>
          </span>
        ))}
      </div>
    </section>
  );
}

// ── 2 · Where the capital sits ──────────────────────────────────────────────

const PROVISION = "var(--color-copper)";
const REST = "var(--color-chart-1)";
const EARMARK = "var(--color-chart-2)";
const FREE = "var(--color-success)";
const SHORT = "var(--color-error)";

/** A ring of segments over `axis`; each segment keeps a 1-unit gap so neighbours read apart. */
function Donut({ parts, axis, center, centerLabel, centerColor }: { parts: [bigint, string][]; axis: bigint; center: string; centerLabel: string; centerColor: string }) {
  const R = 48;
  const C = 2 * Math.PI * R;
  const fracs = parts.filter(([v]) => v > 0n && axis > 0n).map(([v, stroke]) => ({ f: Number((v * 1_000_000n) / axis) / 1_000_000, stroke }));
  const segs = fracs.map(({ f, stroke }, i) => {
    const at = fracs.slice(0, i).reduce((s, x) => s + x.f, 0) * C;
    const len = Math.max(f * C - 1, 1.2);
    return { stroke, dash: `${len.toFixed(2)} ${(C - len).toFixed(2)}`, off: (-at).toFixed(2) };
  });
  return (
    <div className="relative size-[200px] shrink-0" aria-hidden="true">
      <svg width="200" height="200" viewBox="0 0 120 120" className="block -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--color-chart-track)" strokeWidth="14" />
        {segs.map((s, i) => (
          <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={s.stroke} strokeWidth="14" strokeDasharray={s.dash} strokeDashoffset={s.off} />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
        <Mono style={{ ...NUM, fontSize: 24, fontWeight: 700, lineHeight: 1, color: centerColor }}>{center}</Mono>
        <span className="font-body text-(--color-text-2) text-[11px] font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
          {centerLabel}
        </span>
      </div>
    </div>
  );
}

type SplitRow = { label: string; sub: string; value: bigint; color: string; outline?: boolean; negative?: boolean };

function splitRows(c: CapitalSplit, filed: number, coverageRatioBps: number, remainingCover: bigint, fmtBrs: (b: bigint) => string): SplitRow[] {
  const under = c.shortfall > 0n;
  const rows: SplitRow[] = [
    { label: "Committed to open claims", sub: filed ? `provisions on ${plural(filed, "filed claim")}, already out of NAV` : "provisions, booked when a claim is filed", value: c.provisions, color: PROVISION },
  ];
  if (!under || c.restRequired > 0n)
    rows.push({ label: "Rest of coverage required", sub: `${fmtBps(coverageRatioBps)} of ${fmtBrs(remainingCover)} remaining cover, beyond provisions`, value: c.restRequired, color: REST });
  if (c.earmark > 0n) rows.push({ label: "Buffer earmark", sub: "surplus held back from free capital", value: c.earmark, color: EARMARK });
  rows.push({ label: "Free capital", sub: under ? "nothing free while under-covered" : "for new guarantees and redemptions", value: c.freeCapital, color: FREE });
  if (under) rows.push({ label: "Shortfall", sub: "required, not held", value: c.shortfall, color: SHORT, outline: true, negative: true });
  return rows;
}

function WhereCapitalSits({ r, l }: { r: ReserveView; l: Ledger }) {
  const fmtBrs = useFmt();
  const c = capitalSplit(r.solvency, r.state.provisions);
  const under = c.shortfall > 0n;
  const filed = claimsTimeline(l, r.config.payoutSlaSecs, r.now).filter((x) => x.stage === "filed").length;
  const rows = splitRows(c, filed, r.config.coverageRatioBps, r.state.remainingCoverTotal, fmtBrs);
  const committed = c.provisions + c.restRequired;

  const pending = capitalQueue(r.state, l).deposits.reduce((s, x) => s + x.waiting, 0n);
  const outside = [pending > 0n && `${fmtBrs(pending)} pending deposits (escrow)`, r.incomeInbox.amount > 0n && `${fmtBrs(r.incomeInbox.amount)} in the income inbox, until swept`].filter(Boolean);

  const head = under
    ? {
        label: "Shortfall",
        value: `−${fmtBrs(c.shortfall)}`,
        color: SHORT,
        note: "Every BRS held is committed. New guarantees and redemptions are stopped until the reserve covers what is required; claim payments are not.",
      }
    : {
        label: "Free capital",
        value: fmtBrs(c.freeCapital),
        color: "var(--color-text)",
        note:
          committed === 0n
            ? "Nothing is committed. All of it can back new guarantees and redemptions."
            : `${fmtBrs(committed)} is committed${c.provisions > 0n ? `: ${fmtBrs(c.provisions)} to ${plural(filed, "filed claim")}, ${fmtBrs(c.restRequired)} to the rest of the coverage required` : " to the coverage required"}.${c.earmark > 0n ? ` ${fmtBrs(c.earmark)} is held as the buffer earmark.` : ""} The rest can back new guarantees and redemptions.`,
      };

  const grid = "grid grid-cols-[minmax(0,1fr)_auto_72px] items-center gap-x-6 gap-y-1 border-t px-6 py-3.5 sm:px-8";
  return (
    <section aria-labelledby="capital-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3 id="capital-h">Where the capital sits</H3>
        <span className="font-body text-(--color-text-2) text-[13px]">Stable assets split by what they are committed to. Free capital gates new guarantees and redemptions, never a claim payment.</span>
      </div>
      <div className="bg-(--color-surface) flex flex-col border">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-8 p-6 sm:p-8">
          <Donut
            parts={under ? [[c.stableAssets, PROVISION], [c.shortfall, SHORT]] : [[c.provisions, PROVISION], [c.restRequired, REST], [c.earmark, EARMARK], [c.freeCapital, FREE]]}
            axis={c.axis}
            center={under ? share(c.stableAssets, c.axis) : share(c.freeCapital, c.stableAssets)}
            centerLabel={under ? "of required held" : "free"}
            centerColor={under ? SHORT : "var(--color-text)"}
          />
          <div className="flex min-w-[220px] flex-1 flex-col gap-3">
            <Label>{head.label}</Label>
            <Mono style={{ ...NUM, fontSize: 36, fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: head.color }}>{head.value}</Mono>
            <span className="font-body text-(--color-text-2) text-sm leading-relaxed text-pretty">{head.note}</span>
          </div>
        </div>
        {rows.map((x) => (
          <div key={x.label} className={grid}>
            <span className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="size-2 shrink-0" style={{ background: x.outline ? "transparent" : x.color, border: `1px solid ${x.color}` }} />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-body text-(--color-text) text-[13px]">{x.label}</span>
                <span className="font-body text-(--color-text-3) text-xs">{x.sub}</span>
              </span>
            </span>
            <Mono style={{ ...NUM, fontSize: 14, textAlign: "right", color: x.negative ? SHORT : x.value === 0n ? "var(--color-text-2)" : "var(--color-text)" }}>
              {x.negative ? `−${fmtBrs(x.value)}` : fmtBrs(x.value)}
            </Mono>
            <Mono style={{ ...NUM, fontSize: 12, textAlign: "right", color: "var(--color-text-2)" }}>{x.negative ? "—" : share(x.value, c.stableAssets)}</Mono>
          </div>
        ))}
        <div className={`${grid} bg-(--color-surface-2) [border-color:#3A3D44]`}>
          <span className="font-body text-(--color-text) text-[13px] font-medium">Stable assets</span>
          <Mono style={{ ...NUM, fontSize: 14, fontWeight: 700, textAlign: "right", color: "var(--color-text)" }}>{fmtBrs(c.stableAssets)}</Mono>
          <Mono style={{ ...NUM, fontSize: 12, textAlign: "right", color: "var(--color-text-2)" }}>100%</Mono>
        </div>
      </div>
      {outside.length > 0 && <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)" }}>Not counted until they land: {outside.join(" · ")}.</Mono>}
    </section>
  );
}

// ── 3 · What never changes ──────────────────────────────────────────────────

function Promises() {
  return (
    <section aria-labelledby="promises-h" className="flex flex-col gap-4">
      <H3 id="promises-h">What never changes</H3>
      <ol className="m-0 grid gap-4 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {PROMISES.map(([text, note, href, cta], i) => (
          <li key={href} className="bg-(--color-surface) flex list-none flex-col gap-2 border p-6">
            <Mono style={{ ...NUM, fontSize: 12, color: "var(--color-accent)" }}>{String(i + 1).padStart(2, "0")}</Mono>
            <span className="font-body text-(--color-text) text-sm font-medium text-pretty">{text}</span>
            <span className="font-body text-(--color-text-2) text-[13px]">{note}</span>
            <Link href={href} className="ext-link font-body mt-1 self-start text-xs">
              {cta} →
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Side · Recent activity ──────────────────────────────────────────────────

function RecentActivity({ r, rows }: { r: ReserveView; rows: FlowRow[] }) {
  const since = r.now - ACTIVITY_DAYS * 86_400n;
  const recent = rows.filter((x) => x.at !== null && x.at >= since).length;
  const shown = rows.slice(0, ACTIVITY_ROWS);
  return (
    <section aria-labelledby="activity-h" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex flex-col gap-0.5">
          <H3 id="activity-h">Recent activity</H3>
          <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)" }}>
            {plural(recent, "movement")} in the last {ACTIVITY_DAYS.toString()} days
          </Mono>
        </span>
        <Link href="/reserve/capital" className="ext-link font-body text-xs">
          Full ledger →
        </Link>
      </div>
      {shown.length === 0 ? (
        <p className="font-body text-(--color-text-3) m-0 py-3 text-[13px]">No movements yet.</p>
      ) : (
        <ul className="m-0 flex flex-col p-0">
          {shown.map((x, i) => (
            <ActivityRow key={`${x.kind}-${x.account}`} x={x} now={r.now} rpc={r.explorerRpc} last={i === shown.length - 1} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ActivityRow({ x, now, rpc, last }: { x: FlowRow; now: bigint; rpc: string; last: boolean }) {
  const fmtBrs = useFmt();
  const into = x.reserveDelta >= 0n;
  return (
    <li className="grid list-none grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 py-3" style={{ borderBottom: last ? "none" : "1px solid var(--color-border)" }}>
      <span aria-hidden="true" className="bg-(--color-surface-2) inline-flex size-9 items-center justify-center border">
        <Mono style={{ fontSize: 14, color: into ? "var(--color-success)" : "var(--color-text-2)" }}>{into ? "↓" : "↑"}</Mono>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-body text-(--color-text) text-[13px]">{FLOW_LABEL[x.kind]}</span>
        <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.detail}</Mono>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Mono style={{ ...NUM, fontSize: 13, color: into ? "var(--color-success)" : "var(--color-text)" }}>
          {into ? "+" : "−"}
          {fmtBrs(abs(x.reserveDelta))}
        </Mono>
        <Explorer value={x.account} kind={x.isTx ? "tx" : "address"} rpc={rpc} label={x.at === null ? "open" : `${fmtDuration(now - x.at)} ago`} />
      </span>
    </li>
  );
}
