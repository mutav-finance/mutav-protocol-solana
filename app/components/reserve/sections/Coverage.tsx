"use client";

/**
 * /reserve · Coverage. Answers one question: how much does the reserve still
 * guarantee, and where does it sit? Renders on-chain values from /api/ledger;
 * nothing is computed here beyond sums, differences and display shares of
 * account fields.
 *
 * Layout (shared visual reference): [B+C] one hero tile (capacity left up to the
 * coverage ceiling in %, the bar of cover in use against that ceiling, and a
 * 2-cell strip splitting remaining cover between unpaid rent and move-out debts), [E]
 * the guarantee table with per-row detail on expand, [E] the agency table with
 * share meters (the program sets no per-agency cap, ADR 0019), [F] the totals that close the sums, [G] how the
 * coverage ceiling follows from the reserve (the inverse of the register_guarantee gate). What is set aside for filed
 * claims lives on the Claims tab.
 */
import { useState, type ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { Button } from "@/components/ui/button";
import { fmtBps, fmtBrs, fmtPct, fmtTime } from "@/lib/format";
import { Money } from "@/components/MoneyProvider";
import { capacityLeft, coverageCeilingOf, frac, type CoverageCeiling } from "@/lib/charts";
import { activeRemainingCover, agencyRows, coverageRows, type AgencyRow, type CoverageRow, type Ledger, type ReserveView } from "@/lib/view";
import { C } from "@/components/charts/Charts";
import { coverageRequired, stressTerm } from "@mutav-finance/mutav-protocol-solana";
import { TotalsStrip, type TotalsTerm } from "@/components/reserve/sections/Flows";

import { BlockHead, CEILING_BLOCK, Empty, HeroPercent, Lead, MotionStyle, Num, PlusMark, Table, plural, short } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Coverage ────────────────────────────────────────────────────────────────

const LABEL = "font-body text-(--color-text-2) m-0 text-xs font-medium uppercase";
const LABEL_STYLE = { letterSpacing: "0.01em" };

/** Leg colours: one meaning everywhere on the page (hero bar, strip swatches, row bars). The default leg reads as "Unpaid rent", the exit leg as "Move-out debts". */
const LEG = { default: C.ink, exit: C.mid };

/** `part` as a share of `whole`, for display only; an em dash when there is no whole. */
const share = (part: bigint, whole: bigint) => (whole > 0n ? fmtBps((part * 10_000n) / whole, 1) : "—");

/** Active guarantees by remaining cover (largest first), then closed ones by registration. */
function byRemaining(rows: CoverageRow[]): CoverageRow[] {
  return [...rows].sort(
    (a, b) => Number(b.active) - Number(a.active) || (b.remaining > a.remaining ? 1 : b.remaining < a.remaining ? -1 : 0) || Number(a.registeredAt - b.registeredAt),
  );
}

const GUARANTEE_HEAD: (string | [string, "num"])[] = ["Guarantee", "Agency", ["Remaining", "num"], ["Unpaid rent left", "num"], ["Move-out debts left", "num"]];
const COVER_TIPS = {
  Remaining: "Unpaid rent left plus move-out debts left. Bars scale to the largest active guarantee.",
  "Unpaid rent left": "The default leg: limit for rent and charges in arrears while the lease runs, minus what was already paid on it.",
  "Move-out debts left": "The exit leg: limit for the tenant's debts up to and at the end of occupation, minus what was already paid on it.",
};
const AGENCY_TIPS = {
  "Share of remaining cover": "Remaining cover of the agency ÷ remaining cover of every active guarantee. The program sets no per-agency cap.",
  "Active / total": "Active guarantees of all those registered for the agency.",
};

/** 8px square legend swatch. */
const Swatch = ({ color }: { color: string }) => <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0" style={{ background: color }} />;

/** The inline legend of the two legs, shared by the hero bar and the row bars. */
function LegLegend() {
  return (
    <span className="font-mono text-(--color-text-3) inline-flex items-center gap-4 text-xs">
      <span className="inline-flex items-center gap-2">
        <Swatch color={LEG.default} /> Unpaid rent
      </span>
      <span className="inline-flex items-center gap-2">
        <Swatch color={LEG.exit} /> Move-out debts
      </span>
    </span>
  );
}

/** A small in-row bar: segments laid left to right on a track, scaled by the caller. */
function MiniBar({ segs }: { segs: { f: number; color: string }[] }) {
  return (
    <span aria-hidden="true" className="inline-flex h-1.5 w-24 shrink-0" style={{ background: "var(--color-chart-track)" }}>
      <span className="mv-grow flex h-full w-full gap-px">
        {segs.filter((s) => s.f > 0).map((s, i) => (
          <span key={i} className="block h-full" style={{ width: `${Math.max(s.f * 100, 1)}%`, background: s.color }} />
        ))}
      </span>
    </span>
  );
}

/** Share meter: the agency's remaining cover against the remaining cover of every active guarantee. */
function ShareMeter({ a, total }: { a: AgencyRow; total: bigint }) {
  return (
    <span aria-hidden="true" className="relative inline-block h-2 w-24 shrink-0 border" style={{ background: "var(--color-chart-track)" }}>
      <span className="mv-grow absolute inset-y-0 left-0 block" style={{ width: `${frac(a.outstandingCover, total) * 100}%`, background: C.ink }} />
    </span>
  );
}

/** One label/value pair in the hero strip; `sub` is a one-line plain-English definition. */
function StripCell({ label, swatch, value, sub, color }: { label: string; swatch?: string; value: ReactNode; sub: ReactNode; color?: string }) {
  return (
    <div className="bg-(--color-surface) flex min-w-0 flex-col gap-2 px-4 py-3">
      <p className={`${LABEL} inline-flex items-center gap-2`} style={LABEL_STYLE}>
        {swatch && <Swatch color={swatch} />}
        {label}
      </p>
      <Mono style={{ fontSize: 20, fontWeight: 700, color: color ?? "var(--color-text)", whiteSpace: "nowrap" }}>{value}</Mono>
      <span className="font-body text-(--color-text-2) text-xs leading-snug">{sub}</span>
    </div>
  );
}

/** A guarantee row; its secondary fields open in a detail row under it (rendered only when open). */
function GuaranteeRow({ g, axis, agency }: { g: CoverageRow; axis: bigint; agency: ReactNode }) {
  const [open, setOpen] = useState(false);
  const detailId = `g-${g.address}`;
  return (
    <>
      <tr>
        <td>
          <span className="inline-flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={open ? detailId : undefined}
              aria-label={`${open ? "Hide" : "Show"} details of guarantee ${short(g.id)}`}
              onClick={() => setOpen((v) => !v)}
              className="text-(--color-text-3) hover:text-(--color-text) h-6 w-6 px-0 font-mono"
            >
              <PlusMark open={open} />
            </Button>
            <Mono>{short(g.id)}</Mono>
          </span>
        </td>
        <td>{agency}</td>
        <td className="num">
          {g.active ? (
            <span className="inline-flex items-center gap-3">
              <MiniBar segs={[{ f: frac(g.defaultRemaining, axis), color: LEG.default }, { f: frac(g.exitRemaining, axis), color: LEG.exit }]} />
              <Mono>{fmtBrs(g.remaining)}</Mono>
            </span>
          ) : (
            <Mono dim>—</Mono>
          )}
        </td>
        <Num>{fmtBrs(g.defaultRemaining)}</Num>
        <Num>{fmtBrs(g.exitRemaining)}</Num>
      </tr>
      {open && (
        <tr id={detailId} className="bg-(--color-surface-2)">
          <td colSpan={GUARANTEE_HEAD.length}>
            <dl className="m-0 grid grid-cols-2 gap-x-8 gap-y-3 py-1 pl-8 md:grid-cols-4">
              <Detail term="Open claims">
                <Mono>{g.openClaims}</Mono>
              </Detail>
              <Detail term="Registered">
                <Mono>{fmtTime(g.registeredAt).slice(0, 10)}</Mono>
              </Detail>
              <Detail term="Account">
                <Explorer value={g.address} label={`${g.address.slice(0, 4)}…${g.address.slice(-4)}`} />
              </Detail>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-body text-(--color-text-3) text-xs font-medium uppercase" style={LABEL_STYLE}>
        {term}
      </dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

/** [G] How the ceiling works: the reserve, the ratio or stress floor, and the most cover that fits. Every figure from the accounts. */
function HowTheCeilingWorks({ r, k, byRatio, floor }: { r: ReserveView; k: CoverageCeiling; byRatio: bigint; floor: bigint }) {
  const c = fmtPct(r.config.coverageRatioBps);
  const s = r.coverage;
  const fig = { color: "var(--color-text)" } as const;
  const steps: [string, ReactNode][] = [
    [`Reserve: ${fmtBrs(s.stableAssets)}.`, "The BRS held in the reserve token account."],
    [
      `${c} ratio, or the stress floor.`,
      <>
        Every R$ 1.00 of remaining cover needs R$ {(r.config.coverageRatioBps / 10_000).toFixed(2)} in the reserve. While few leases are open, a floor applies instead: claims set aside (<Money brs={r.state.provisions} />) plus the stress buffer (<Money brs={r.config.caps.stressBuffer} />).
      </>,
    ],
    [
      `Maximum cover: ${fmtBrs(k.ceiling)}.`,
      k.blockedBy
        ? `No new guarantee fits while ${CEILING_BLOCK[k.blockedBy]}.`
        : `${k.binding === "stress" ? "While the floor applies, total cover can grow only up to the reserve balance itself." : `The reserve divided by ${c}.`} A new lease is accepted while total remaining cover stays at or below this.`,
    ],
  ];
  const binds =
    k.binding === "stress"
      ? "The stress floor sets the ceiling while the reserve is below claims set aside plus the stress buffer."
      : k.binding === "ratio"
        ? `The ${c} ratio sets the ceiling.`
        : `No new guarantees fit now: ${CEILING_BLOCK[k.blockedBy!]}.`;
  return (
    <section aria-labelledby="ceiling-h" className="flex flex-col gap-4">
      <BlockHead
        id="ceiling-h"
        title="How the ceiling works"
        note={
          <Lead lead={`${fmtBrs(r.state.remainingCoverTotal)} guaranteed across ${plural(r.state.activeGuarantees, "lease")}`} className="text-sm">
            is the most the reserve would pay if every lease defaulted for its full limit at the same time (unpaid rent plus move-out debts). The reserve is sized for
            defaults as they happen, not for all of them at once: the program requires {c} of that amount
            {floor > byRatio ? ", or the stress floor when higher" : ""} (<span style={fig}><Money brs={s.coverageRequired} /></span>), and the reserve holds{" "}
            <span style={fig}><Money brs={s.stableAssets} /></span>. Claims already filed are set aside first, and a new lease is refused if it would push the
            requirement above the reserve.
          </Lead>
        }
      />
      <ol className="m-0 grid gap-4 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))" }}>
        {steps.map(([lead, note], i) => (
          <li key={i} className="bg-(--color-surface) flex list-none flex-col gap-2 border p-6">
            <Mono style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color: "var(--color-text-3)" }}>{String(i + 1).padStart(2, "0")}</Mono>
            <Lead lead={lead} className="text-sm">
              {note}
            </Lead>
          </li>
        ))}
      </ol>
      <p className="m-0">
        <Lead lead={binds} className="text-sm">
          Guarantee fees (after the MUTAV fee) and BRS issuer income add to the reserve and raise the ceiling, so more leases fit.
          {k.binding === "ratio" && r.config.coverageRatioBps > 0 ? ` Each R$ 1.00 added raises it by R$ ${(10_000 / r.config.coverageRatioBps).toFixed(2)}.` : ""}
        </Lead>
      </p>
    </section>
  );
}

export function Coverage({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = byRemaining(coverageRows(l.guarantees));
  const agencies = agencyRows(l.guarantees);
  const sum = activeRemainingCover(rows);
  const active = rows.filter((g) => g.active);
  const closed = rows.filter((g) => !g.active);
  const defaultLeft = active.reduce((s, g) => s + g.defaultRemaining, 0n);
  const exitLeft = active.reduce((s, g) => s + g.exitRemaining, 0n);
  const coverAxis = active.reduce((m, g) => (g.remaining > m ? g.remaining : m), 0n);
  // Agencies have no name on-chain: number them in table order; the hash stays beside.
  const agencyName = new Map(agencies.map((a, i) => [a.agencyId, `Agency ${i + 1}`]));
  const registered = new Map<string, number>();
  for (const g of rows) registered.set(g.agencyId, (registered.get(g.agencyId) ?? 0) + 1);
  const AgencyCell = ({ id }: { id: string }) => (
    <span className="inline-flex items-baseline gap-2">
      {agencyName.has(id) && <span className="font-body text-(--color-text) text-sm">{agencyName.get(id)}</span>}
      <Mono dim>{short(id)}</Mono>
    </span>
  );
  const row = (g: CoverageRow) => <GuaranteeRow key={g.address} g={g} axis={coverAxis} agency={<AgencyCell id={g.agencyId} />} />;

  // [F] Totals that close the sums. Coverage required is the higher of ceil(c × remaining cover)
  // and provisions + min(stress buffer, unprovisioned cover) (spec §4, ADR 0016, ADR 0022). Both legs
  // come from the client's math mirror: the ratio leg with provisions and stress buffer at 0.
  const s = r.coverage;
  const byRatio = coverageRequired(r.state.remainingCoverTotal, r.config.coverageRatioBps, 0n, 0n);
  const floor = stressTerm(r.state.remainingCoverTotal, r.state.provisions, r.config.caps.stressBuffer);
  const totals: TotalsTerm[][] = [
    [
      { label: "Unpaid rent", value: fmtBrs(defaultLeft) },
      { op: "+", label: "Move-out debts", value: fmtBrs(exitLeft) },
      { op: "=", label: "Remaining cover", value: fmtBrs(sum), result: true },
    ],
    [
      { label: `${fmtPct(r.config.coverageRatioBps)} × remaining cover`, value: fmtBrs(byRatio) },
      { op: "or", label: "Provisions + stress buffer", value: fmtBrs(floor) },
      { op: "=", label: "Coverage required (higher of the two)", value: fmtBrs(s.coverageRequired), result: true },
    ],
  ];
  // The third sum only when it closes exactly (not under-covered).
  if (s.stableAssets >= s.coverageRequired && s.stableAssets - s.coverageRequired === s.freeCapital)
    totals.push([
      { label: "Reserve balance", value: fmtBrs(s.stableAssets) },
      { op: "−", label: "Coverage required", value: fmtBrs(s.coverageRequired) },
      { op: "=", label: "Free capital", value: fmtBrs(s.freeCapital), result: true },
    ]);
  const agenciesActive = new Set(active.map((g) => g.agencyId)).size;
  // The hero: capacity left up to the ceiling, the inverse of the register_guarantee gate.
  const k = coverageCeilingOf(r);
  const axis = k.inUse > k.ceiling ? k.inUse : k.ceiling;
  const used = k.inUse < k.ceiling ? k.inUse : k.ceiling;
  const over = k.inUse > k.ceiling ? k.inUse - k.ceiling : 0n;

  return (
    <div className="flex flex-col gap-8">
      <MotionStyle />
      <div className="bg-(--color-surface) flex flex-col gap-6 border p-6">
        <HeroPercent phrase="Capacity left" value={capacityLeft(k)}>
          <span className="font-body text-(--color-text-2) flex flex-col gap-1 leading-relaxed">
            {k.blockedBy && <span style={{ color: "var(--color-error)" }}>{`No new lease fits while ${CEILING_BLOCK[k.blockedBy]}.`}</span>}
            <span>
              <span className="whitespace-nowrap"><Money brs={k.headroom} places={0} /></span> of the <span className="whitespace-nowrap"><Money brs={k.ceiling} places={0} /></span> ceiling free for new leases.
            </span>
            <span>
              <span className="whitespace-nowrap"><Money brs={k.inUse} places={0} /></span>
              {` in use on ${plural(active.length, "active guarantee", "active guarantees")} at ${plural(agenciesActive, "agency", "agencies")}, after claims paid.`}
            </span>
          </span>
        </HeroPercent>
        {/* [D] One bar, matching the hero: cover in use against the capacity left up to the ceiling (and any cover above it). */}
        <div className="flex flex-col gap-3">
          <div
            role="img"
            aria-label={`Remaining cover ${fmtBrs(k.inUse)} of a ${fmtBrs(k.ceiling)} ceiling; capacity left ${fmtBrs(k.headroom)} (${capacityLeft(k)})${over > 0n ? `; ${fmtBrs(over)} above the ceiling` : ""}${k.blockedBy ? `; none available while ${CEILING_BLOCK[k.blockedBy]}` : ""}.`}
            className="flex h-2 w-full"
            style={{ background: "var(--color-chart-track)" }}
          >
            <span className="mv-grow flex h-full w-full gap-px">
              {[
                { v: used, color: C.ink },
                { v: k.headroom, color: C.good },
                { v: over, color: C.bad },
              ]
                .filter((x) => x.v > 0n)
                .map((x, i) => (
                  <span key={i} className="block h-full" style={{ width: `${frac(x.v, axis) * 100}%`, background: x.color }} />
                ))}
            </span>
          </div>
          <span className="font-mono text-(--color-text-3) inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-2">
              <Swatch color={C.ink} /> In use
            </span>
            {k.headroom > 0n && (
              <span className="inline-flex items-center gap-2">
                <Swatch color={C.good} /> Capacity left
              </span>
            )}
            {over > 0n && (
              <span className="inline-flex items-center gap-2">
                <Swatch color={C.bad} /> Above the ceiling
              </span>
            )}
          </span>
        </div>
        <div className="-mx-px grid grid-cols-1 gap-px border sm:grid-cols-2" style={{ background: "var(--color-border)" }}>
          <StripCell label="Unpaid rent" swatch={LEG.default} value={<Money brs={defaultLeft} block />} sub={`Rent and charges in arrears while leases run (the default leg); ${share(defaultLeft, sum)} of remaining.`} />
          <StripCell label="Move-out debts" swatch={LEG.exit} value={<Money brs={exitLeft} block />} sub={`Tenant debts up to and at the end of occupation (the exit leg); ${share(exitLeft, sum)} of remaining.`} />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <BlockHead title="By guarantee" note="Largest remaining cover first. Open a row for claims and the account." aside={<LegLegend />} />
        {rows.length === 0 ? (
          <Empty>No guarantees registered yet. Each one appears here once the Operator registers it.</Empty>
        ) : (
          <>
            {active.length === 0 ? (
              <Empty>No active guarantees.</Empty>
            ) : (
              <Table label="Remaining cover by guarantee" head={GUARANTEE_HEAD} tips={COVER_TIPS}>
                {active.map(row)}
              </Table>
            )}
            {closed.length > 0 && (
              <details className="group">
                <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                  <PlusMark />
                  Closed guarantees <Mono dim>({closed.length})</Mono>
                </summary>
                <Table label="Closed guarantees" head={GUARANTEE_HEAD} tips={COVER_TIPS}>
                  {closed.map(row)}
                </Table>
              </details>
            )}
          </>
        )}
      </div>

      {/* [E] Per agency: concentration as a share of remaining cover, read as a meter. */}
      <div className="flex flex-col gap-4">
        <BlockHead
          title="By agency"
          note="The program sets no per-agency cap; the meter is each agency's share of remaining cover."
        />
        {agencies.length === 0 ? (
          <Empty>No agency exposure yet.</Empty>
        ) : (
          <Table label="Per-agency exposure" head={["Agency", ["Remaining cover", "num"], ["Share of remaining cover", "num"], ["Active / total", "num"], ["Claims paid", "num"]]} tips={AGENCY_TIPS}>
            {agencies.map((a) => (
              <tr key={a.agencyId}>
                <td><AgencyCell id={a.agencyId} /></td>
                <Num>{fmtBrs(a.outstandingCover)}</Num>
                <td className="num">
                  <span className="inline-flex items-center gap-3">
                    <ShareMeter a={a} total={sum} />
                    <Mono>{share(a.outstandingCover, sum)}</Mono>
                  </span>
                </td>
                <td className="num">
                  <Mono>{a.activeGuarantees}</Mono>
                  <Mono dim> / {registered.get(a.agencyId) ?? 0}</Mono>
                </td>
                <Num>{fmtBrs(a.claimsPaidTotal)}</Num>
              </tr>
            ))}
          </Table>
        )}
      </div>

      <TotalsStrip
        title="Totals · cover against the reserve"
        groups={totals}
        note="Coverage required is the higher of the coverage ratio times remaining cover (rounded up) and the floor: what is set aside for claims plus the stress buffer (capped at the cover not yet set aside)."
      />

      <HowTheCeilingWorks r={r} k={k} byRatio={byRatio} floor={floor} />
    </div>
  );
}

/** The Coverage section of /reserve: heading, roles and body. */
export function CoverageSection({ d }: { d: Data }) {
  return (
    <Section
      id="coverage"
      title="Coverage"
      kicker="Guarantees"
      subtitle="What the reserve guarantees today, by lease and by agency."
      info="Each guarantee is a fiança in two parts: unpaid rent (the default leg) and move-out debts (the exit leg). Remaining cover is cover minus what was already paid. The Operator registers guarantees; the Reserve Admin sets the caps. IDs are hashes; names stay off-chain."
    >
      <Coverage r={d.reserve} l={d.ledger} />
    </Section>
  );
}
