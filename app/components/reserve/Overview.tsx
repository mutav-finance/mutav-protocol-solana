"use client";

/**
 * /reserve Overview answers one question: "Can the reserve cover every open
 * guarantee?" Main column, top to bottom:
 *   1. Hero: the reserve balance, one status line against what it must hold,
 *      four figures that open their tab, and what the program has open.
 *   2. Where the capital sits: the reserve balance split by what it backs.
 *   3. What the program enforces: the two spec promises.
 * Side column: the latest movements of the ledger, then the reserve balance
 * over time rebuilt from those movements.
 * Renders on-chain values from /api/ledger; nothing beyond sums and shares.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { useReserve } from "@/components/reserve/ReserveShell";
import { HistoryChart } from "@/components/reserve/HistoryChart";
import { FlowDiagram } from "@/components/reserve/FlowDiagram";
import { HeroAmount, Lead, abs, fmtAgo, plural } from "@/components/reserve/sections/shared";
import { capitalSplit, type CapitalSplit } from "@/lib/charts";
import { fmtBps, fmtBrs, fmtRatio, fmtSharePrice, fmtTime } from "@/lib/format";
import { Money } from "@/components/MoneyProvider";
import { FLOW_KIND_LABEL, capitalQueue, claimsTimeline, coverageRows, isUnpaid, moneyFlows, type FlowRow, type ReserveView, type Ledger } from "@/lib/view";

/** The two promises the spec makes, each linked to the view that shows them. */
const PROMISES: [string, string, string, string][] = [
  ["Claim payments are never blocked by required coverage.", "The gate stops new guarantees and redemptions only.", "/reserve/claims", "See claims"],
  ["New capital needs an approved wallet.", "The allowlist gates new capital; existing holders can always redeem (KYC off-chain). Every request waits in the same line.", "/reserve/capital#queue", "See the capital queue"],
];

/** Movements shown in the side column, and the window the count covers. */
const ACTIVITY_ROWS = 5;
const ACTIVITY_DAYS = 60n;

const NUM = { fontVariantNumeric: "tabular-nums" } as const;
const share = (part: bigint, whole: bigint) => (whole === 0n ? "—" : fmtBps(Number((part * 10_000n) / whole)));

/** `a` as a multiple of `b`, one decimal, rounded down: 23.6×. */
function multiple(a: bigint, b: bigint): string {
  if (b === 0n) return "—";
  const tenths = (a * 10n) / b;
  return `${(tenths / 10n).toLocaleString("en-US")}.${(tenths % 10n).toString()}×`;
}

/** Inter Medium 12px caps label (STYLE.md card label), with an optional definition tooltip. */
function Label({ children, tip }: { children: string; tip?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
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
      <div className="grid grid-cols-1 items-start gap-10 min-[1120px]:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-14">
          <Hero r={r} l={d.ledger} />
          <WhereCapitalSits r={r} l={d.ledger} />
          <section aria-labelledby="flow-h" className="flex flex-col gap-4">
            <h3 id="flow-h" className="font-display text-(--color-text) m-0 text-base font-bold">
              How money moves
            </h3>
            <FlowDiagram />
          </section>
          <Promises />
        </div>
        <aside className="flex min-w-0 flex-col gap-10">
          <RecentActivity r={r} rows={flows} />
          <HistoryChart rows={flows} stableAssets={r.coverage.stableAssets} now={r.now} />
        </aside>
      </div>
    </div>
  );
}

// ── 1 · Hero ────────────────────────────────────────────────────────────────

const ALL_OPS = ["guarantees", "deposits", "redemptions"] as const;

/** What the program has open, in one plain line; when something is stopped, it says what and why. */
function programLine(r: ReserveView): { text: string; fine: boolean } {
  const stopped = new Set<string>();
  const why: string[] = [];
  if (r.config.paused) {
    ALL_OPS.forEach((x) => stopped.add(x));
    why.push("paused");
  }
  if (r.state.mode !== 0) {
    stopped.add("guarantees");
    stopped.add("redemptions");
    why.push("under-covered");
  }
  if (r.state.fulfilHalted) {
    stopped.add("deposits");
    stopped.add("redemptions");
    why.push("queue fills halted");
  }
  if (stopped.size === 0) return { text: "Nothing paused: guarantees and queue fills run normally.", fine: true };
  const open = ALL_OPS.filter((x) => !stopped.has(x));
  const list = ALL_OPS.filter((x) => stopped.has(x)).join(", ");
  return { text: `Stopped: new ${list} (${why.join("; ")}).${open.length ? ` Open: ${open.join(", ")}.` : ""} Claim payments are never stopped.`, fine: false };
}

