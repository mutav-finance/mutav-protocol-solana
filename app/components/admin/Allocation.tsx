"use client";

/**
 * /admin "Allocation management": where the reserve's assets sit (BRS,
 * TESOURO, the income inbox kept apart), the TESOURO cap and price feed the
 * Reserve Admin sets today, the adapters, and the allocation instructions that
 * exist only in the spec. Every number is read from the chain (/api/ledger);
 * nothing here offers an action the program binary does not have.
 * `#reserve-assets` is kept as an alias anchor of `#allocation`.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { CompositionChart } from "@/components/charts/Charts";
import { Grid, Note, TextField, useLive } from "@/components/demo/shared";
import { AdminAction, Cards, DataTable, ExternalTag, Facts, LIVE, PLANNED, Sub, WhatThis, type Mode } from "@/components/admin/shared";
import { ALLOCATION_ALIAS } from "@/lib/admin";
import { fmtBps, fmtBrs, fmtDuration, fmtTime } from "@/lib/format";
import {
  ADAPTER_SLOTS,
  BPS_MAX,
  PLANNED_BLOCKER,
  PLANNED_RESERVE_INSTRUCTIONS,
  PRICE_FIELDS,
  PRICE_PARAM_INFO,
  RESERVE_ASSET_DUTIES,
  UNSET_ADDRESS,
  priceRequest,
  reserveComposition,
  tesouroCapRequest,
  type Composition,
  type PriceFields,
} from "@/lib/reserve-assets";

const m = (x: ReactNode) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;
const share = (bps: bigint | null) => (bps === null ? "—" : fmtBps(bps));
const Table = DataTable;

// ── 1. Composition ──────────────────────────────────────────────────────────

function CompositionNow({ c }: { c: Composition }) {
  return (
    <>
      <div className="grid-2">
        <CompositionChart c={c} />
        <div className="grid-metrics" style={{ alignContent: "start" }}>
          <MetricCard dense label="BRS in reserve" value={fmtBrs(c.brs)} unit={`brs_balance · ${share(c.brsShareBps)} of stable assets`} />
          <MetricCard dense label="TESOURO through adapters" value={fmtBrs(c.tesouroValue)} unit={c.tesouroZeroReason ?? `${c.tesouroUnits.toString()} units at the bounded price · ${share(c.tesouroShareBps)}`} />
          <MetricCard dense label="Income inbox" value={fmtBrs(c.inbox)} unit="not yet counted: swept by the Operator" />
          <MetricCard
            dense
            label="TESOURO share vs cap"
            value={`${share(c.tesouroShareBps)} / ${fmtBps(c.capBps)}`}
            unit={c.capUsedBps === null ? "the cap allows no TESOURO" : `${fmtBps(c.capUsedBps)} of the cap used · room ${fmtBrs(c.capRoom, 0)}`}
          />
        </div>
      </div>
      {c.overCap && <Note tone="error">TESOURO is above the share cap: a price move or a cap cut put it there. allocate would refuse; deallocate brings it back.</Note>}
      <Table label="Whitelisted adapters" head={["Slot", "Adapter program", "Asset mint", "Cap (BRS-equivalent)", "Allocated", "Enabled"]}>
        {c.adapters.length === 0 ? (
          <tr>
            <td colSpan={6}>
              <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)" }}>
                No adapter whitelisted: 0 of {ADAPTER_SLOTS} slots in VaultConfig.adapters are used, so no TESOURO can be held.
              </span>
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
      </Table>
    </>
  );
}

// ── 2. Who does what ────────────────────────────────────────────────────────

function WhoDoesWhat() {
  return (
    <Table label="Who does what for reserve assets" head={["Who", "Does", "Instruction", "Status"]}>
      {RESERVE_ASSET_DUTIES.map((d, i) => (
        <tr key={i} style={d.live ? undefined : { opacity: 0.6 }}>
          <td style={{ whiteSpace: "nowrap" }}>{d.actor === "external" ? <ExternalTag /> : <RoleTag role={d.actor} />}</td>
          <td style={{ whiteSpace: "normal" }}><span className="font-body" style={{ fontSize: 13 }}>{d.action}</span></td>
          <td>
            {d.ix === null ? m("— (token transfer)") : d.href ? <Link href={d.href} className="ext-link"><Mono style={{ fontSize: 12 }}>{d.ix === "allocate" ? "allocate · deallocate · …" : d.ix}</Mono></Link> : m(d.ix)}
          </td>
          <td>{m(d.live ? "live" : "planned")}</td>
        </tr>
      ))}
    </Table>
  );
}

// ── 3. Controls ─────────────────────────────────────────────────────────────

function Controls({ mode, c }: { mode: Mode; c: Composition }) {
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
          does="The most of stable assets that allocate may put in TESOURO; the rest stays BRS, liquid for claim payments and redemptions. It only binds once allocate exists: today it changes nothing on-chain beyond the config."
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
          does="Points refresh at the TESOURO price account and bounds what it accepts. With no adapter and 0 TESOURO units, the price values nothing yet."
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

// ── 4. Planned ──────────────────────────────────────────────────────────────

function Planned() {
  return (
    <>
      <Note tone="warn">{PLANNED_BLOCKER}</Note>
      <Table label="Planned reserve-allocation instructions" head={["Instruction", "Signer", "What it will do", "Gated by", "Spec", "Status"]}>
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
      </Table>
      <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)", margin: 0, lineHeight: 1.6 }}>
        Per-adapter cap and allocated (spec §3.9) already have their place in VaultConfig.adapters (the table above reads it); they fill in once whitelist_adapter and allocate ship.
        No button here sends any of these: the program would reject an instruction it does not have.
      </p>
    </>
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
      title="Allocation management"
      roles={<RoleLine items={[{ role: "admin", prefix: "cap, price feed and adapters set by the" }, { role: "anyone", prefix: "re-valued by" }]} />}
    >
      {/* Alias for links to the earlier #reserve-assets anchor. */}
      <span id={ALLOCATION_ALIAS} aria-hidden="true" style={{ position: "relative", top: -112, display: "block", height: 0 }} />
      <WhatThis>
        Where the reserve&apos;s assets sit: BRS in the reserve and, later, TESOURO (Etherfuse&apos;s tokenized Brazilian treasury bonds) through capped adapters.{" "}
        {c.tesouroValue === 0n && (
          <>
            Today it is <strong>{c.stableAssets === 0n ? "empty, and BRS only" : "100% BRS"}</strong>: {c.tesouroZeroReason?.replace(/^./, (x) => x.toLowerCase())}
          </>
        )}
      </WhatThis>
      <Sub id="allocation-composition" title="Composition" badge={LIVE}>
        <CompositionNow c={c} />
      </Sub>
      <Sub id="allocation-controls" title="TESOURO cap & price feed" badge={<RoleTag role="admin" prefix="Squads set_config proposals ·" />}>
        <Controls mode={mode} c={c} />
        <WhoDoesWhat />
      </Sub>
      <Sub id="allocation-planned" title="Planned: adapters and TESOURO allocation" badge={PLANNED}>
        <Planned />
      </Sub>
    </Section>
  );
}
