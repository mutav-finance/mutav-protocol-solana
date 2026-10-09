"use client";

/**
 * /reserve · Coverage. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { frac } from "@/lib/charts";
import { activeRemainingCover, agencyRows, coverageRows, type AgencyRow, type CoverageRow, type Ledger, type ReserveView } from "@/lib/view";
import { C } from "@/components/charts/Charts";

import { Empty, Num, Table, short } from "@/components/reserve/sections/shared";
import { ImageSlot } from "@/components/ImageSlot";
import { Section } from "@/components/Section";
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

const GUARANTEE_HEAD: (string | [string, "num"])[] = ["Guarantee", "Agency", "Remaining", ["Rent", "num"], ["Default leg left", "num"], ["Exit leg left", "num"], ["Provision", "num"], ["Open claims", "num"], "Status", "Registered"];
const COVER_TIPS = {
  "Default leg left": "Sub-limit for rent and charges in arrears while the lease runs, minus what was already paid on it.",
  "Exit leg left": "Sub-limit for the tenant's debts up to and at the end of occupation, minus what was already paid on it.",
  Provision: "Booked when a claim is filed and not yet paid; already out of NAV.",
};
const AGENCY_TIPS = {
  "Cap used": "Outstanding cover of the agency ÷ the per-agency cap set by the Reserve Admin.",
};

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
  const active = rows.filter((g) => g.active);
  const defaultLeft = active.reduce((s, g) => s + g.defaultRemaining, 0n);
  const exitLeft = active.reduce((s, g) => s + g.exitRemaining, 0n);
  const coverAxis = active.reduce((m, g) => (g.remaining > m ? g.remaining : m), 0n);
  const agencyAxis = agencies.reduce((m, a) => (a.outstandingCover > m ? a.outstandingCover : m), 0n);
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
  const closed = rows.filter((g) => !g.active);
  const row = (g: (typeof rows)[number]) => (
    <tr key={g.address}>
      <td><Explorer value={g.address} label={short(g.id)} /></td>
      <td><AgencyCell id={g.agencyId} /></td>
      <td>
        {g.active ? (
          <span className="inline-flex items-center gap-3">
            <MiniBar segs={[{ f: frac(g.defaultRemaining, coverAxis), color: C.ink }, { f: frac(g.exitRemaining, coverAxis), color: C.mid }]} />
            <Mono>{fmtBrs(g.remaining)}</Mono>
          </span>
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
      <td><Mono dim>{fmtTime(g.registeredAt).slice(0, 10)}</Mono></td>
    </tr>
  );
  return (
    <div className="flex flex-col gap-4">
      {/* Bento: the remaining-cover lead tile beside an image slot. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="bg-(--color-surface) flex flex-col gap-6 border p-6 lg:col-span-8">
          <div className="flex flex-col gap-2">
            <p className={LABEL} style={{ letterSpacing: "0.01em" }}>Remaining cover</p>
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
        </div>
        <ImageSlot slot="reserve-coverage" aspect="4:3" className="min-h-[200px] lg:col-span-4" />
      </div>

      <SubHead>By guarantee</SubHead>
      {rows.length === 0 ? (
        <Empty>No guarantees registered yet.</Empty>
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
                <span aria-hidden="true" className="font-mono text-(--color-text-3) inline-block w-3 group-open:hidden">+</span>
                <span aria-hidden="true" className="font-mono text-(--color-text-3) hidden w-3 group-open:inline-block">−</span>
                Closed guarantees <Mono dim>({closed.length})</Mono>
              </summary>
              <Table label="Closed guarantees" head={GUARANTEE_HEAD} tips={COVER_TIPS}>
                {closed.map(row)}
              </Table>
            </details>
          )}
        </>
      )}

      <SubHead>By agency</SubHead>
      {agencies.length === 0 ? (
        <Empty>No agency exposure yet.</Empty>
      ) : (
        <Table label="Per-agency exposure" head={["Agency", ["Outstanding cover", "num"], ["Cap used", "num"], ["Active", "num"], ["Guarantees registered", "num"], ["Claims paid", "num"]]} tips={AGENCY_TIPS}>
          {agencies.map((a) => (
            <tr key={a.address}>
              <td><AgencyCell id={a.agencyId} /></td>
              <Num>{fmtBrs(a.outstandingCover)}</Num>
              <td className="num">
                <span className="inline-flex items-center gap-3">
                  <MiniBar segs={[{ f: frac(a.outstandingCover, agencyAxis), color: a.capUsedBps > 10_000n ? C.bad : C.ink }]} />
                  <Mono style={a.capUsedBps > 10_000n ? { color: "var(--color-error)" } : undefined}>{capUse(a)}</Mono>
                </span>
              </td>
              <Num>{a.activeGuarantees}</Num>
              <Num>{registered.get(a.agencyId) ?? 0}</Num>
              <Num>{fmtBrs(a.claimsPaidTotal)}</Num>
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
      info={`Each guarantee has a default (rent-arrears) leg and an exit (property-recovery) leg. Remaining cover is cover minus what was already paid. The Operator registers every guarantee; the Reserve Admin sets the caps. Remaining bars: default leg (light) and exit leg (dark), scaled to the largest active guarantee. Cap used = outstanding cover ÷ max cover per agency (${fmtBrs(d.reserve.config.caps.maxCoverPerAgency, 0)}); its bars scale to the largest agency. Guarantee and agency IDs are hashes; names are kept off-chain.`}
    >
      <Coverage r={d.reserve} l={d.ledger} />
    </Section>
  );
}
