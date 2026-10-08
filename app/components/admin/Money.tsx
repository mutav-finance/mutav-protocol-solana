"use client";

/**
 * /admin "Money in & out": each flow into and out of the reserve, with the
 * settings that govern it and the admin's own actions on it. Operator and
 * Investor steps are one-line context rows (role, live total, link): they are
 * signed elsewhere, and their charts live on /reserve and /operator.
 */
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { MAX_INCOME_TAKE_BPS } from "@mutav-finance/mutav-protocol-solana";
import { Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { Grid, TextField, useLive } from "@/components/demo/shared";
import { AdminAction, Cards, DataTable, ExternalTag, Facts, PLANNED, Sub, WhatThis, type Mode } from "@/components/admin/shared";
import { ConfigCard, bpsField, brsField, secsField } from "@/components/admin/ConfigCard";
import { capsError, MAX_FEE_TAKE_BPS } from "@/lib/admin";
import { fmtBrs, fmtShares, fmtTime, parseBrs } from "@/lib/format";
import { claimCap } from "@/lib/operator";
import { incomeSummary } from "@/lib/reserve-assets";
import type { Role } from "@/lib/roles";
import { capitalQueue, fmtPeriod } from "@/lib/view";

const m = (x: ReactNode) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;

/** One step signed outside /admin: who, what, a live figure, where it is done. */
function Context({ who, children, figure, href, linkLabel }: { who: Role | "external"; children: ReactNode; figure?: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(150px, auto) minmax(0, 1fr) auto auto", gap: "6px 16px", alignItems: "center", padding: "8px 0", borderTop: "1px solid var(--color-border)" }} className="context-row">
      <span>{who === "external" ? <ExternalTag /> : <RoleTag role={who} />}</span>
      <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)" }}>{children}</span>
      <span style={{ textAlign: "right" }}>{figure}</span>
      <span>{href && <Link href={href} className="ext-link font-mono" style={{ fontSize: 12 }}>{linkLabel ?? href}</Link>}</span>
    </div>
  );
}

const Contexts = ({ children }: { children: ReactNode }) => <div style={{ borderBottom: "1px solid var(--color-border)" }}>{children}</div>;

// ── In ──────────────────────────────────────────────────────────────────────

function Deposits({ mode }: { mode: Mode }) {
  const { reserve, ledger } = useLive();
  const q = capitalQueue(reserve.state, ledger);
  const c = reserve.config;
  const [count, setCount] = useState("8");
  return (
    <Sub id="money-deposits" title="Capital deposits" badge={<RoleTag role="admin" prefix="filled by the" />}>
      <Contexts>
        <Context who="investor" figure={m(`${q.deposits.length} waiting · ${fmtBrs(reserve.state.pendingDepositsTotal, 0)}`)} href="/investor">
          request_deposit escrows BRS in the FIFO queue (allowlisted wallets; in the pilot, MUTAV&apos;s capital wallet).
        </Context>
      </Contexts>
      <Cards>
        <AdminAction title="Fulfil deposits" label="fulfil_deposits" mode={mode} request={{ kind: "fulfil_deposits", count: Math.max(1, Number(count) || 1) }}>
          <Facts
            now={m(`${q.deposits.length} waiting · head seq ${reserve.state.depositHead}`)}
            bound={m(`max reserve ${fmtBrs(c.caps.maxTvl, 0)} · up to 8 per call`)}
            does="Moves escrowed BRS into the reserve in FIFO order and mints shares at NAV. Allowed in under-coverage; refused while paused or while fulfilment is halted."
          />
          <Grid><TextField id="adm-dep" label="Count" value={count} onChange={setCount} numeric /></Grid>
        </AdminAction>
        <ConfigCard
          title="Request sizes"
          mode={mode}
          fields={[brsField("minRequest", "Min request (BRS)", c.caps.minRequest), brsField("maxRequest", "Max request (BRS)", c.caps.maxRequest)]}
          build={(v) => {
            const caps: Record<string, bigint> = {};
            for (const k of ["minRequest", "maxRequest"]) if (v[k] !== undefined) caps[k] = v[k] as bigint;
            const bad = capsError({ ...c.caps, ...caps });
            return bad ?? { kind: "set_config", caps };
          }}
          bound="min request ≤ max request"
          does="Bound every request_deposit and request_redeem."
        />
      </Cards>
    </Sub>
  );
}

