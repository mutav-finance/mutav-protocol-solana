"use client";

/**
 * /admin "Allocation": BRS today, more assets through adapters (ADR 0018).
 * Composition shows the pilot's BRS-only reserve with the income inbox kept
 * apart; "Expand with adapters" explains how a new asset is added, lists
 * TESOURO as the first candidate with its blocker, reads VaultConfig.adapters,
 * shows the planned allocation instructions as disabled rows, the settlement
 * floor control (min held in BRS) and the per-adapter price feed as planned.
 * Every number is read from the chain; nothing here offers an action the
 * program binary does not have. `#reserve-assets` is an alias of `#allocation`.
 */
import { useState, type ReactNode } from "react";
import { Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { CompositionChart } from "@/components/charts/Charts";
import { Grid, Note, TextField, useLive } from "@/components/demo/shared";
import { AdminAction, Cards, DataTable, ExternalTag, Facts, LIVE, PLANNED, Sub, WhatThis, type Mode } from "@/components/admin/shared";
import { ALLOCATION_ALIAS } from "@/lib/admin";
import { fmtBps, fmtBrs, fmtPct } from "@/lib/format";
import {
  ADAPTER_CANDIDATES,
  ADAPTER_SLOTS,
  BPS_MAX,
  EXPANSION_STEPS,
  PLANNED_BLOCKER,
  PLANNED_RESERVE_INSTRUCTIONS,
  reserveComposition,
  settlementFloorRequest,
  type Composition,
} from "@/lib/reserve-assets";

const m = (x: ReactNode) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;
const share = (bps: bigint | null) => (bps === null ? "—" : fmtBps(bps));
const H = ({ children }: { children: ReactNode }) => <h4 style={{ fontSize: 14, margin: "8px 0 0" }}>{children}</h4>;

// ── Composition ─────────────────────────────────────────────────────────────

function CompositionNow({ c }: { c: Composition }) {
  const used = c.adapters.length;
  return (
    <div className="grid-2">
      <CompositionChart c={c} />
      <div className="grid-metrics" style={{ alignContent: "start" }}>
        <MetricCard dense label="BRS in reserve" value={fmtBrs(c.brs)} unit={c.brsOnly ? "brs_balance · 100% BRS (pilot)" : `brs_balance · ${share(c.brsShareBps)} of stable assets`} />
        <MetricCard dense label="Min in BRS (settlement token)" value={fmtPct(c.floorBps)} unit={c.floorBps === BPS_MAX ? "the pilot floor: nothing may be allocated" : `${fmtBrs(c.floorValue, 0)} now · ${fmtBrs(c.roomAboveFloor, 0)} above it`} />
        <MetricCard dense label="Income inbox" value={fmtBrs(c.inbox)} unit="not yet counted: swept by the Operator" />
        <MetricCard dense label="Adapters" value={`${used} of ${ADAPTER_SLOTS}`} unit={used === 0 ? "none whitelisted: no other asset can be held" : "whitelisted in VaultConfig.adapters"} />
        {!c.brsOnly && <MetricCard dense label="Through adapters" value={fmtBrs(c.adapterValue)} unit={`at the bounded price · ${share(c.adapterShareBps)}`} />}
      </div>
      {c.belowFloor && <Note tone="error">BRS is below the settlement floor: a price move or a floor raise put it there. allocate would refuse; deallocate brings BRS back.</Note>}
    </div>
  );
}

// ── Expand with adapters ────────────────────────────────────────────────────

function Steps() {
  return (
    <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", borderBottom: "1px solid var(--color-border)" }}>
      {EXPANSION_STEPS.map((st, i) => (
        <li key={i} style={{ display: "grid", gridTemplateColumns: "28px minmax(0, 1fr)", gap: 10, padding: "10px 0", borderTop: "1px solid var(--color-border)", opacity: st.live ? 1 : 0.75 }}>
          <Mono style={{ fontSize: 12, color: "var(--color-text-3)" }}>{String(i + 1).padStart(2, "0")}</Mono>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", alignItems: "center" }}>
              {st.actor === "external" ? <ExternalTag /> : <RoleTag role={st.actor} />}
              {m(st.ix ?? "program upgrade")}
              <Mono style={{ fontSize: 11, color: "var(--color-text-3)" }}>{st.live ? "in this binary" : "later upgrade"}</Mono>
            </span>
            <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)" }}>{st.action}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Candidates() {
  return (
    <DataTable label="Adapter candidates" head={["Asset", "Issuer", "What it is", "Blocker", "Status"]}>
      {ADAPTER_CANDIDATES.map((a) => (
        <tr key={a.asset}>
          <td>{m(a.asset)}</td>
          <td><ExternalTag label={a.issuer} /></td>
          <td style={{ whiteSpace: "normal" }}><span className="font-body" style={{ fontSize: 12 }}>{a.what}</span></td>
          <td style={{ whiteSpace: "normal" }}><span className="font-body" style={{ fontSize: 12 }}>{a.blocker}</span></td>
          <td>{m("first candidate")}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function Adapters({ c }: { c: Composition }) {
  return (
    <DataTable label="Adapters" head={["Slot", "Adapter program", "Asset mint", "Cap (BRS-equivalent)", "Share limit", "Price feed", "Allocated", "Enabled"]}>
      {c.adapters.length === 0 ? (
        <tr>
          <td colSpan={8}>
            <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)" }}>No adapter whitelisted: 0 of {ADAPTER_SLOTS} slots in VaultConfig.adapters are used. Share limit and price feed are per adapter, with the first adapter upgrade.</span>
          </td>
        </tr>
      ) : (
        c.adapters.map((a) => (
          <tr key={a.slot}>
            <td className="num">{m(a.slot)}</td>
            <td><Explorer value={a.programId} /></td>
            <td><Explorer value={a.assetMint} /></td>
            <td className="num">{m(fmtBrs(a.cap, 0))}</td>
            <td>{m("with the upgrade")}</td>
            <td>{m("per adapter, with the upgrade")}</td>
            <td className="num">{m(fmtBrs(a.allocated, 0))}</td>
            <td>{m(a.enabled ? "yes" : "no")}</td>
          </tr>
        ))
      )}
    </DataTable>
  );
}

function PlannedInstructions() {
  return (
    <DataTable label="Planned reserve-allocation instructions" head={["Instruction", "Signer", "What it will do", "Gated by", "Spec", "Status"]}>
      {PLANNED_RESERVE_INSTRUCTIONS.map((p) => (
        <tr key={p.ix} aria-disabled="true" style={{ opacity: 0.6 }}>
          <td style={{ whiteSpace: "nowrap" }}>{m(`${p.ix}(${p.args})`)}</td>
          <td><RoleTag role={p.role} /></td>
          <td style={{ whiteSpace: "normal" }}><span className="font-body" style={{ fontSize: 12 }}>{p.what}</span></td>
          <td style={{ whiteSpace: "normal" }}>
            <ul className="font-body" style={{ fontSize: 12, margin: 0, paddingLeft: 16, lineHeight: 1.5, listStyle: "square" }}>
              {p.gatedBy.map((g) => <li key={g}>{g}</li>)}
            </ul>
          </td>
          <td>{m(p.spec)}</td>
          <td>{m("not in this binary")}</td>
        </tr>
      ))}
    </DataTable>
  );
}

function FloorControl({ mode, c }: { mode: Mode; c: Composition }) {
  // Starts blank, and an unchanged value proposes nothing: no no-op proposals.
  const [floor, setFloor] = useState("");
  const parsed = settlementFloorRequest(floor);
  const v = parsed ? parsed.minSettlementBps : null;
  const req = v !== null && v !== c.floorBps ? parsed : null;
  const preview = v === null ? null : (BigInt(v) * c.stableAssets + 9_999n) / 10_000n;
  return (
    <AdminAction title="Min held in the settlement token" label="set_config" mode={mode} request={req}>
      <Facts
        now={m(`${fmtPct(c.floorBps)} in BRS (min_settlement_bps)`)}
        bound={m(`0 – ${BPS_MAX} bps · pilot ${BPS_MAX} (100%)`)}
        does="The minimum share of stable assets held in BRS, the token guarantee fees come in and claim payments go out in. All adapters together may use only the share above it. 100% in the pilot (ADR 0018); it binds once allocate exists."
      />
      <Grid>
        <TextField id="adm-settlement-floor" label="New floor (bps)" value={floor} onChange={setFloor} numeric hint={v === null ? `now ${fmtPct(c.floorBps)} · 0 – ${BPS_MAX} bps` : v === c.floorBps ? "unchanged: nothing to propose" : `${fmtPct(v)} · preview: at least ${fmtBrs(preview!, 0)} in BRS at today's stable assets`} />
      </Grid>
    </AdminAction>
  );
}

function PriceFeedPlanned() {
  return (
    <article style={{ border: "1px dashed var(--color-border)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6, opacity: 0.75 }}>
      <h3 style={{ fontSize: 15, margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        Per-adapter price feed (with the adapter) <RoleTag role="admin" />
      </h3>
      <Facts
        now={m("none: no adapter, no price read")}
        bound={m("per adapter: price account, accrual ceiling, staleness and deviation bounds")}
        does="Each adapter brings its own price feed in its AdapterState account, set when it is whitelisted. refresh values that adapter's asset at min(on-chain price, accrual ceiling); a stale or deviating price stops the gated instructions. Not in this binary."
      />
      {PLANNED}
    </article>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function Allocation({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const c = reserveComposition(reserve);
  return (
    <Section
      id="allocation"
      kicker="Assets"
      title="Allocation: BRS today, more assets through adapters"
      roles={<RoleLine items={[{ role: "admin", prefix: "settlement floor and adapters set by the" }, { role: "anyone", prefix: "re-valued by" }]} />}
    >
      {/* Alias for links to the earlier #reserve-assets anchor. */}
      <span id={ALLOCATION_ALIAS} aria-hidden="true" style={{ position: "relative", top: -112, display: "block", height: 0 }} />
      <WhatThis>
        The pilot reserve holds BRS only (ADR 0018). BRS bears no yield; the reserve receives Nora&apos;s issuer partnership revenue in BRS (ADR 0017), at a rate set by a commercial agreement that is not on-chain (MUTAV expects it below but near Selic, pending Nora&apos;s confirmation). More assets can be added later through whitelisted, capped adapters; TESOURO is the first candidate, not a commitment.
      </WhatThis>
      <Sub id="allocation-composition" title="Composition" badge={LIVE}>
        <CompositionNow c={c} />
      </Sub>
      <Sub id="allocation-controls" title="Settlement floor" badge={LIVE}>
        <Note>A live control: a valid Squads proposal today. It stays 100% in the pilot, until an adapter is live.</Note>
        <Cards>
          <FloorControl mode={mode} c={c} />
        </Cards>
      </Sub>
      <Sub id="allocation-expand" title="Expand with adapters" badge={<StatusBadge color="var(--color-text-3)" label="NOT PART OF THE PILOT" />}>
        <Note>{PLANNED_BLOCKER}</Note>
        <H>How a new asset is added</H>
        <Steps />
        <H>Candidates</H>
        <Candidates />
        <H>Adapters</H>
        <Adapters c={c} />
        <H>Planned instructions</H>
        <PlannedInstructions />
        <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)", margin: 0, lineHeight: 1.6 }}>
          No button here sends any of these: the program would reject an instruction it does not have.
        </p>
        <H>Per-adapter price feed</H>
        <Cards>
          <PriceFeedPlanned />
        </Cards>
      </Sub>
    </Section>
  );
}
