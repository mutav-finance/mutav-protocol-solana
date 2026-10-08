"use client";

/**
 * /reserve · Coverage. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { frac } from "@/lib/charts";
import { activeRemainingCover, agencyRows, coverageRows, type AgencyRow, type CoverageRow, type Ledger, type ReserveView } from "@/lib/view";
import { C } from "@/components/charts/Charts";

import { Empty, Num, Table, short } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import { RoleLine } from "@/components/RoleTag";
import type { Data } from "@/components/reserve/sections/shared";

// ── Coverage ────────────────────────────────────────────────────────────────

const LABEL = "font-body text-(--color-text-2) m-0 text-xs font-medium uppercase";

/** Cap use, one format and one rounding everywhere on the page. */
const capUse = (a: AgencyRow) => fmtBps(a.capUsedBps, 2);

/** Active guarantees by remaining cover (largest first), then closed ones by registration. */
function byRemaining(rows: CoverageRow[]): CoverageRow[] {
  return [...rows].sort(
    (a, b) => Number(b.active) - Number(a.active) || (b.remaining > a.remaining ? 1 : b.remaining < a.remaining ? -1 : 0) || Number(a.registeredAt - b.registeredAt),
  );
}

function SubHead({ children }: { children: string }) {
  return <h3 className="font-display text-(--color-text) m-0 pt-4 text-base font-bold">{children}</h3>;
}

/** A small in-row bar: segments laid left to right on a track, scaled by the caller. */
function MiniBar({ segs }: { segs: { f: number; color: string }[] }) {
  return (
    <span aria-hidden="true" className="inline-flex h-1.5 w-24 shrink-0 gap-px align-middle" style={{ background: "var(--color-chart-track)" }}>
      {segs.filter((s) => s.f > 0).map((s, i) => (
        <span key={i} className="block h-full" style={{ width: `${Math.max(s.f * 100, 1)}%`, background: s.color }} />
      ))}
    </span>
  );
}

