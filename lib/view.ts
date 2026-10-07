/**
 * View models for /reserve and /demo: pure functions from decoded on-chain
 * accounts to rows the screens render. No numbers are invented here; each row
 * is a projection or a sum of account fields.
 */
import type {
  AgencyExposure,
  ClaimFiling,
  DepositRequest,
  FeeReceipt,
  Guarantee,
  Payout,
  RedeemRequest,
  Solvency,
  VaultConfig,
  VaultState,
} from "@mutav-finance/mutav-protocol-solana";
import { bytesToHex } from "./serde";

export type Row<T> = { address: string; data: T };

/** Everything /api/ledger returns besides the reserve snapshot. */
export type Ledger = {
  guarantees: Row<Guarantee>[];
  filings: Row<ClaimFiling>[];
  payouts: Row<Payout>[];
  exposures: Row<AgencyExposure>[];
  fees: (Row<FeeReceipt> & { blockTime: bigint | null })[];
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
  solvency: Solvency;
  /** Cluster time (unix seconds) and slot of the read. */
  now: bigint;
  slot: bigint;
  token: TokenFacts;
};

export const LEG = { default: 0, exit: 1 } as const;
export const legName = (leg: number) => (leg === LEG.exit ? "exit" : "default");

export const GUARANTEE_ACTIVE = 0;
export const CLAIM_FILED = 0;
export const PAYOUT_SETTLED = 1;
export const DEPOSIT_PENDING = 0;
export const DEPOSIT_FULFILLED = 1;

export const MODE_LABEL = (mode: number) => (mode === 0 ? "Normal" : "UnderCovered");

// ── Coverage ────────────────────────────────────────────────────────────────

export type CoverageRow = {
  address: string;
  id: string;
  agencyId: string;
  rent: bigint;
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
        rent: g.rent,
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
  address: string;
  agencyId: string;
  outstandingCover: bigint;
  activeGuarantees: number;
  claimsPaidTotal: bigint;
  /** Share of the per-agency cap in use, in bps. */
  capUsedBps: bigint;
};

export function agencyRows(exposures: Row<AgencyExposure>[], maxCoverPerAgency: bigint): AgencyRow[] {
  return exposures
    .map(({ address, data: a }) => ({
      address,
      agencyId: bytesToHex(new Uint8Array(a.agencyId)),
      outstandingCover: a.outstandingCover,
      activeGuarantees: a.activeGuarantees,
      claimsPaidTotal: a.claimsPaidTotal,
      capUsedBps: maxCoverPerAgency === 0n ? 0n : (a.outstandingCover * 10_000n) / maxCoverPerAgency,
    }))
    .sort((a, b) => (b.outstandingCover > a.outstandingCover ? 1 : b.outstandingCover < a.outstandingCover ? -1 : 0));
}

// ── Claims timeline ─────────────────────────────────────────────────────────

export type ClaimStage = "filed" | "paid" | "settled";

export type ClaimRow = {
  filing: string;
  payout: string | null;
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
  /** `Payout.late` as recorded on-chain (set by `settle_payout` or `refresh`). */
  lateOnChain: boolean;
  /** Pending and already past the SLA at `now`; `refresh` will record it as late. */
  overdue: boolean;
};

const key = (guarantee: string, hash: ArrayLike<number>) =>
  `${guarantee}:${bytesToHex(Uint8Array.from(hash))}`;

export function claimsTimeline(
  ledger: Pick<Ledger, "guarantees" | "filings" | "payouts">,
  payoutSlaSecs: bigint,
  now: bigint,
): ClaimRow[] {
  const ids = new Map(ledger.guarantees.map((g) => [g.address, bytesToHex(new Uint8Array(g.data.id))]));
  const payouts = new Map(ledger.payouts.map((p) => [key(p.data.guarantee, p.data.noticeRefHash), p]));
  return ledger.filings
    .map(({ address, data: f }): ClaimRow => {
      const p = payouts.get(key(f.guarantee, f.noticeRefHash)) ?? null;
      const settled = p !== null && p.data.status === PAYOUT_SETTLED;
      const zeroHash = p ? p.data.pixE2eHash.every((x) => x === 0) : true;
      return {
        filing: address,
        payout: p?.address ?? null,
        guarantee: f.guarantee,
        guaranteeId: ids.get(f.guarantee) ?? "",
        leg: legName(f.leg),
        noticeRefHash: bytesToHex(new Uint8Array(f.noticeRefHash)),
        provision: f.provision,
        amount: p?.data.amount ?? null,
        filedAt: f.filedAt,
        paidAt: p?.data.paidAt ?? null,
        settledAt: settled ? p!.data.settledAt : null,
        pixE2eHash: p && !zeroHash ? bytesToHex(new Uint8Array(p.data.pixE2eHash)) : null,
        stage: settled ? "settled" : p ? "paid" : "filed",
        fileToPay: p ? p.data.paidAt - f.filedAt : null,
        payToSettle: settled ? p!.data.settledAt - p!.data.paidAt : null,
        lateOnChain: p !== null && p.data.late !== 0,
        overdue: p !== null && !settled && now > p.data.paidAt + payoutSlaSecs,
      };
    })
    .sort((a, b) => Number(b.filedAt - a.filedAt));
}

