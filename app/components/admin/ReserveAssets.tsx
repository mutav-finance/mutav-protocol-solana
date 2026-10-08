"use client";

/**
 * /admin "Reserve assets": what the reserve holds (BRS, TESOURO) and the issuer
 * income waiting in the inbox, who manages each, the set_config controls the
 * Reserve Admin has today, and the allocation instructions that exist only in
 * the spec. Every number is read from the chain (/api/ledger); nothing here
 * offers an action the program binary does not have.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MAX_INCOME_TAKE_BPS } from "@mutav-finance/mutav-protocol-solana";
import { Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { CompositionChart } from "@/components/charts/Charts";
import { Grid, Note, TextField, useLive } from "@/components/demo/shared";
import { AdminAction, type Mode } from "@/components/admin/shared";
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
  incomeSummary,
  incomeTakeRequest,
  priceRequest,
  reserveComposition,
  tesouroCapRequest,
  type Actor,
  type Composition,
  type PriceFields,
} from "@/lib/reserve-assets";
import { fmtPeriod } from "@/lib/view";

const m = (x: ReactNode) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;
const share = (bps: bigint | null) => (bps === null ? "—" : fmtBps(bps));

function Sub({ id, title, badge, children }: { id: string; title: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div id={id} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 24, scrollMarginTop: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, margin: 0 }}>{title}</h3>
        {badge}
      </div>
      {children}
    </div>
  );
}

const LIVE = <StatusBadge color="var(--color-success)" label="LIVE · ON-CHAIN" />;
const PLANNED = <StatusBadge color="var(--color-text-3)" label="PLANNED · NOT IN THIS PROGRAM BINARY" />;

function Table({ label, head, children }: { label: string; head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>{head.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

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

function ActorTag({ actor }: { actor: Actor }) {
  if (actor !== "external") return <RoleTag role={actor} />;
  return (
    <span className="font-mono" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text)" }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, border: "1px dashed var(--color-text-3)", display: "inline-block" }} />
      Nora · external
    </span>
  );
}

function WhoDoesWhat() {
  return (
    <Table label="Who does what for reserve assets" head={["Who", "Does", "Instruction", "Status"]}>
      {RESERVE_ASSET_DUTIES.map((d, i) => (
        <tr key={i} style={d.live ? undefined : { opacity: 0.6 }}>
          <td style={{ whiteSpace: "nowrap" }}><ActorTag actor={d.actor} /></td>
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

function Facts({ now, bound, does }: { now: ReactNode; bound: ReactNode; does: ReactNode }) {
  const row = (k: string, v: ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "104px minmax(0, 1fr)", gap: 10, padding: "6px 0", borderTop: "1px solid var(--color-border)" }}>
      <dt className="font-mono" style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--color-text-3)", paddingTop: 2 }}>{k}</dt>
      <dd style={{ margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{v}</dd>
    </div>
  );
  return (
    <dl style={{ margin: "4px 0 0", borderBottom: "1px solid var(--color-border)" }}>
      {row("On-chain now", now)}
      {row("Program bound", bound)}
      {row("What it does", <span className="font-body" style={{ fontSize: 12, lineHeight: 1.5, color: "var(--color-text-2)" }}>{does}</span>)}
    </dl>
  );
}

function Controls({ mode, c }: { mode: Mode; c: Composition }) {
  const { reserve } = useLive();
  const cfg = reserve.config;
  const [cap, setCap] = useState(String(cfg.caps.maxTesouroShareBps));
  const [price, setPrice] = useState<Partial<PriceFields>>({});
  const [take, setTake] = useState(String(cfg.incomeTakeBps));
  const capReq = tesouroCapRequest(cap);
  const capPreview = capReq ? (BigInt(capReq.maxTesouroShareBps) * c.stableAssets) / 10_000n : null;
  const pr = priceRequest(price);
  const takeReq = incomeTakeRequest(take);
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
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
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

      <AdminAction title="Income take" label="set_config (income_take_bps)" mode={mode} request={takeReq}>
        <Facts
          now={m(`${fmtBps(cfg.incomeTakeBps)} (income_take_bps)`)}
          bound={m(`≤ MAX_INCOME_TAKE_BPS = ${MAX_INCOME_TAKE_BPS} · fails closed`)}
          does="MUTAV's share of each swept Nora statement, sent to the treasury; the rest builds the reserve. The program cap is 0 until spec §12 Q47 decides it, so set_config refuses any non-zero take and every swept real goes to the reserve. Raising the cap is a program upgrade."
        />
        <Grid>
          <TextField id="adm-income-take" label="New take (bps)" value={take} onChange={setTake} numeric hint={takeReq ? fmtBps(takeReq.incomeTakeBps) : `the program accepts only 0 today`} />
        </Grid>
      </AdminAction>
    </div>
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

// ── 5. Issuer income ────────────────────────────────────────────────────────

function Income() {
  const { reserve, ledger } = useLive();
  const s = incomeSummary(reserve, ledger.income);
  return (
    <>
      <div className="grid-metrics">
        <MetricCard dense label="Income inbox" value={fmtBrs(s.inbox)} unit={s.inboxExists ? "paid by Nora, not yet counted: swept by the Operator" : "inbox account not created"} />
        <MetricCard dense label="Swept into the reserve" value={fmtBrs(s.sweptNet)} unit="income_total, net, lifetime" />
        <MetricCard dense label="Take to the treasury" value={fmtBrs(s.sweptTake)} unit="income_take_total, lifetime" />
        <MetricCard dense label="Income take" value={fmtBps(s.takeBps)} unit={`income_take_bps · cap ${fmtBps(MAX_INCOME_TAKE_BPS)} (spec §12 Q47)`} />
      </div>
      <RoleLine items={[{ role: "operator", prefix: "swept by the" }]}>
        inbox <Explorer value={s.inboxAddress} /> · sweep from <Link href="/operator" className="ext-link">/operator</Link>
      </RoleLine>
      <Table label="Last swept statements" head={["Statement", "Reference", "Gross", "Take", "Net to reserve", "Swept", "Receipt"]}>
        {s.last.length === 0 ? (
          <tr>
            <td colSpan={7}>
              <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)" }}>No statement swept yet.</span>
            </td>
          </tr>
        ) : (
          s.last.map((x) => (
            <tr key={x.address}>
              <td>{m(fmtPeriod(x.period))}</td>
              <td>{m(`${x.ref.slice(0, 10)}…`)}</td>
              <td className="num">{m(fmtBrs(x.gross))}</td>
              <td className="num">{m(fmtBrs(x.take))}</td>
              <td className="num">{m(fmtBrs(x.net))}</td>
              <td>{m(x.blockTime !== null ? fmtTime(x.blockTime) : `slot ${x.slot}`)}</td>
              <td><Explorer value={x.address} /></td>
            </tr>
          ))
        )}
      </Table>
      {s.receipts > s.last.length && <Note>{s.receipts - s.last.length} older statements on /reserve#flows.</Note>}
    </>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

const JUMPS: [string, string][] = [
  ["reserve-asset-composition", "Composition"],
  ["reserve-asset-roles", "Who does what"],
  ["reserve-asset-controls", "Controls today"],
  ["reserve-asset-planned", "Planned"],
  ["reserve-asset-income", "Issuer income"],
];

export function ReserveAssets({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const c = reserveComposition(reserve);
  return (
    <Section
      id="reserve-assets"
      title="Reserve assets: BRS and TESOURO"
      kicker="What the reserve holds, and who manages it"
      roles={
        <RoleLine items={[{ role: "admin", prefix: "caps and price feed set by the" }, { role: "operator", prefix: "income swept by the" }, { role: "anyone", prefix: "re-valued by" }]} />
      }
    >
      <p className="font-body" style={{ fontSize: 14, color: "var(--color-text-2)", margin: 0, maxWidth: 860, lineHeight: 1.6 }}>
        The reserve holds BRS (Nora&apos;s stablecoin) and, later, TESOURO (Etherfuse&apos;s tokenized Brazilian treasury bonds) through capped adapters.{" "}
        {c.tesouroValue === 0n && (
          <>
            Today it is <strong>{c.stableAssets === 0n ? "empty, and BRS only" : "100% BRS"}</strong>: {c.tesouroZeroReason?.replace(/^./, (x) => x.toLowerCase())}{" "}
          </>
        )}
        Nora&apos;s issuer income lands in a separate inbox and counts only once swept.
      </p>
      <nav aria-label="Reserve assets" style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 12 }}>
        {JUMPS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="ext-link font-mono" style={{ fontSize: 12 }}>
            → {label}
          </a>
        ))}
      </nav>
      <Sub id="reserve-asset-composition" title="Composition now" badge={LIVE}>
        <CompositionNow c={c} />
      </Sub>
      <Sub id="reserve-asset-roles" title="Who does what for reserve assets">
        <WhoDoesWhat />
      </Sub>
      <Sub id="reserve-asset-controls" title="Admin controls available today" badge={<RoleTag role="admin" prefix="Squads set_config proposals ·" />}>
        <Controls mode={mode} c={c} />
      </Sub>
      <Sub id="reserve-asset-planned" title="Planned: TESOURO allocation" badge={PLANNED}>
        <Planned />
      </Sub>
      <Sub id="reserve-asset-income" title="BRS issuer income" badge={LIVE}>
        <Income />
      </Sub>
    </Section>
  );
}