function Hero({ r, l }: { r: ReserveView; l: Ledger }) {
  const s = r.state;
  const sol = r.coverage;
  const covered = sol.stableAssets >= sol.coverageRequired;
  const status = covered ? "var(--color-success)" : "var(--color-error)";
  const ratio = fmtRatio(sol.stableAssets, sol.coverageRequired);
  const noCover = sol.coverageRequired === 0n;
  const statusLine = noCover ? (
    <>
      <span className="text-(--color-text) font-semibold">Covered:</span> no cover outstanding.
    </>
  ) : covered ? (
    <>
      <span className="text-(--color-text) font-semibold">Covered:</span> holds <Mono style={{ ...NUM, color: "var(--color-text)" }}>{multiple(sol.stableAssets, sol.coverageRequired)}</Mono> the{" "}
      <Mono style={{ ...NUM, color: "var(--color-text)" }}>{fmtBrs(sol.coverageRequired)}</Mono> it must hold.
    </>
  ) : (
    <>
      <span className="font-semibold">Short {fmtBrs(sol.coverageRequired - sol.stableAssets)} of what it must hold.</span> New guarantees and redemptions are stopped; claim payments are not.
    </>
  );

  const active = coverageRows(l.guarantees).filter((g) => g.active);
  const agencies = new Set(active.map((g) => g.agencyId)).size;
  const awaiting = claimsTimeline(l).filter((c) => isUnpaid(c.stage)).length;

  const kpis: { label: string; value: ReactNode; def: string; href?: string }[] = [
    { label: "Free capital", value: <Money brs={sol.freeCapital} block />, def: "Free for new guarantees and redemptions." },
    { label: `Share price (published at last refresh · ${fmtTime(s.lastRefreshTs)})`, value: fmtSharePrice(s.navPerShare), def: "What each share is worth, after claims are set aside." },
    {
      label: "Remaining cover",
      value: <Money brs={s.remainingCoverTotal} block />,
      def: `Still guaranteed on ${plural(active.length, "active guarantee")} at ${plural(agencies, "agency", "agencies")}.`,
      href: "/reserve/coverage",
    },
    { label: "Set aside for claims", value: <Money brs={s.provisions} block />, def: `For ${plural(awaiting, "claim")} filed, not yet paid.`, href: "/reserve/claims" },
  ];

  const program = programLine(r);

  return (
    <section aria-label="Reserve health" className="flex flex-col gap-6">
      <div role="status" aria-label={`Coverage status: ${covered ? "COVERED" : "UNDER-COVERED"}, ratio ${ratio}`}>
        {/* The one amber figure of the view. */}
        <HeroAmount
          phrase="Reserve balance"
          tip="BRS in the reserve token account. Deposits waiting in line and BRS owed to filled redemptions are not counted."
          value={fmtBrs(sol.stableAssets)}
          usd={sol.stableAssets}
          color="var(--color-accent)"
          size="clamp(44px, 6.5vw, 72px)"
        >
          <span className="relative top-[-1px] inline-flex">
            <Dot color={status} />
          </span>
          <span className="font-body leading-relaxed" style={{ color: covered ? "var(--color-text-2)" : "var(--color-error)" }}>
            {statusLine}
          </span>
        </HeroAmount>
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

      <p role="group" aria-label="Program state" className="font-body m-0 flex items-baseline gap-2.5 text-[13px]">
        <span className="relative top-[-1px] inline-flex">
          <Dot color={program.fine ? "var(--color-success)" : "var(--color-error)"} />
        </span>
        <span style={{ color: program.fine ? "var(--color-text-2)" : "var(--color-text)" }}>{program.text}</span>
      </p>
    </section>
  );
}

// ── 2 · Where the capital sits ──────────────────────────────────────────────

const PROVISION = "var(--color-copper)";
const REST = "var(--color-chart-2)";
const FREE = "var(--color-chart-1)";
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

function splitRows(c: CapitalSplit, filed: number): SplitRow[] {
  const under = c.shortfall > 0n;
  const rows: SplitRow[] = [
    { label: "Set aside for claims", sub: filed ? `${plural(filed, "claim")} filed, not yet paid` : "booked when a claim is filed", value: c.provisions, color: PROVISION },
  ];
  if (!under || c.restRequired > 0n) rows.push({ label: "Required buffer", sub: "Required beyond provisions (ratio or stress floor)", value: c.restRequired, color: REST });
  rows.push({ label: "Free capital", sub: under ? "nothing free while under-covered" : "Free for new guarantees and redemptions.", value: c.freeCapital, color: FREE });
  if (under) rows.push({ label: "Shortfall", sub: "required, not held", value: c.shortfall, color: SHORT, outline: true, negative: true });
  return rows;
}

