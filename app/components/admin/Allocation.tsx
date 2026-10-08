"use client";

/**
 * /admin "Allocation": BRS today, more assets through adapters (ADR 0018).
 * Composition shows the pilot's BRS-only reserve with the income inbox kept
 * apart; "Expand with adapters" explains how a new asset is added, lists
 * TESOURO as the first candidate with its blocker, reads VaultConfig.adapters,
 * shows the planned allocation instructions as disabled rows, and holds the
 * TESOURO share-cap and price-feed proposals used once an adapter is live.
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
import { AdminAction, Cards, DataTable, ExternalTag, Facts, LIVE, Sub, WhatThis, type Mode } from "@/components/admin/shared";
import { ALLOCATION_ALIAS } from "@/lib/admin";
import { fmtBps, fmtBrs, fmtDuration, fmtTime } from "@/lib/format";
import {
  ADAPTER_CANDIDATES,
  ADAPTER_SLOTS,
  BPS_MAX,
  EXPANSION_STEPS,
  PLANNED_BLOCKER,
  PLANNED_RESERVE_INSTRUCTIONS,
  PRICE_FIELDS,
  PRICE_PARAM_INFO,
  UNSET_ADDRESS,
  priceRequest,
  reserveComposition,
  tesouroCapRequest,
  type Composition,
  type PriceFields,
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
        <MetricCard dense label="Income inbox" value={fmtBrs(c.inbox)} unit="not yet counted: swept by the Operator" />
        <MetricCard dense label="Adapters" value={`${used} of ${ADAPTER_SLOTS}`} unit={used === 0 ? "none whitelisted: no other asset can be held" : "whitelisted in VaultConfig.adapters"} />
        {!c.brsOnly && <MetricCard dense label="Through adapters" value={fmtBrs(c.tesouroValue)} unit={`TESOURO at the bounded price · ${share(c.tesouroShareBps)}`} />}
      </div>
      {c.overCap && <Note tone="error">TESOURO is above the share cap: a price move or a cap cut put it there. allocate would refuse; deallocate brings it back.</Note>}
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
    <DataTable label="Whitelisted adapters" head={["Slot", "Adapter program", "Asset mint", "Cap (BRS-equivalent)", "Allocated", "Enabled"]}>
      {c.adapters.length === 0 ? (
        <tr>
          <td colSpan={6}>
            <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)" }}>No adapter whitelisted: 0 of {ADAPTER_SLOTS} slots in VaultConfig.adapters are used.</span>
          </td>
        </tr>
      ) : (
        c.adapters.map((a) => (
          <tr key={a.slot}>
            <td className="num">{m(a.slot)}</td>
            <td><Explorer value={a.programId} /></td>
            <td><Explorer value={a.assetMint} /></td>
            <td className="num">{m(fmtBrs(a.cap, 0))}</td>
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

function LaterControls({ mode, c }: { mode: Mode; c: Composition }) {
  const { reserve } = useLive();
  const cfg = reserve.config;
  const [cap, setCap] = useState(String(cfg.caps.maxTesouroShareBps));
  const [price, setPrice] = useState<Partial<PriceFields>>({});
  const capReq = tesouroCapRequest(cap);
  const capPreview = capReq ? (BigInt(capReq.maxTesouroShareBps) * c.stableAssets) / 10_000n : null;
  const pr = priceRequest(price);
  const p = cfg.price;
  const nowPrice: Record<keyof PriceFields, string> = {
    tesouroPriceAccount: p.tesouroPriceAccount === UNSET_ADDRESS ? "unset" : p.tesouroPriceAccount,
    p0: p.p0.toString(),
    t0: p.t0 === 0n ? "0" : `${p.t0} (${fmtTime(p.t0)})`,
    yMaxBps: fmtBps(p.yMaxBps),
    maxStalenessSecs: fmtDuration(p.maxStalenessSecs),
    maxDeviationBps: fmtBps(p.maxDeviationBps),
    maxNavMoveBps: fmtBps(p.maxNavMoveBps),
  };
  return (
    <Cards>
      <AdminAction title="TESOURO share cap" label="set_config (max_tesouro_share_bps)" mode={mode} request={capReq}>
        <Facts
          now={m(`${fmtBps(cfg.caps.maxTesouroShareBps)} (caps.max_tesouro_share_bps)`)}
          bound={m(`0 – ${BPS_MAX} bps (validate_params)`)}
          does="The most of stable assets that allocate may put in TESOURO; the rest stays BRS, liquid for claim payments and redemptions. 0% in the pilot (ADR 0018). It binds only once allocate exists."
        />
        <Grid>
          <TextField
            id="adm-tesouro-cap"
            label="New cap (bps)"
            value={cap}
            onChange={setCap}
            numeric
            hint={capReq ? `${fmtBps(capReq.maxTesouroShareBps)} · preview: up to ${fmtBrs(capPreview!, 0)} at today's stable assets` : `0 – ${BPS_MAX} bps`}
          />
        </Grid>
      </AdminAction>

      <AdminAction
        title="TESOURO price feed"
        label="set_config (price)"
        mode={mode}
        request={pr.request}
        note="Blank fields keep their on-chain value. refresh values TESOURO at min(on-chain price, accrual curve), and gated instructions refuse a stale or deviating price."
      >
        <Facts
          now={m(`last accepted price ${reserve.state.tesouroPrice.toString()} at ${reserve.state.tesouroPriceTs === 0n ? "never" : fmtTime(reserve.state.tesouroPriceTs)}`)}
          bound={m("bps fields 0 – 10000; staleness ≥ 0; p0 u64; t0 i64")}
          does="Points refresh at the TESOURO price account and bounds what it accepts. With no adapter and 0 TESOURO units, it values nothing in the pilot."
        />
        <Grid>
          {PRICE_FIELDS.map((k) => (
            <TextField
              key={k}
              id={`adm-price-${k}`}
              label={`${PRICE_PARAM_INFO[k].label}`}
              value={price[k] ?? ""}
              onChange={(v) => setPrice((s) => ({ ...s, [k]: v }))}
              numeric={k !== "tesouroPriceAccount"}
              hint={pr.errors.includes(k) ? `out of bound: ${PRICE_PARAM_INFO[k].bound}` : `now ${nowPrice[k]} · ${PRICE_PARAM_INFO[k].bound}`}
            />
          ))}
        </Grid>
      </AdminAction>

    </Cards>
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
      roles={<RoleLine items={[{ role: "admin", prefix: "adapters, caps and price feeds set by the" }, { role: "anyone", prefix: "re-valued by" }]} />}
    >
      {/* Alias for links to the earlier #reserve-assets anchor. */}
      <span id={ALLOCATION_ALIAS} aria-hidden="true" style={{ position: "relative", top: -112, display: "block", height: 0 }} />
      <WhatThis>
        The pilot reserve holds BRS only (ADR 0018): BRS already earns near Selic through Nora&apos;s revenue share. More assets can be added later through whitelisted, capped adapters; TESOURO is the first candidate, not a commitment.
      </WhatThis>
      <Sub id="allocation-composition" title="Composition" badge={LIVE}>
        <CompositionNow c={c} />
      </Sub>
      <Sub id="allocation-expand" title="Expand with adapters" badge={<StatusBadge color="var(--color-text-3)" label="NOT PART OF THE PILOT" />}>
        <Note>{PLANNED_BLOCKER}</Note>
        <H>How a new asset is added</H>
        <Steps />
        <H>Candidates</H>
        <Candidates />
        <H>Adapters on-chain</H>
        <Adapters c={c} />
        <H>Planned instructions</H>
        <PlannedInstructions />
        <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)", margin: 0, lineHeight: 1.6 }}>
          No button here sends any of these: the program would reject an instruction it does not have.
        </p>
        <div id="allocation-controls" style={{ display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 112 }}>
          <H>Used once an adapter is live</H>
          <Note>Valid Squads proposals today, but not part of the pilot&apos;s day-to-day: with no adapter, the share cap stays 0% and the price feed values nothing.</Note>
          <LaterControls mode={mode} c={c} />
        </div>
      </Sub>
    </Section>
  );
}