export function Coverage({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = byRemaining(coverageRows(l.guarantees));
  const agencies = agencyRows(l.exposures, r.config.caps.maxCoverPerAgency);
  const sum = activeRemainingCover(rows);
  const matches = sum === r.state.remainingCoverTotal;
  const active = rows.filter((g) => g.active);
  const defaultLeft = active.reduce((s, g) => s + g.defaultRemaining, 0n);
  const exitLeft = active.reduce((s, g) => s + g.exitRemaining, 0n);
  const coverAxis = active.reduce((m, g) => (g.remaining > m ? g.remaining : m), 0n);
  const agencyAxis = agencies.reduce((m, a) => (a.outstandingCover > m ? a.outstandingCover : m), 0n);
  return (
    <div className="flex flex-col gap-4">
      {/* Bento: the Σ lead tile beside an image tile. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="bg-(--color-surface) flex flex-col gap-6 border p-6 lg:col-span-5">
          <div className="flex flex-col gap-2">
            <p className={LABEL} style={{ letterSpacing: "0.01em" }}>Σ remaining cover</p>
            <Mono style={{ fontSize: "clamp(28px, 3.4vw, 40px)", fontWeight: 700, lineHeight: 1, color: "var(--color-text)" }}>{fmtBrs(sum)}</Mono>
            <span className="font-body text-(--color-text-2) text-sm">
              <Mono style={{ color: "var(--color-text)" }}>{r.state.activeGuarantees}</Mono> active guarantees · <Mono style={{ color: "var(--color-text)" }}>{agencies.length}</Mono> agencies
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="flex flex-col gap-1">
              <p className={LABEL} style={{ letterSpacing: "0.01em" }}>Default leg</p>
              <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{fmtBrs(defaultLeft)}</Mono>
            </div>
            <div className="flex flex-col gap-1">
              <p className={LABEL} style={{ letterSpacing: "0.01em" }}>Exit leg</p>
              <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{fmtBrs(exitLeft)}</Mono>
            </div>
          </div>
          <span className="inline-flex items-center gap-2">
            <Mono style={{ fontSize: 12, color: matches ? "var(--color-text-3)" : "var(--color-error)" }}>
              {matches ? "✓ matches VaultState" : `✗ VaultState says ${fmtBrs(r.state.remainingCoverTotal)}`}
            </Mono>
            <InfoTooltip label="About this check" width={260}>
              The sum of remaining cover over every active Guarantee account, checked against remaining_cover_total in VaultState.
            </InfoTooltip>
          </span>
        </div>
        <div className="bg-(--color-surface) relative min-h-[200px] overflow-hidden border lg:col-span-7">
          {/* Decorative image tile (Unsplash, Khay Edwards). Image only. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/img/reserve-coverage.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" style={{ opacity: 0.16 }} />
        </div>
      </div>

      <SubHead>By guarantee</SubHead>
      {rows.length === 0 ? (
        <Empty>No guarantees registered yet.</Empty>
      ) : (
        <Table label="Remaining cover by guarantee" head={["Guarantee", "Agency", "Remaining", ["Rent", "num"], ["Default leg left", "num"], ["Exit leg left", "num"], ["Provision", "num"], ["Open claims", "num"], "Status", "Registered"]}>
          {rows.map((g) => (
            <tr key={g.address}>
              <td><Explorer value={g.address} label={short(g.id)} /></td>
              <td><Mono dim>{short(g.agencyId)}</Mono></td>
              <td>
                {g.active ? (
                  <MiniBar segs={[{ f: frac(g.defaultRemaining, coverAxis), color: C.ink }, { f: frac(g.exitRemaining, coverAxis), color: C.mid }]} />
                ) : (
                  <Mono dim>—</Mono>
                )}
              </td>
              <Num>{fmtBrs(g.rent)}</Num>
              <Num>{fmtBrs(g.defaultRemaining)}</Num>
              <Num>{fmtBrs(g.exitRemaining)}</Num>
              <Num color={g.provision > 0n ? "var(--color-copper)" : undefined}>{fmtBrs(g.provision)}</Num>
              <Num>{g.openClaims}</Num>
              <td><Mono style={{ color: g.active ? "var(--color-success)" : "var(--color-text-3)" }}>{g.active ? "active" : "closed"}</Mono></td>
              <td><Mono dim>{fmtTime(g.registeredAt)}</Mono></td>
            </tr>
          ))}
        </Table>
      )}

      <SubHead>By agency</SubHead>
      {agencies.length === 0 ? (
        <Empty>No agency exposure yet.</Empty>
      ) : (
        <Table label="Per-agency exposure" head={["Agency", ["Outstanding cover", "num"], ["Cap used", "num"], ["Active", "num"], ["Claims paid", "num"], "Account"]}>
          {agencies.map((a) => (
            <tr key={a.address}>
              <td><Mono>{short(a.agencyId)}</Mono></td>
              <Num>{fmtBrs(a.outstandingCover)}</Num>
              <td className="num">
                <span className="inline-flex items-center gap-3">
                  <MiniBar segs={[{ f: frac(a.outstandingCover, agencyAxis), color: a.capUsedBps > 10_000n ? C.bad : C.ink }]} />
                  <Mono style={a.capUsedBps > 10_000n ? { color: "var(--color-error)" } : undefined}>{capUse(a)}</Mono>
                </span>
              </td>
              <Num>{a.activeGuarantees}</Num>
              <Num>{fmtBrs(a.claimsPaidTotal)}</Num>
              <td><Explorer value={a.address} /></td>
            </tr>
          ))}
        </Table>
      )}
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
      subtitle="How much the reserve guarantees, per lease and per agency."
      roles={<RoleLine items={[{ role: "operator" }, { role: "admin" }]} />}
      info={`Each guarantee has a default (rent-arrears) leg and an exit (property-recovery) leg. Remaining cover is cover minus what was already paid. The Operator registers every guarantee; the Reserve Admin sets the caps. Remaining bars: default leg (light) and exit leg (dark), scaled to the largest active guarantee. Cap used = outstanding cover ÷ max cover per agency (${fmtBrs(d.reserve.config.caps.maxCoverPerAgency, 0)}); its bars scale to the largest agency.`}
    >
      <Coverage r={d.reserve} l={d.ledger} />
    </Section>
  );
}
