"use client";

/**
 * The /reserve sections. Each one renders on-chain values from /api/ledger;
 * nothing is computed here beyond sums and differences of account fields.
 */
import type { ReactNode } from "react";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { StatusBadge } from "@/components/StatusBadge";
import { SolvencyChip } from "@/components/SolvencyChip";
import { fmtBps, fmtBrs, fmtDuration, fmtNav, fmtShares, fmtTime } from "@/lib/format";
import {
  activeRemainingCover,
  agencyRows,
  capitalQueue,
  claimsTimeline,
  coverageRows,
  moneyFlows,
  MODE_LABEL,
  type Ledger,
  type ReserveView,
} from "@/lib/view";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";

const short = (hex: string) => `${hex.slice(0, 8)}…`;

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-3)", margin: 0, padding: "14px 0" }}>
      {children}
    </p>
  );
}

function Table({ head, children, label }: { head: (string | [string, "num"])[]; children: ReactNode; label: string }) {
  return (
    <div className="table-wrap scroll-dark">
      <table className="data-table" aria-label={label}>
        <thead>
          <tr>
            {head.map((h) => (Array.isArray(h) ? <th key={h[0]} className="num">{h[0]}</th> : <th key={h}>{h}</th>))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Num = ({ children, color }: { children: ReactNode; color?: string }) => (
  <td className="num">
    <Mono style={color ? { color } : undefined}>{children}</Mono>
  </td>
);

// ── Health ──────────────────────────────────────────────────────────────────

export function Health({ r }: { r: ReserveView }) {
  const s = r.state;
  const sol = r.solvency;
  const navNow = navPerShare(sol.netAssets, s.sharesOutstanding);
  const underCovered = s.mode !== 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <SolvencyChip stableAssets={sol.stableAssets} coverageRequired={sol.coverageRequired} />
      <div className="grid-metrics">
        <MetricCard label="Stable assets" value={fmtBrs(sol.stableAssets)} unit="BRS held by the reserve (brs_balance + TESOURO value)" tooltip="Internal accounting of the reserve token account. Excludes pending deposits and assets owed to filled redemptions." />
        <MetricCard label="Coverage required" value={fmtBrs(sol.coverageRequired)} unit={`${fmtBps(r.config.coverageRatioBps)} of remaining cover`} tooltip="ceil(coverage ratio × remaining cover of every active guarantee)." />
        <MetricCard label="Surplus" value={fmtBrs(sol.surplus)} unit="stable assets − coverage required" />
        <MetricCard label="Free capital" value={fmtBrs(sol.freeCapital)} unit="what new guarantees and redemptions may use" tooltip="Surplus minus the instant-exit earmark, which is always zero in the pilot." />
        <MetricCard label="NAV per share" value={fmtNav(s.navPerShare)} unit={`published at last refresh · now ${fmtNav(navNow)}`} tooltip="Net assets (stable assets − open claim provisions) ÷ shares outstanding. The published value updates on refresh; 'now' recomputes it from the current accounts." />
        <MetricCard label="Shares outstanding" value={fmtShares(s.sharesOutstanding)} unit="reserve shares" />
        <MetricCard label="Open provisions" value={fmtBrs(s.provisions)} unit="filed, unpaid claims (lower NAV now)" />
        <MetricCard label="Active guarantees" value={String(s.activeGuarantees)} unit={`${fmtBrs(s.remainingCoverTotal)} remaining cover`} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <StatusBadge bordered color={underCovered ? "var(--color-error)" : "var(--color-success)"} label={`MODE ${MODE_LABEL(s.mode).toUpperCase()}`} ariaLabel={`Mode: ${MODE_LABEL(s.mode)}`} />
        <StatusBadge bordered color={s.fulfilHalted ? "var(--color-error)" : "var(--color-text-3)"} label={s.fulfilHalted ? "FULFIL HALTED" : "FULFIL OPEN"} />
        <StatusBadge bordered color={r.config.paused ? "var(--color-error)" : "var(--color-text-3)"} label={r.config.paused ? "PAUSED" : "NOT PAUSED"} />
        <StatusBadge bordered color={r.token.reserveFrozen ? "var(--color-error)" : "var(--color-text-3)"} label={r.token.reserveFrozen ? "RESERVE FROZEN" : "RESERVE NOT FROZEN"} />
        <span className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)", alignSelf: "center" }}>
          last refresh {fmtTime(s.lastRefreshTs)} · slot {s.lastRefreshSlot.toString()}
        </span>
      </div>
    </div>
  );
}

// ── Coverage ────────────────────────────────────────────────────────────────

export function Coverage({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = coverageRows(l.guarantees);
  const agencies = agencyRows(l.exposures, r.config.caps.maxCoverPerAgency);
  const sum = activeRemainingCover(rows);
  const matches = sum === r.state.remainingCoverTotal;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <p className="font-mono" style={{ fontSize: 12, color: matches ? "var(--color-text-3)" : "var(--color-error)", margin: 0 }}>
        {r.state.activeGuarantees} active · Σ remaining cover {fmtBrs(sum)} {matches ? "= remaining_cover_total" : `≠ remaining_cover_total ${fmtBrs(r.state.remainingCoverTotal)}`}
      </p>
      {rows.length === 0 ? (
        <Empty>No guarantees registered yet.</Empty>
      ) : (
        <Table label="Remaining cover by guarantee" head={["Guarantee", "Agency", ["Rent", "num"], ["Default leg left", "num"], ["Exit leg left", "num"], ["Provision", "num"], ["Open claims", "num"], "Status", "Registered"]}>
          {rows.map((g) => (
            <tr key={g.address}>
              <td><Explorer value={g.address} label={short(g.id)} /></td>
              <td><Mono dim>{short(g.agencyId)}</Mono></td>
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
      <h3 style={{ fontSize: 15, margin: "8px 0 0" }}>Per-agency exposure</h3>
      {agencies.length === 0 ? (
        <Empty>No agency exposure yet.</Empty>
      ) : (
        <Table label="Per-agency exposure" head={["Agency", ["Outstanding cover", "num"], ["Of agency cap", "num"], ["Active", "num"], ["Claims paid", "num"], "Account"]}>
          {agencies.map((a) => (
            <tr key={a.address}>
              <td><Mono>{short(a.agencyId)}</Mono></td>
              <Num>{fmtBrs(a.outstandingCover)}</Num>
              <Num>{fmtBps(a.capUsedBps, 1)}</Num>
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

// ── Claims timeline ─────────────────────────────────────────────────────────

export function Claims({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = claimsTimeline(l, r.config.payoutSlaSecs, r.now);
  if (rows.length === 0) return <Empty>No claims filed yet.</Empty>;
  return (
    <Table label="Claims timeline" head={["Guarantee", "Leg", ["Amount", "num"], "Filed", "Paid", ["Filed → paid", "num"], "Settled (PIX)", ["Paid → settled", "num"], "PIX E2E hash", "Late"]}>
      {rows.map((c) => (
        <tr key={c.filing}>
          <td><Explorer value={c.guarantee} label={short(c.guaranteeId)} /></td>
          <td><Mono>{c.leg}</Mono></td>
          <Num>{fmtBrs(c.amount ?? c.provision)}</Num>
          <td><Explorer value={c.filing} label={fmtTime(c.filedAt)} /></td>
          <td>{c.payout && c.paidAt !== null ? <Explorer value={c.payout} label={fmtTime(c.paidAt)} /> : <Mono dim>—</Mono>}</td>
          <Num>{c.fileToPay !== null ? fmtDuration(c.fileToPay) : "—"}</Num>
          <td><Mono dim={c.settledAt === null}>{c.settledAt !== null ? fmtTime(c.settledAt) : "pending"}</Mono></td>
          <Num>{c.payToSettle !== null ? fmtDuration(c.payToSettle) : "—"}</Num>
          <td><Mono dim>{c.pixE2eHash ? short(c.pixE2eHash) : "—"}</Mono></td>
          <td>
            {c.lateOnChain ? (
              <Mono style={{ color: "var(--color-error)" }}>late</Mono>
            ) : c.overdue ? (
              <Mono style={{ color: "var(--color-copper)" }} >past SLA (refresh records it)</Mono>
            ) : (
              <Mono dim>on time</Mono>
            )}
          </td>
        </tr>
      ))}
    </Table>
  );
}

// ── Money flows ─────────────────────────────────────────────────────────────

const FLOW_LABEL = { fee: "Guarantee fee", claim: "Claim payment", deposit: "Deposit", redemption: "Redemption" } as const;

export function Flows({ r, l }: { r: ReserveView; l: Ledger }) {
  const { totals, rows } = moneyFlows(r.state, l);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid-metrics">
        <MetricCard dense label="Guarantee fees → reserve" value={fmtBrs(totals.feesNetToReserve)} unit="net, raises NAV for every holder" />
        <MetricCard dense label="Fee take → treasury" value={fmtBrs(totals.feeTakeToTreasury)} unit={`MUTAV operation · ${fmtBps(r.config.feeTakeBps)} of each fee`} />
        <MetricCard dense label="Claim payments out" value={fmtBrs(totals.claimsPaid)} unit="to the payments account" />
        <MetricCard dense label="Deposits in" value={fmtBrs(totals.depositsIn)} unit="fulfilled requests" />
        <MetricCard dense label="Redemptions out" value={fmtBrs(totals.redemptionsOut)} unit="filled requests" />
      </div>
      {rows.length === 0 ? (
        <Empty>No money has moved yet.</Empty>
      ) : (
        <Table label="Money flows" head={["Flow", "When", ["Reserve", "num"], ["Treasury", "num"], "Detail", "Account / tx"]}>
          {rows.map((f) => (
            <tr key={`${f.kind}-${f.account}`}>
              <td><Mono>{FLOW_LABEL[f.kind]}</Mono></td>
              <td><Mono dim>{f.at !== null ? fmtTime(f.at) : "—"}</Mono></td>
              <Num color={f.reserveDelta >= 0n ? "var(--color-success)" : "var(--color-text)"}>{f.reserveDelta >= 0n ? "+" : "−"}{fmtBrs(f.reserveDelta < 0n ? -f.reserveDelta : f.reserveDelta)}</Num>
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

// ── Capital queue ───────────────────────────────────────────────────────────

export function Queue({ r, l }: { r: ReserveView; l: Ledger }) {
  const q = capitalQueue(r.state, l);
  const side = (title: string, rows: typeof q.deposits, unit: (v: bigint) => string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{title}</h3>
      {rows.length === 0 ? (
        <Empty>Empty.</Empty>
      ) : (
        <Table label={title} head={[["#", "num"], ["Seq", "num"], "Owner", ["Waiting", "num"], "Requested", "Account"]}>
          {rows.map((x) => (
            <tr key={x.address}>
              <Num>{x.position}</Num>
              <Num>{x.seq.toString()}</Num>
              <td><Explorer value={x.owner} /></td>
              <Num>{unit(x.waiting)}</Num>
              <td><Mono dim>{fmtTime(x.requestedAt)}</Mono></td>
              <td><Explorer value={x.address} /></td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
  return (
    <div className="grid-2">
      {side(`Pending deposits (head seq ${r.state.depositHead})`, q.deposits, fmtBrs)}
      {side(`Pending redemptions (head seq ${r.state.redeemHead})`, q.redeems, (v) => `${fmtShares(v)} sh`)}
    </div>
  );
}

// ── Disclosures ─────────────────────────────────────────────────────────────

export function Disclosures({ r }: { r: ReserveView }) {
  const item = (title: string, body: ReactNode) => (
    <li style={{ listStyle: "none", borderLeft: "2px solid var(--color-border)", padding: "2px 0 2px 14px" }}>
      <p className="font-body" style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>{title}</p>
      <div className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", lineHeight: 1.6 }}>{body}</div>
    </li>
  );
  return (
    <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      {item(
        "BRS is issued by Nora, and Nora can freeze it",
        <>
          The reserve holds BRS (mint <Explorer value={r.token.mint} />). Its freeze authority is{" "}
          {r.token.freezeAuthority ? <Explorer value={r.token.freezeAuthority} /> : <Mono>none</Mono>}
          {r.cluster === "localnet" ? " (on localnet, a test mint created by the seed script)" : ", a single Nora wallet"}. A freeze of the reserve token account
          stops every outflow, claim payments included, until it is thawed; <Mono>refresh</Mono> detects it and frozen balances stop counting as stable assets.
          The reserve token account is {r.token.reserveFrozen ? <strong style={{ color: "var(--color-error)" }}>frozen now</strong> : "not frozen now"}.
        </>,
      )}
      {item(
        "The pilot capital is MUTAV's own",
        <>
          Every share was bought with MUTAV&apos;s capital wallet <Explorer value={r.config.mutavCapitalWallet} />, through the same FIFO queue as any investor. The
          reserve is not open to outside investors, and nothing on this page is an offer to invest.
        </>,
      )}
      {item(
        "Claim payments are never blocked by solvency",
        <>
          The solvency gate stops new guarantees and redemptions when free capital runs out; it never stops <Mono>pay_claim</Mono>. Claim payments are capped per call
          ({fmtBrs(r.config.caps.maxClaimPerCall)}) and per period ({fmtBrs(r.config.caps.maxClaimPerPeriod)} per {fmtDuration(r.config.caps.claimPeriodSecs)}).
        </>,
      )}
      {item(
        "Built later",
        <>Partial redemption fills at the queue head, on-chain claim notices, and reserve allocation through adapters (TESOURO) are designed but not part of this pilot binary.</>,
      )}
    </ul>
  );
}

// ── Accounts ────────────────────────────────────────────────────────────────

export function Accounts({ r }: { r: ReserveView }) {
  const rows: [string, string][] = [
    ["Program", r.programId],
    ["VaultConfig", r.addresses.config],
    ["VaultState", r.addresses.state],
    ["Vault authority (PDA)", r.addresses.vaultAuthority],
    ["Reserve token account", r.addresses.reserve],
    ["Pending deposits escrow", r.addresses.pendingDeposits],
    ["Pending redemptions escrow", r.addresses.pendingRedemptions],
    ["Claims (filled redemptions)", r.addresses.claims],
    ["Share mint", r.addresses.shareMint],
    ["BRS mint", r.config.reserveMint],
    ["Treasury account (fee take)", r.config.treasuryAccount],
    ["Payments account (claim payments)", r.config.paymentsAccount],
    ["Admin (Squads vault)", r.config.admin],
    ["Operator", r.config.operator],
    ["Pauser", r.config.pauser],
    ["MUTAV capital wallet", r.config.mutavCapitalWallet],
  ];
  return (
    <Table label="Accounts" head={["Account", "Address"]}>
      {rows.map(([k, v]) => (
        <tr key={k}>
          <td className="font-body" style={{ fontSize: 13 }}>{k}</td>
          <td><Explorer value={v} full /></td>
        </tr>
      ))}
    </Table>
  );
}

