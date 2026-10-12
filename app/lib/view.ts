/**
 * View models for /reserve and /demo: pure functions from decoded on-chain
 * accounts to rows the screens render. No numbers are invented here; each row
 * is a projection or a sum of account fields.
 */
import type {
  ClaimFiling,
  DepositRequest,
  Guarantee,
  IncomeReceipt,
  RedeemRequest,
  Coverage,
  VaultConfig,
  VaultState,
} from "@mutav-finance/mutav-protocol-solana";
import { isParked, isQueued } from "@mutav-finance/mutav-protocol-solana";
import { bytesToHex } from "./serde";
import { fmtShares } from "./format";

export type Row<T> = { address: string; data: T };

/** A `DepositsFulfilled` / `RedeemsFulfilled` event, read from transaction history. */
export type CapitalEvent = {
  side: "deposit" | "redemption";
  signature: string;
  ts: bigint;
  fromSeq: bigint;
  toSeq: bigint;
  assets: bigint;
  shares: bigint;
  nav: bigint;
};

/** Everything /api/ledger returns besides the reserve snapshot. */
export type Ledger = {
  /** Fills of the capital queue, newest first (request accounts close when claimed). */
  capitalEvents: CapitalEvent[];
  guarantees: Row<Guarantee>[];
  /** Claim filings; a paid filing carries its payment and settlement (ADR 0019). */
  filings: Row<ClaimFiling>[];
  /** Guarantee-fee receipts (`IncomeReceipt` of kind FEE, ADR 0019). */
  fees: (Row<IncomeReceipt> & { blockTime: bigint | null })[];
  /** Swept issuer income statements (ADR 0017), one IncomeReceipt each. */
  income: (Row<IncomeReceipt> & { blockTime: bigint | null })[];
  deposits: Row<DepositRequest>[];
  redeems: Row<RedeemRequest>[];
};

export type ReserveAddressesView = {
  config: string;
  state: string;
  vaultAuthority: string;
  shareMint: string;
  reserve: string;
  pendingDeposits: string;
  pendingRedemptions: string;
  claims: string;
  eventAuthority: string;
};

/** BRS mint and reserve token-account facts, decoded from the SPL accounts. */
export type TokenFacts = {
  mint: string;
  mintOwner: string | null;
  freezeAuthority: string | null;
  supply: bigint | null;
  reserveFrozen: boolean;
};

/** What /api/reserve returns. */
export type ReserveView = {
  cluster: "localnet" | "devnet";
  programId: string;
  explorerRpc: string;
  addresses: ReserveAddressesView;
  config: VaultConfig;
  state: VaultState;
  /** The §4 quantities recomputed from these accounts with the client's math mirror. */
  coverage: Coverage;
  /** Cluster time (unix seconds) and slot of the read. */
  now: bigint;
  slot: bigint;
  token: TokenFacts;
  /**
   * The income inbox (ADR 0017): the vault authority's associated token
   * account for BRS. Its balance is issuer income paid and not swept yet; it
   * never counts toward NAV.
   */
  incomeInbox: { address: string; exists: boolean; amount: bigint };
  /** The payments token account's SPL facts, for the watcher alert (absent in older reads and tests). */
  payments?: PaymentsFacts;
};

/** SPL facts of the payments token account (where pay_claim sends BRS). */
export type PaymentsFacts = {
  exists: boolean;
  /** Token-account owner (the wallet that can move the BRS out). */
  owner: string | null;
  mint: string | null;
  delegate: string | null;
  closeAuthority: string | null;
  frozen: boolean;
  /** PAYMENTS_OWNER from the server env: the owner the admin expects, when set. */
  expectedOwner: string | null;
};

/**
 * Watcher alerts on the payments account (AV-3 follow-up): every claim
 * payment lands there, so its owner changing, a delegate or close authority
 * appearing, or the owner being the operator key, is worth a red flag.
 */
export function paymentsAlerts(p: PaymentsFacts | undefined, c: Pick<VaultConfig, "operator" | "reserveMint">): string[] {
  if (!p) return [];
  if (!p.exists) return ["the payments account does not exist"];
  const out: string[] = [];
  if (p.expectedOwner && p.owner !== p.expectedOwner) out.push(`its owner is ${p.owner}, not the expected ${p.expectedOwner} (PAYMENTS_OWNER): the owner changed`);
  if (p.owner === c.operator) out.push("it is owned by the operator key: a compromised operator could pay claims to itself");
  if (p.mint !== null && p.mint !== c.reserveMint) out.push("it is not a BRS account");
  if (p.delegate) out.push(`it has a delegate (${p.delegate}) who can move its BRS`);
  if (p.closeAuthority) out.push(`it has a close authority (${p.closeAuthority})`);
  if (p.frozen) out.push("it is frozen: pay_claim into it fails");
  return out;
}

