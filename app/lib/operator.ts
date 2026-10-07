/**
 * Operator view models for /operator: the duties of the operator key, the
 * on-chain bounds on each one, and the live limits (claim-payment cap window,
 * payouts against the SLA). Pure functions over decoded accounts.
 *
 * Duties and bounds come from spec §5.2–5.4. "Later" says what triggers the
 * instruction once mutav-app's backend sends it with the KMS-held key; where
 * the spec does not document a trigger it says so instead of inventing one.
 */
import type { VaultConfig, VaultState } from "@mutav-finance/mutav-protocol-solana";
import type { ClaimRow } from "./view";

export type OperatorInstruction = "register_guarantee" | "close_guarantee" | "contribute_fees" | "file_claim" | "pay_claim" | "settle_payout";

export type Duty = {
  ix: OperatorInstruction;
  /** What the person operating by hand does today. */
  today: string;
  /** What will trigger it in MUTAV's backend later. */
  later: string;
  /** The on-chain rules that bound it (spec §5.2–5.4). */
  bound: string;
};

export const DUTIES: Duty[] = [
  {
    ix: "register_guarantee",
    today: "Register the lease an agency signed up in the platform, with its rent and its default and exit cover.",
    later: "Triggered by the MUTAV platform when a lease is registered.",
    bound: "Not paused, mode Normal; cover ≤ max per guarantee; agency total ≤ max per agency; the new cover must fit in free capital (solvency gate).",
  },
  {
    ix: "close_guarantee",
    today: "Close a guarantee that has ended, releasing its remaining cover.",
    later: "Triggered by the MUTAV platform.",
    bound: "Guarantee active and no open claims. Not solvency-gated: it only releases liability.",
  },
  {
    ix: "contribute_fees",
    today: "Record a guarantee fee invoice once its PIX is received and minted to BRS in the operator's account.",
    later: "Triggered per invoice once the fee arrives (PIX → BRS); mutav-app reconciles each FeeReceipt against its invoices.",
    bound: "Each invoice is recorded once (FeeReceipt). The take goes to the treasury, the rest to the reserve. Never paused, never gated.",
  },
  {
    ix: "file_claim",
    today: "File a claim after MUTAV has verified and approved it in the platform.",
    later: "Triggered by claim approval in the platform (the agency's 15-day filing window is enforced there).",
    bound: "Guarantee active; amount ≤ the leg's cover not yet paid or provisioned. Books a provision: NAV drops at once.",
  },
  {
    ix: "pay_claim",
    today: "Pay a filed claim from the reserve to the payments account.",
    later: "Triggered by the MUTAV platform after the filing.",
    bound: "≤ max per call; ≤ what is left of the per-period cap; ≤ the filing's provision plus the leg's unprovisioned cover; liquid BRS only; destination fixed to the payments account. Never solvency-gated.",
  },
  {
    ix: "settle_payout",
    today: "Record the PIX settlement (hash of the end-to-end id) once the agency has been paid.",
    later: "Triggered by the PIX confirmation after MUTAV offramps BRS → BRL and pays the agency.",
    bound: "Payout pending; the PIX hash is non-zero. Settling after paid_at + payout SLA marks it late, on-chain and for good.",
  },
];

// ── Claim-payment cap window ────────────────────────────────────────────────

export type ClaimCap = {
  perCall: bigint;
  perPeriod: bigint;
  periodSecs: bigint;
  /** Window start as stored; null before the first payment. */
  windowStart: bigint | null;
  windowEnd: bigint | null;
  /** Paid in the current window. Zero once the stored window has ended: the next pay_claim rolls it. */
  paid: bigint;
  remaining: bigint;
  /** The stored window has ended; the next pay_claim starts a new one. */
  rolled: boolean;
  /** Largest single pay_claim the caps allow now. */
  maxNextPayment: bigint;
};

export function claimCap(c: Pick<VaultConfig, "caps">, s: Pick<VaultState, "claimPeriodStart" | "claimPeriodPaid">, now: bigint): ClaimCap {
  const { maxClaimPerCall: perCall, maxClaimPerPeriod: perPeriod, claimPeriodSecs: periodSecs } = c.caps;
  const started = s.claimPeriodStart > 0n;
  const windowEnd = started ? s.claimPeriodStart + periodSecs : null;
  // spec §5.4 pay_claim rule 4: roll the window if now ≥ start + period.
  const rolled = !started || now >= windowEnd!;
  const paid = rolled ? 0n : s.claimPeriodPaid;
  const remaining = perPeriod > paid ? perPeriod - paid : 0n;
  return {
    perCall,
    perPeriod,
    periodSecs,
    windowStart: started ? s.claimPeriodStart : null,
    windowEnd,
    paid,
    remaining,
    rolled,
    maxNextPayment: remaining < perCall ? remaining : perCall,
  };
}

/** Why a pay_claim of `amount` would be refused by the caps, or null if they allow it. */
export function claimCapRefusal(cap: ClaimCap, amount: bigint): "ClaimCallCapExceeded" | "ClaimPeriodCapExceeded" | null {
  if (amount > cap.perCall) return "ClaimCallCapExceeded";
  if (amount > cap.remaining) return "ClaimPeriodCapExceeded";
  return null;
}

// ── Payouts against the SLA ─────────────────────────────────────────────────

export type PayoutDue = { filing: string; guaranteeId: string; leg: string; amount: bigint; paidAt: bigint; dueAt: bigint; secondsLeft: bigint; late: boolean };

/** Paid, unsettled claims: when each settlement is due (paid_at + SLA) and how long is left. Most urgent first. */
export function payoutsDue(rows: ClaimRow[], slaSecs: bigint, now: bigint): PayoutDue[] {
  return rows
    .filter((c) => c.stage === "paid" && c.paidAt !== null)
    .map((c) => {
      const dueAt = c.paidAt! + slaSecs;
      return { filing: c.filing, guaranteeId: c.guaranteeId, leg: c.leg, amount: c.amount ?? 0n, paidAt: c.paidAt!, dueAt, secondsLeft: dueAt - now, late: c.lateOnChain || now > dueAt };
    })
    .sort((a, b) => Number(a.dueAt - b.dueAt));
}

/** Claims the operator still has to act on: filed and unpaid, paid and unsettled, and late ones. */
export function claimWork(rows: ClaimRow[]) {
  return {
    toPay: rows.filter((c) => c.stage === "filed").length,
    toSettle: rows.filter((c) => c.stage === "paid").length,
    late: rows.filter((c) => c.lateOnChain || c.overdue).length,
  };
}

// ── Activity ────────────────────────────────────────────────────────────────

export type OperatorActivity = {
  signature: string;
  blockTime: bigint | null;
  ok: boolean;
  /** MUTAV instructions in the transaction, by name ("unknown" if not decodable). */
  instructions: string[];
};

/** Name an instruction from its 8-byte Anchor discriminator. */
export function instructionName(data: Uint8Array, table: readonly (readonly [string, ArrayLike<number>])[]): string {
  for (const [name, d] of table) if (d.length <= data.length && Array.from(d).every((x, i) => data[i] === x)) return name;
  return "unknown";
}
