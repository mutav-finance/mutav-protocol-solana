"use client";

/**
 * /reserve · Flows. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import type { ReactNode } from "react";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { moneyFlows, type Ledger, type ReserveView } from "@/lib/view";
import { RoleTag } from "@/components/RoleTag";
import { FLOW_ROLES, type AccountRole } from "@/lib/roles";

import { Empty, Num, Table } from "@/components/reserve/sections/shared";
import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Money flows ─────────────────────────────────────────────────────────────

const FLOW_LABEL = { fee: "Guarantee fee", income: "Issuer income", claim: "Claim payment", deposit: "Deposit", redemption: "Redemption" } as const;

const label12 = { letterSpacing: "0.01em" } as const;

/** One line of a group tile: label and short note on the left, the amount on the right; longer context in an ⓘ. */
function Line({ label, note, info, value }: { label: string; note: string; info?: ReactNode; value: string }) {
  return (
    <li className="flex list-none items-start justify-between gap-4 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-body text-(--color-text) inline-flex items-center gap-2 text-sm">
          {label}
          {info && <InfoTooltip label={`About ${label}`} width={260}>{info}</InfoTooltip>}
        </span>
        <span className="font-mono text-(--color-text-3) text-2xs leading-snug">{note}</span>
      </div>
      <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap" }}>{value}</Mono>
    </li>
  );
}

/** A group tile: Inter Medium caps heading, then its lines. */
function Group({ title, span, children }: { title: string; span: string; children: ReactNode }) {
  return (
    <div className={`bg-(--color-surface) flex flex-col gap-4 border p-6 ${span}`}>
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>{title}</span>
      <ul className="m-0 flex flex-col p-0">{children}</ul>
    </div>
  );
}

/** A neutral total in the header row: caps label over a mono figure. */
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={label12}>{label}</span>
      <Mono style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text)" }}>{value}</Mono>
    </div>
  );
}

export function Flows({ r, l }: { r: ReserveView; l: Ledger }) {
  const { totals, rows } = moneyFlows(r.state, l);
  const into = totals.feesNetToReserve + totals.incomeNetToReserve + totals.depositsIn;
  const out = totals.claimsPaid + totals.redemptionsOut;
  const net = into - out;
  const abs = (v: bigint) => (v < 0n ? -v : v);
  return (
    <div className="flex flex-col gap-4">
      {/* Neutral totals row: context, not a headline. */}
      <div className="bg-(--color-surface) flex flex-wrap items-center gap-x-8 gap-y-3 border px-6 py-4">
        <Total label="Net into the reserve" value={`${net >= 0n ? "+" : "−"}${fmtBrs(abs(net))}`} />
        <Total label="In" value={`+${fmtBrs(into)}`} />
        <Total label="Out" value={`−${fmtBrs(out)}`} />
        <span className="ml-auto">
          <InfoTooltip label="About these totals" width={300}>
            Net = into the reserve minus out of it. Guarantee fees, issuer income, the fee take and claim payments are VaultState totals. Deposits and
            redemptions sum the fill events in the last 100 transactions of each escrow.
          </InfoTooltip>
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Group title="Into the reserve" span="lg:col-span-5">
          <Line label="Guarantee fees, net" note="raises NAV for every holder" value={fmtBrs(totals.feesNetToReserve)} />
          <Line label="Issuer income, net" note="swept per statement" info="Nora partnership revenue, swept into the reserve per statement." value={fmtBrs(totals.incomeNetToReserve)} />
          <Line label="Deposits" note="fulfilled requests" value={fmtBrs(totals.depositsIn)} />
        </Group>
        <Group title="Out of the reserve" span="lg:col-span-3">
          <Line label="Claim payments" note="to the payments account" value={fmtBrs(totals.claimsPaid)} />
          <Line label="Redemptions" note="filled requests" value={fmtBrs(totals.redemptionsOut)} />
        </Group>
        <Group title="Outside the reserve" span="lg:col-span-4">
          <Line label="Fee take, to treasury" note={`${fmtBps(r.config.feeTakeBps)} of each fee`} info="MUTAV's operation, paid from each guarantee fee to the treasury account." value={fmtBrs(totals.feeTakeToTreasury)} />
          {totals.incomeTakeToTreasury > 0n && (
            <Line label="Income take, to treasury" note={`${fmtBps(r.config.incomeTakeBps)} of swept income`} info="MUTAV's take from issuer income swept by sweep_income, sent to the treasury account." value={fmtBrs(totals.incomeTakeToTreasury)} />
          )}
          <Line label="Income inbox, not swept" note="outside NAV until swept" info="Paid by Nora into the income inbox; it counts toward nothing until swept." value={fmtBrs(r.incomeInbox.amount)} />
        </Group>
      </div>
      {rows.length === 0 ? (
        <Empty>No money has moved yet.</Empty>
      ) : (
        <Table label="Money flows" head={["Flow", "By", "When", ["Reserve", "num"], ["Treasury", "num"], "Detail", "Account / tx"]}>
          {rows.map((f) => (
            <tr key={`${f.kind}-${f.account}`}>
              <td><Mono>{FLOW_LABEL[f.kind]}</Mono></td>
              <td><FlowBy kind={f.kind} /></td>
              <td><Mono dim>{f.at !== null ? fmtTime(f.at) : "—"}</Mono></td>
              <Num color={f.reserveDelta >= 0n ? "var(--color-success)" : "var(--color-text)"}>{f.reserveDelta >= 0n ? "+" : "−"}{fmtBrs(abs(f.reserveDelta))}</Num>
              <Num>{f.treasury > 0n ? fmtBrs(f.treasury) : "—"}</Num>
              <td><Mono dim>{f.detail}</Mono></td>
              <td><Explorer value={f.account} kind={f.isTx ? "tx" : "address"} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function FlowBy({ kind }: { kind: keyof typeof FLOW_ROLES }) {
  const fr: { by: AccountRole["role"]; requestedBy?: AccountRole["role"] } = FLOW_ROLES[kind];
  return (
    <span style={{ display: "inline-flex", gap: 10 }}>
      {fr.requestedBy && <RoleTag role={fr.requestedBy} prefix="req." />}
      {fr.by && <RoleTag role={fr.by} prefix={fr.requestedBy ? "fill" : undefined} />}
    </span>
  );
}

/** The Flows section of /reserve: heading and body. Roles live in the table's By column. */
export function FlowsSection({ d }: { d: Data }) {
  return (
    <Section id="flows" title="Money flows" kicker="In and out" subtitle="Where the reserve's money came from and where it went.">
      <Flows r={d.reserve} l={d.ledger} />
    </Section>
  );
}