/** `ClaimFiling.leg` ids (LEG_DEFAULT = 1, LEG_EXIT = 2; 0 names no leg). */
export const LEG = { default: 1, exit: 2 } as const;
export const legName = (leg: number) => (leg === LEG.exit ? "exit" : "default");

export const GUARANTEE_ACTIVE = 0;
export const CLAIM_FILED = 0;
export const CLAIM_PAID = 1;
export const CLAIM_SETTLED = 3;
export const DEPOSIT_PENDING = 0;
export const DEPOSIT_FULFILLED = 1;
/** Parked by the admin's cancel (ADR 0030): the escrow is still the owner's to collect with `cancel_deposit`. */
export const DEPOSIT_CANCELLED = 2;

export const MODE_LABEL = (mode: number) => (mode === 0 ? "Normal" : "UnderCovered");

// ── Coverage ────────────────────────────────────────────────────────────────

export type CoverageRow = {
  address: string;
  id: string;
  agencyId: string;
  defaultRemaining: bigint;
  exitRemaining: bigint;
  remaining: bigint;
  provision: bigint;
  openClaims: number;
  active: boolean;
  registeredAt: bigint;
};

export function coverageRows(guarantees: Row<Guarantee>[]): CoverageRow[] {
  return guarantees
    .map(({ address, data: g }) => {
      const defaultRemaining = g.defaultCover - g.defaultPaid;
      const exitRemaining = g.exitCover - g.exitPaid;
      return {
        address,
        id: bytesToHex(new Uint8Array(g.id)),
        agencyId: bytesToHex(new Uint8Array(g.agencyId)),
        defaultRemaining,
        exitRemaining,
        remaining: defaultRemaining + exitRemaining,
        provision: g.provisionDefault + g.provisionExit,
        openClaims: g.openClaims,
        active: g.status === GUARANTEE_ACTIVE,
        registeredAt: g.registeredAt,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(a.registeredAt - b.registeredAt));
}

/** Sum of remaining cover over active guarantees: must equal `state.remaining_cover_total`. */
export const activeRemainingCover = (rows: CoverageRow[]) =>
  rows.filter((r) => r.active).reduce((s, r) => s + r.remaining, 0n);

export type AgencyRow = {
  agencyId: string;
  /** Remaining cover of the agency's active guarantees. */
  outstandingCover: bigint;
  activeGuarantees: number;
  claimsPaidTotal: bigint;
};

/**
 * Per-agency figures derived from the guarantee accounts: the program keeps
 * no per-agency account or cap (ADR 0019).
 */
export function agencyRows(guarantees: Row<Guarantee>[]): AgencyRow[] {
  const by = new Map<string, AgencyRow>();
  for (const { data: g } of guarantees) {
    const agencyId = bytesToHex(new Uint8Array(g.agencyId));
    const row = by.get(agencyId) ?? { agencyId, outstandingCover: 0n, activeGuarantees: 0, claimsPaidTotal: 0n };
    if (g.status === GUARANTEE_ACTIVE) {
      row.outstandingCover += g.defaultCover - g.defaultPaid + (g.exitCover - g.exitPaid);
      row.activeGuarantees += 1;
    }
    row.claimsPaidTotal += g.defaultPaid + g.exitPaid;
    by.set(agencyId, row);
  }
  return [...by.values()].sort((a, b) =>
    b.outstandingCover > a.outstandingCover ? 1 : b.outstandingCover < a.outstandingCover ? -1 : 0,
  );
}

// ── Claims timeline ─────────────────────────────────────────────────────────

export type ClaimStage = "filed" | "paid" | "settled";

export type ClaimRow = {
  filing: string;
  guarantee: string;
  guaranteeId: string;
  leg: "default" | "exit";
  noticeRefHash: string;
  provision: bigint;
  amount: bigint | null;
  filedAt: bigint;
  paidAt: bigint | null;
  settledAt: bigint | null;
  pixE2eHash: string | null;
  stage: ClaimStage;
  /** Seconds from filing to payment, and from payment to PIX settlement. */
  fileToPay: bigint | null;
  payToSettle: bigint | null;
};

/**
 * One row per claim filing. The filing records its payment and settlement
 * (ADR 0019); the program sets no settlement deadline (the payout SLA is the
 * operator platform's).
 */
export function claimsTimeline(ledger: Pick<Ledger, "guarantees" | "filings">): ClaimRow[] {
  const ids = new Map(ledger.guarantees.map((g) => [g.address, bytesToHex(new Uint8Array(g.data.id))]));
  return ledger.filings
    .map(({ address, data: f }): ClaimRow => {
      const settled = f.status === CLAIM_SETTLED;
      const paid = settled || f.status === CLAIM_PAID;
      const zeroHash = f.pixE2eHash.every((x) => x === 0);
      return {
        filing: address,
        guarantee: f.guarantee,
        guaranteeId: ids.get(f.guarantee) ?? "",
        leg: legName(f.leg),
        noticeRefHash: bytesToHex(new Uint8Array(f.noticeRefHash)),
        provision: f.provision,
        amount: paid ? f.paidAmount : null,
        filedAt: f.filedAt,
        paidAt: paid ? f.paidAt : null,
        settledAt: settled ? f.settledAt : null,
        pixE2eHash: !zeroHash ? bytesToHex(new Uint8Array(f.pixE2eHash)) : null,
        stage: settled ? "settled" : paid ? "paid" : "filed",
        fileToPay: paid ? f.paidAt - f.filedAt : null,
        payToSettle: settled ? f.settledAt - f.paidAt : null,
      };
    })
    .sort((a, b) => Number(b.filedAt - a.filedAt));
}

// ── Money flows ─────────────────────────────────────────────────────────────

export type FlowKind = "fee" | "income" | "claim" | "deposit" | "redemption";

export type FlowRow = {
  kind: FlowKind;
  /** The account (fees, claims) or the transaction signature (fills, `isTx`). */
  account: string;
  isTx?: boolean;
  /** Unix seconds, or null when only a slot is known. */
  at: bigint | null;
  /** Into the reserve (+) or out of it (−), in BRS base units. */
  reserveDelta: bigint;
  /** MUTAV's take to the treasury, for fees and issuer income. */
  treasury: bigint;
  detail: string;
};

export type FlowTotals = {
  feesNetToReserve: bigint;
  feeTakeToTreasury: bigint;
  /** Issuer income swept into the reserve (ADR 0017); there is no take on it (ADR 0019). */
  incomeNetToReserve: bigint;
  claimsPaid: bigint;
  depositsIn: bigint;
  redemptionsOut: bigint;
};

export function moneyFlows(
  state: Pick<VaultState, "feesInTotal" | "feeTakeTotal" | "claimsPaidTotal" | "incomeTotal">,
  ledger: Pick<Ledger, "fees" | "income" | "filings" | "capitalEvents">,
): {
  totals: FlowTotals;
  rows: FlowRow[];
} {
  const rows: FlowRow[] = [];
  for (const f of ledger.fees) {
    rows.push({ kind: "fee", account: f.address, at: f.blockTime, reserveDelta: f.data.net, treasury: f.data.take, detail: `slot ${f.data.slot}` });
  }
  for (const i of ledger.income) {
    rows.push({ kind: "income", account: i.address, at: i.blockTime, reserveDelta: i.data.net, treasury: i.data.take, detail: `statement ${fmtPeriod(i.data.period)}` });
  }
  for (const p of ledger.filings) {
    if (p.data.status !== CLAIM_PAID && p.data.status !== CLAIM_SETTLED) continue;
    rows.push({ kind: "claim", account: p.address, at: p.data.paidAt, reserveDelta: -p.data.paidAmount, treasury: 0n, detail: legName(p.data.leg) });
  }
  let depositsIn = 0n;
  let redemptionsOut = 0n;
  for (const e of ledger.capitalEvents) {
    const seqs = e.fromSeq === e.toSeq ? `seq ${e.fromSeq}` : `seqs ${e.fromSeq}–${e.toSeq}`;
    if (e.side === "deposit") depositsIn += e.assets;
    else redemptionsOut += e.assets;
    rows.push({
      kind: e.side,
      account: e.signature,
      isTx: true,
      at: e.ts,
      reserveDelta: e.side === "deposit" ? e.assets : -e.assets,
      treasury: 0n,
      detail: `${seqs} · ${e.side === "deposit" ? "minted" : "burned"} ${fmtShares(e.shares)} shares`,
    });
  }
  rows.sort((a, b) => Number((b.at ?? 0n) - (a.at ?? 0n)));
  return {
    totals: {
      feesNetToReserve: state.feesInTotal,
      feeTakeToTreasury: state.feeTakeTotal,
      incomeNetToReserve: state.incomeTotal,
      claimsPaid: state.claimsPaidTotal,
      depositsIn,
      redemptionsOut,
    },
    rows,
  };
}

/** A statement month `YYYYMM` as `YYYY-MM`. */
export const fmtPeriod = (period: number) => `${Math.floor(period / 100)}-${String(period % 100).padStart(2, "0")}`;

// ── Capital queue ───────────────────────────────────────────────────────────

export type QueueRow = {
  side: "deposit" | "redeem";
  address: string;
  seq: bigint;
  owner: string;
  /** BRS waiting (deposit) or shares waiting (redeem). */
  waiting: bigint;
  requestedAt: bigint;
  /** 1-based position among open requests on this side, FIFO. */
  position: number;
};

export function capitalQueue(
  state: Pick<VaultState, "depositHead" | "redeemHead">,
  ledger: Pick<Ledger, "deposits" | "redeems">,
): { deposits: QueueRow[]; redeems: QueueRow[] } {
  const deposits = ledger.deposits
    .filter((d) => isQueued(d.data) && d.data.seq >= state.depositHead)
    .sort((a, b) => Number(a.data.seq - b.data.seq))
    .map((d, i): QueueRow => ({
      side: "deposit",
      address: d.address,
      seq: d.data.seq,
      owner: d.data.owner,
      waiting: d.data.assets,
      requestedAt: d.data.requestedAt,
      position: i + 1,
    }));
  const redeems = ledger.redeems
    .filter((r) => isQueued(r.data) && r.data.seq >= state.redeemHead)
    .sort((a, b) => Number(a.data.seq - b.data.seq))
    .map((r, i): QueueRow => ({
      side: "redeem",
      address: r.address,
      seq: r.data.seq,
      owner: r.data.owner,
      waiting: r.data.shares,
      requestedAt: r.data.requestedAt,
      position: i + 1,
    }));
  return { deposits, redeems };
}

/** Config fields shown on /admin, as label/value pairs (raw on-chain values). */
export function configSummary(c: VaultConfig) {
  return {
    roles: { admin: c.admin, operator: c.operator, pauser: c.pauser, mutavCapitalWallet: c.mutavCapitalWallet },
    accounts: { treasuryAccount: c.treasuryAccount, paymentsAccount: c.paymentsAccount, reserveMint: c.reserveMint, shareMint: c.shareMint },
    params: {
      coverageRatioBps: c.coverageRatioBps,
      feeTakeBps: c.feeTakeBps,
      featureFlags: c.featureFlags,
      paused: c.paused,
    },
    caps: c.caps,
    allowlistRoot: bytesToHex(new Uint8Array(c.investorAllowlistRoot)),
  };
}

// ── Investor ────────────────────────────────────────────────────────────────

/** One of the connected investor's queue entries, with the actions the program would accept now. */
export type InvestorRequest = {
  side: "deposit" | "redeem";
  address: string;
  seq: bigint;
  status: string;
  requestedAt: bigint;
  /** BRS escrowed (deposit) or shares still waiting (redeem). */
  waiting: bigint;
  /** Deposit: shares to claim once fulfilled. Redeem: BRS filled and not yet claimed. */
  claimable: bigint;
  /** 1-based FIFO position among open requests on its side; null once nothing waits. */
  position: number | null;
  /** Instructions whose rules the request meets (spec §5.5); the program still decides. */
  actions: ("cancel_deposit" | "claim_shares" | "cancel_redeem" | "claim_assets")[];
};

export function investorRequests(
  owner: string | null,
  state: Pick<VaultState, "depositHead" | "redeemHead">,
  ledger: Pick<Ledger, "deposits" | "redeems">,
): InvestorRequest[] {
  if (!owner) return [];
  const q = capitalQueue(state, ledger);
  const depPos = new Map(q.deposits.map((x) => [x.address, x.position]));
  const redPos = new Map(q.redeems.map((x) => [x.address, x.position]));
  const deposits = ledger.deposits
    .filter((d) => d.data.owner === owner)
    .map((d): InvestorRequest => {
      const pending = isQueued(d.data);
      const parked = isParked(d.data);
      return {
        side: "deposit",
        address: d.address,
        seq: d.data.seq,
        status: pending ? "pending" : parked ? "parked" : "fulfilled",
        requestedAt: d.data.requestedAt,
        waiting: pending || parked ? d.data.assets : 0n,
        claimable: pending || parked ? 0n : d.data.sharesOut,
        position: depPos.get(d.address) ?? null,
        actions: pending || parked ? ["cancel_deposit"] : ["claim_shares"],
      };
    });
  const redeems = ledger.redeems
    .filter((r) => r.data.owner === owner)
    .map((r): InvestorRequest => {
      const actions: InvestorRequest["actions"] = [];
      const pending = isQueued(r.data);
      // A parked request (ADR 0030) is out of the queue; its owner collects the shares.
      const parked = isParked(r.data);
      if (pending || parked) actions.push("cancel_redeem");
      else actions.push("claim_assets");
      return {
        side: "redeem",
        address: r.address,
        seq: r.data.seq,
        status: pending ? "pending" : parked ? "parked" : "filled",
        requestedAt: r.data.requestedAt,
        waiting: pending || parked ? r.data.shares : 0n,
        claimable: pending || parked ? 0n : r.data.assetsOut,
        position: redPos.get(r.address) ?? null,
        actions,
      };
    });
  return [...deposits, ...redeems].sort((a, b) => Number(b.requestedAt - a.requestedAt) || (a.side < b.side ? -1 : 1));
}