function Fees({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const s = reserve.state;
  return (
    <Sub id="money-fees" title="Guarantee fees" badge={<RoleTag role="operator" prefix="booked by the" />}>
      <Contexts>
        <Context who="operator" figure={m(`+${fmtBrs(s.feesInTotal, 0)} · take ${fmtBrs(s.feeTakeTotal, 0)}`)} href="/operator">
          contribute_fees books each fee invoice: the take goes to the treasury, the rest raises NAV (fees_in_total, fee_take_total).
        </Context>
      </Contexts>
      <Cards>
        <ConfigCard
          title="Fee take"
          mode={mode}
          fields={[bpsField("feeTakeBps", "Fee take (bps)", reserve.config.feeTakeBps, MAX_FEE_TAKE_BPS)]}
          build={(v) => ({ kind: "set_config", feeTakeBps: v.feeTakeBps as number })}
          bound={`≤ MAX_FEE_TAKE_BPS = ${MAX_FEE_TAKE_BPS} (30%)`}
          does="MUTAV's share of each guarantee fee, sent to the treasury; the rest builds the reserve."
        />
      </Cards>
    </Sub>
  );
}

function Income({ mode }: { mode: Mode }) {
  const { reserve, ledger } = useLive();
  const s = incomeSummary(reserve, ledger.income, 3);
  return (
    <Sub id="money-income" title="BRS issuer income" badge={<RoleTag role="operator" prefix="swept by the" />}>
      <Contexts>
        <Context who="external" figure={m(`${fmtBrs(s.inbox, 2)} in the inbox`)}>
          Nora pays the monthly revenue share in BRS to the income inbox <Explorer value={s.inboxAddress} />. Not yet counted: it counts toward nothing until swept.
        </Context>
        <Context who="operator" figure={m(`+${fmtBrs(s.sweptNet, 0)} · take ${fmtBrs(s.sweptTake, 0)}`)} href="/operator">
          sweep_income moves each statement from the inbox into the reserve, once per reference (income_total, income_take_total).
        </Context>
      </Contexts>
      {s.last.length > 0 && (
        <DataTable label="Last swept statements" head={["Statement", "Gross", "Take", "Net to reserve", "Swept", "Receipt"]}>
          {s.last.map((x) => (
            <tr key={x.address}>
              <td>{m(fmtPeriod(x.period))}</td>
              <td className="num">{m(fmtBrs(x.gross))}</td>
              <td className="num">{m(fmtBrs(x.take))}</td>
              <td className="num">{m(fmtBrs(x.net))}</td>
              <td>{m(x.blockTime !== null ? fmtTime(x.blockTime) : `slot ${x.slot}`)}</td>
              <td><Explorer value={x.address} /></td>
            </tr>
          ))}
        </DataTable>
      )}
      <Cards>
        <ConfigCard
          title="Income take"
          mode={mode}
          fields={[bpsField("incomeTakeBps", "Income take (bps)", reserve.config.incomeTakeBps, MAX_INCOME_TAKE_BPS)]}
          build={(v) => ({ kind: "set_config", incomeTakeBps: v.incomeTakeBps as number })}
          bound={`≤ MAX_INCOME_TAKE_BPS = ${MAX_INCOME_TAKE_BPS} · fails closed`}
          does="MUTAV's share of each swept Nora statement, sent to the treasury; the rest builds the reserve. The program cap is 0 until spec §12 Q47 decides it, so set_config refuses any non-zero take and every swept real goes to the reserve. Raising the cap is a program upgrade."
        />
      </Cards>
    </Sub>
  );
}

// ── Out ─────────────────────────────────────────────────────────────────────

function Redemptions({ mode }: { mode: Mode }) {
  const { reserve, ledger } = useLive();
  const q = capitalQueue(reserve.state, ledger);
  const [count, setCount] = useState("8");
  const [maxAssets, setMaxAssets] = useState("");
  return (
    <Sub id="money-redemptions" title="Redemptions" badge={<RoleTag role="admin" prefix="filled by the" />}>
      <Contexts>
        <Context who="investor" figure={m(`${q.redeems.length} waiting · ${fmtShares(reserve.state.pendingRedeemShares)} shares`)} href="/investor">
          request_redeem escrows shares in the FIFO queue; the owner later claims the BRS with claim_assets.
        </Context>
      </Contexts>
      <Cards>
        <AdminAction title="Fulfil redemptions" label="fulfil_redeems" mode={mode} request={{ kind: "fulfil_redeems", count: Math.max(1, Number(count) || 1), maxAssets: parseBrs(maxAssets) ?? (1n << 64n) - 1n }}>
          <Facts
            now={m(`${q.redeems.length} waiting · free capital ${fmtBrs(reserve.solvency.freeCapital, 0)}`)}
            bound={m(`each fill ≤ free capital · partial fills ≥ ${fmtBrs(reserve.config.caps.minFillAssets, 0)} · up to 8 per call`)}
            does="Pays redemptions in FIFO order at NAV, from free capital only (the solvency gate). Frozen in under-coverage and while paused or halted; the head may be filled partially."
          />
          <Grid>
            <TextField id="adm-red" label="Count" value={count} onChange={setCount} numeric />
            <TextField id="adm-max" label="Max BRS (blank = no limit)" value={maxAssets} onChange={setMaxAssets} numeric />
          </Grid>
        </AdminAction>
        <ConfigCard
          title="Partial-fill floor"
          mode={mode}
          fields={[brsField("minFillAssets", "Partial-fill floor (BRS)", reserve.config.caps.minFillAssets)]}
          build={(v) => ({ kind: "set_config", caps: { minFillAssets: v.minFillAssets as bigint } })}
          bound="BRS amount"
          does="The smallest piece fulfil_redeems may fill at the head of the queue when free capital cannot pay it whole (ADR 0010)."
        />
      </Cards>
    </Sub>
  );
}

function Claims({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const c = reserve.config;
  const cap = claimCap(c, reserve.state, reserve.now);
  return (
    <Sub id="money-claims" title="Claim payments" badge={<RoleTag role="operator" prefix="paid by the" />}>
      <Contexts>
        <Context who="operator" figure={m(`−${fmtBrs(reserve.state.claimsPaidTotal, 0)} · ${fmtBrs(cap.paid, 0)} this window`)} href="/operator">
          pay_claim sends BRS to the payments account within the claim caps (claims_paid_total); never blocked by solvency or pause.
        </Context>
        <Context who="anyone" href="/reserve#claims" linkLabel="/reserve">
          The claims timeline (filed → paid → settled) is public.
        </Context>
      </Contexts>
      <Cards>
        <ConfigCard
          title="Claim-payment caps and payout SLA"
          mode={mode}
          fields={[brsField("maxClaimPerCall", "Max per call (BRS)", c.caps.maxClaimPerCall), brsField("maxClaimPerPeriod", "Max per period (BRS)", c.caps.maxClaimPerPeriod), secsField("claimPeriodSecs", "Period (seconds)", c.caps.claimPeriodSecs, 1n), secsField("payoutSlaSecs", "Payout SLA (seconds)", c.payoutSlaSecs)]}
          build={(v) => {
            const caps: Record<string, bigint> = {};
            for (const k of ["maxClaimPerCall", "maxClaimPerPeriod", "claimPeriodSecs"]) if (v[k] !== undefined) caps[k] = v[k] as bigint;
            return { kind: "set_config", caps, payoutSlaSecs: v.payoutSlaSecs as bigint | undefined };
          }}
          bound="period > 0 · SLA ≥ 0"
          does="Bound what the operator key can pay: per pay_claim and per rolling window. They bound a compromised key, not MUTAV's liability; a payment above them is the admin path below. The payout SLA is how long a paid claim may wait for its PIX settlement before refresh records it late."
        />
      </Cards>
      <DataTable label="Planned claim path" head={["Instruction", "Signer", "What it will do", "Status"]}>
        <tr aria-disabled="true" style={{ opacity: 0.6 }}>
          <td>{m("pay_claim_admin")}</td>
          <td><RoleTag role="admin" /></td>
          <td style={{ whiteSpace: "normal" }}><span className="font-body" style={{ fontSize: 12 }}>Pays a claim above the operator&apos;s caps through a time-locked proposal (ADR 0012). Until it ships, MUTAV advances such a payment from its own funds.</span></td>
          <td>{PLANNED}</td>
        </tr>
      </DataTable>
    </Sub>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

const Divider = ({ children }: { children: string }) => (
  <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)", margin: "28px 0 0", borderBottom: "1px solid var(--color-border)", paddingBottom: 6 }}>{children}</p>
);

export function Money({ mode }: { mode: Mode }) {
  return (
    <Section
      id="money"
      kicker="Flows"
      title="Money in & out"
      roles={<RoleLine items={[{ role: "admin", prefix: "queue filled and settings set by the" }, { role: "operator", prefix: "fees, income and claims by the" }, { role: "investor", prefix: "requests by the" }]} />}
    >
      <WhatThis>Each flow into and out of the reserve, with the settings that govern it. Steps signed by the Operator or an Investor are context, linked to where they happen; full charts are on <Link href="/reserve#flows" className="ext-link">/reserve</Link>.</WhatThis>
      <Divider>In</Divider>
      <Deposits mode={mode} />
      <Fees mode={mode} />
      <Income mode={mode} />
      <Divider>Out</Divider>
      <Redemptions mode={mode} />
      <Claims mode={mode} />
    </Section>
  );
}