// ── Money flows ─────────────────────────────────────────────────────────────

export type FlowKind = "fee" | "claim" | "deposit" | "redemption";

export type FlowRow = {
  kind: FlowKind;
  account: string;
  /** Unix seconds, or null when only a slot is known. */
  at: bigint | null;
  /** Into the reserve (+) or out of it (−), in BRS base units. */
  reserveDelta: bigint;
  /** MUTAV's take to the treasury, for fees. */
  treasury: bigint;
  detail: string;
};

export type FlowTotals = {
  feesNetToReserve: bigint;
  feeTakeToTreasury: bigint;
  claimsPaid: bigint;
  depositsIn: bigint;
  redemptionsOut: bigint;
};

export function moneyFlows(state: Pick<VaultState, "feesInTotal" | "feeTakeTotal" | "claimsPaidTotal">, ledger: Pick<Ledger, "fees" | "payouts" | "deposits" | "redeems">): {
  totals: FlowTotals;
  rows: FlowRow[];
} {
  const rows: FlowRow[] = [];
  for (const f of ledger.fees) {
    rows.push({ kind: "fee", account: f.address, at: f.blockTime, reserveDelta: f.data.net, treasury: f.data.take, detail: `slot ${f.data.slot}` });
  }
  for (const p of ledger.payouts) {
    rows.push({ kind: "claim", account: p.address, at: p.data.paidAt, reserveDelta: -p.data.amount, treasury: 0n, detail: legName(p.data.leg) });
  }
  let depositsIn = 0n;
  for (const d of ledger.deposits) {
    if (d.data.status !== DEPOSIT_FULFILLED) continue;
    depositsIn += d.data.assets;
    rows.push({ kind: "deposit", account: d.address, at: d.data.fulfilledAt, reserveDelta: d.data.assets, treasury: 0n, detail: `seq ${d.data.seq}` });
  }
  let redemptionsOut = 0n;
  for (const r of ledger.redeems) {
    if (r.data.assetsFilled === 0n) continue;
    redemptionsOut += r.data.assetsFilled;
    rows.push({ kind: "redemption", account: r.address, at: r.data.lastFillAt, reserveDelta: -r.data.assetsFilled, treasury: 0n, detail: `seq ${r.data.seq}` });
  }
  rows.sort((a, b) => Number((b.at ?? 0n) - (a.at ?? 0n)));
  return {
    totals: {
      feesNetToReserve: state.feesInTotal,
      feeTakeToTreasury: state.feeTakeTotal,
      claimsPaid: state.claimsPaidTotal,
      depositsIn,
      redemptionsOut,
    },
    rows,
  };
}

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
    .filter((d) => d.data.status === DEPOSIT_PENDING && d.data.seq >= state.depositHead)
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
    .filter((r) => r.data.sharesRemaining > 0n && r.data.seq >= state.redeemHead)
    .sort((a, b) => Number(a.data.seq - b.data.seq))
    .map((r, i): QueueRow => ({
      side: "redeem",
      address: r.address,
      seq: r.data.seq,
      owner: r.data.owner,
      waiting: r.data.sharesRemaining,
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
      payoutSlaSecs: c.payoutSlaSecs,
      featureFlags: c.featureFlags,
      paused: c.paused,
    },
    caps: c.caps,
    price: c.price,
    allowlistRoot: bytesToHex(new Uint8Array(c.investorAllowlistRoot)),
  };
}