function WhereCapitalSits({ r, l }: { r: ReserveView; l: Ledger }) {
  const c = capitalSplit(r.coverage, r.state.provisions);
  const under = c.shortfall > 0n;
  const filed = claimsTimeline(l).filter((x) => isUnpaid(x.stage)).length;
  const rows = splitRows(c, filed);
  const committed = c.provisions + c.restRequired;

  const pending = capitalQueue(r.state, l).deposits.reduce((s, x) => s + x.waiting, 0n);
  const outside = [pending > 0n && `${fmtBrs(pending)} deposits in line`, r.incomeInbox.amount > 0n && `${fmtBrs(r.incomeInbox.amount)} issuer income to sweep in`].filter(Boolean);

  const head = under
    ? {
        label: "Shortfall",
        value: <Money brs={c.shortfall} sign="−" block />,
        color: SHORT,
        note: "Every BRS held is committed. New guarantees and redemptions are stopped until the reserve holds what it must; claim payments are not.",
      }
    : {
        label: "Free capital",
        value: <Money brs={c.freeCapital} block />,
        color: "var(--color-text)",
        note:
          committed === 0n
            ? "Nothing is committed. All of it is free for new guarantees and redemptions."
            : `${fmtBrs(committed)} is committed to claims and cover. The rest is free for new guarantees and redemptions.`,
      };

  // Phones: the description drops under the row so the label keeps its width; sm+: it sits under the label.
  const grid = "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1 border-t px-6 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto_72px] sm:gap-x-6 sm:px-8";
  return (
    <section aria-labelledby="capital-h" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <H3 id="capital-h">Where the capital sits</H3>
        <span className="font-body text-(--color-text-2) text-[13px]">What the reserve&apos;s assets back today.</span>
      </div>
      <div className="bg-(--color-surface) flex flex-col border">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-8 p-6 sm:p-8">
          <Donut
            parts={under ? [[c.stableAssets, PROVISION], [c.shortfall, SHORT]] : [[c.provisions, PROVISION], [c.restRequired, REST], [c.freeCapital, FREE]]}
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
            <span className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="size-2 shrink-0" style={{ background: x.outline ? "transparent" : x.color, border: `1px solid ${x.color}` }} />
              <span className="font-body text-(--color-text) text-[13px]">{x.label}</span>
            </span>
            <span className="font-body text-(--color-text-3) col-span-3 col-start-1 row-start-2 pl-5 text-xs sm:col-span-1">{x.sub}</span>
            <Mono className="col-start-2 row-start-1 sm:row-span-2" style={{ ...NUM, fontSize: 14, textAlign: "right", color: x.negative ? SHORT : x.value === 0n ? "var(--color-text-2)" : "var(--color-text)" }}>
              {x.negative ? `−${fmtBrs(x.value)}` : fmtBrs(x.value)}
            </Mono>
            <Mono className="col-start-3 row-start-1 sm:row-span-2" style={{ ...NUM, fontSize: 12, textAlign: "right", color: "var(--color-text-2)" }}>{x.negative ? "—" : share(x.value, c.stableAssets)}</Mono>
          </div>
        ))}
        <div className={`${grid} bg-(--color-surface-2) [border-color:#3A3D44]`}>
          <span className="font-body text-(--color-text) text-[13px] font-medium">Reserve balance</span>
          <Mono style={{ ...NUM, fontSize: 14, fontWeight: 700, textAlign: "right", color: "var(--color-text)" }}>{fmtBrs(c.stableAssets)}</Mono>
          <Mono style={{ ...NUM, fontSize: 12, textAlign: "right", color: "var(--color-text-2)" }}>100%</Mono>
        </div>
      </div>
      {outside.length > 0 && <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)" }}>Not yet in the reserve: {outside.join(" · ")}.</Mono>}
    </section>
  );
}

// ── 3 · What the program enforces ──────────────────────────────────────────────────

function Promises() {
  return (
    <section aria-labelledby="promises-h" className="flex flex-col gap-4">
      <H3 id="promises-h">What the program enforces</H3>
      <ol className="m-0 grid gap-4 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}>
        {PROMISES.map(([text, note, href, cta], i) => (
          <li key={href} className="bg-(--color-surface) flex list-none flex-col gap-2 border p-6">
            <Mono style={{ ...NUM, fontSize: 12, color: "var(--color-text-3)" }}>{String(i + 1).padStart(2, "0")}</Mono>
            <Lead lead={text} className="text-sm">
              {note}
            </Lead>
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
        <Link href="/reserve/capital#ledger" className="ext-link font-body text-xs">
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
  const into = x.reserveDelta >= 0n;
  // A bare "slot N" says nothing to a reader; the slot stays in the hover title (as in the ledger).
  const slotOnly = /^slot \d+$/.test(x.detail);
  return (
    <li className="grid list-none grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3.5 py-3" style={{ borderBottom: last ? "none" : "1px solid var(--color-border)" }}>
      <span aria-hidden="true" className="bg-(--color-surface-2) inline-flex size-9 items-center justify-center border">
        <Mono style={{ fontSize: 14, color: "var(--color-text-2)" }}>{into ? "↓" : "↑"}</Mono>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5" title={slotOnly ? x.detail : undefined}>
        <span className="font-body text-(--color-text) text-[13px]">{FLOW_KIND_LABEL[x.kind]}</span>
        {!slotOnly && <Mono style={{ ...NUM, fontSize: 11, color: "var(--color-text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.detail}</Mono>}
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <Mono style={{ ...NUM, fontSize: 13, color: "var(--color-text)" }}>
          {into ? "+" : "−"}
          {fmtBrs(abs(x.reserveDelta))}
        </Mono>
        <Explorer value={x.account} kind={x.isTx ? "tx" : "address"} rpc={rpc} label={x.at === null ? "open" : fmtAgo(now, x.at)} />
      </span>
    </li>
  );
}
