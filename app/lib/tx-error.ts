/**
 * A failed send, in plain English. The program's error is decoded from the
 * transaction logs (Anchor's `Error Code: <Name>`) or, when a wallet returns
 * only the encoded form, from its custom error number (`custom program error:
 * 0x1778`, `{"Custom":6008}`). The headline is one line built from that name
 * and, where the form has them, the preview numbers; the raw text stays
 * available behind a disclosure in the UI.
 */
import {
  MUTAV_ERROR__CLAIM_CALL_CAP_EXCEEDED,
  MUTAV_ERROR__CLAIM_NOT_FILED,
  MUTAV_ERROR__CLAIM_NOT_PAID,
  MUTAV_ERROR__CLAIM_PERIOD_CAP_EXCEEDED,
  MUTAV_ERROR__EXCEEDS_REMAINING_COVER,
  MUTAV_ERROR__EXPECTED_AMOUNT_MISMATCH,
  MUTAV_ERROR__GUARANTEE_CAP_EXCEEDED,
  MUTAV_ERROR__GUARANTEE_HAS_PAYMENTS,
  MUTAV_ERROR__GUARANTEE_NOT_ACTIVE,
  MUTAV_ERROR__INCOME_EXCEEDS_INBOX,
  MUTAV_ERROR__INSUFFICIENT_FREE_CAPITAL,
  MUTAV_ERROR__INSUFFICIENT_LIQUID_BALANCE,
  MUTAV_ERROR__INVALID_PARAMETER,
  MUTAV_ERROR__INVALID_PAYMENTS_ACCOUNT,
  MUTAV_ERROR__OPEN_CLAIMS,
  MUTAV_ERROR__PAUSED,
  MUTAV_ERROR__PAYOUT_ALREADY_SETTLED,
  MUTAV_ERROR__REFRESH_REQUIRED,
  MUTAV_ERROR__UNAUTHORIZED,
  MUTAV_ERROR__UNDER_COVERED,
} from "@mutav-finance/mutav-protocol-solana";
import { fmtBrs } from "./format";

/** Program error numbers the operator console can hit, by name. */
const CODES: Record<number, string> = {
  [MUTAV_ERROR__UNAUTHORIZED]: "Unauthorized",
  [MUTAV_ERROR__PAUSED]: "Paused",
  [MUTAV_ERROR__INVALID_PARAMETER]: "InvalidParameter",
  [MUTAV_ERROR__UNDER_COVERED]: "UnderCovered",
  [MUTAV_ERROR__INSUFFICIENT_FREE_CAPITAL]: "InsufficientFreeCapital",
  [MUTAV_ERROR__INSUFFICIENT_LIQUID_BALANCE]: "InsufficientLiquidBalance",
  [MUTAV_ERROR__GUARANTEE_CAP_EXCEEDED]: "GuaranteeCapExceeded",
  [MUTAV_ERROR__GUARANTEE_NOT_ACTIVE]: "GuaranteeNotActive",
  [MUTAV_ERROR__OPEN_CLAIMS]: "OpenClaims",
  [MUTAV_ERROR__EXCEEDS_REMAINING_COVER]: "ExceedsRemainingCover",
  [MUTAV_ERROR__CLAIM_NOT_FILED]: "ClaimNotFiled",
  [MUTAV_ERROR__CLAIM_NOT_PAID]: "ClaimNotPaid",
  [MUTAV_ERROR__CLAIM_CALL_CAP_EXCEEDED]: "ClaimCallCapExceeded",
  [MUTAV_ERROR__CLAIM_PERIOD_CAP_EXCEEDED]: "ClaimPeriodCapExceeded",
  [MUTAV_ERROR__INVALID_PAYMENTS_ACCOUNT]: "InvalidPaymentsAccount",
  [MUTAV_ERROR__PAYOUT_ALREADY_SETTLED]: "PayoutAlreadySettled",
  [MUTAV_ERROR__INCOME_EXCEEDS_INBOX]: "IncomeExceedsInbox",
  [MUTAV_ERROR__EXPECTED_AMOUNT_MISMATCH]: "ExpectedAmountMismatch",
  [MUTAV_ERROR__GUARANTEE_HAS_PAYMENTS]: "GuaranteeHasPayments",
  [MUTAV_ERROR__REFRESH_REQUIRED]: "RefreshRequired",
};

/** The system program's "account already in use": a reference recorded twice. */
export const ALREADY_RECORDED = "AlreadyRecorded";

/** The program error's name, or null when the failure is not a program error. */
export function decodeProgramError(message: string, logs: string[] | null): string | null {
  const named = logs?.map((l) => /Error Code: (\w+)/.exec(l)?.[1]).find(Boolean);
  if (named) return named;
  const text = [message, ...(logs ?? [])].join("\n");
  const hex = /custom program error: 0x([0-9a-f]+)/i.exec(text)?.[1];
  const dec = /"Custom"\s*:\s*(\d+)/.exec(text)?.[1] ?? /Custom\((\d+)\)/.exec(text)?.[1];
  const code = hex !== undefined ? parseInt(hex, 16) : dec !== undefined ? Number(dec) : null;
  if (code !== null && CODES[code]) return CODES[code]!;
  if (/already in use/i.test(text)) return ALREADY_RECORDED;
  return null;
}

/** The numbers a form can add to the headline (all BRS base units). */
export type RefusalContext = {
  /** The register_guarantee gate preview. */
  gate?: { needed: bigint; stableAssets: bigint; newCover: bigint; maxCover: bigint };
  /** A pay_claim against the claim caps. */
  claim?: { amount: bigint; perCall: bigint; remaining: bigint };
};

const PLAIN: Record<string, string> = {
  Unauthorized: "the connected wallet is not the signer this instruction needs.",
  Paused: "the reserve is paused.",
  InvalidParameter: "an amount or reference is out of range.",
  UnderCovered: "the reserve is under-covered, so new guarantees are frozen until coverage is restored.",
  InsufficientFreeCapital: "not enough free capital for this cover.",
  InsufficientLiquidBalance: "not enough liquid BRS in the reserve.",
  GuaranteeCapExceeded: "the cover is above the per-guarantee cap.",
  GuaranteeNotActive: "the guarantee is not active.",
  OpenClaims: "the guarantee has an open claim.",
  ExceedsRemainingCover: "the amount is above the leg's remaining cover.",
  ClaimNotFiled: "no filed claim matches this notice.",
  ClaimNotPaid: "the claim has not been paid yet.",
  ClaimCallCapExceeded: "the amount is above the per-call claim cap.",
  ClaimPeriodCapExceeded: "the amount is above what is left of the 31-day claim cap.",
  InvalidPaymentsAccount: "the destination is not the payments account.",
  PayoutAlreadySettled: "this payment is already settled.",
  IncomeExceedsInbox: "the amount is above the income inbox balance.",
  ExpectedAmountMismatch: "the amount does not match the claim's provision.",
  GuaranteeHasPayments: "the guarantee has claim payments, so it cannot be voided.",
  RefreshRequired: "the reserve needs a refresh in the same slot first.",
  [ALREADY_RECORDED]: "this reference is already recorded on-chain.",
};

/** One plain-English line for a program refusal. */
export function refusalLine(name: string, ctx: RefusalContext = {}): string {
  const { gate, claim } = ctx;
  if (name === "InsufficientFreeCapital" && gate) {
    return `Refused by the coverage gate: needs ${fmtBrs(gate.needed)} of required coverage, the reserve holds ${fmtBrs(gate.stableAssets)}.`;
  }
  if (name === "UnderCovered") return `Refused by the coverage gate: ${PLAIN.UnderCovered}`;
  if (name === "GuaranteeCapExceeded" && gate) {
    return `Refused by the per-guarantee cap: ${fmtBrs(gate.newCover)} of cover is above the ${fmtBrs(gate.maxCover)} cap.`;
  }
  if (name === "ClaimCallCapExceeded" && claim) {
    return `Refused by the claim caps: ${fmtBrs(claim.amount)} is above the per-call cap of ${fmtBrs(claim.perCall)}.`;
  }
  if (name === "ClaimPeriodCapExceeded" && claim) {
    return `Refused by the claim caps: ${fmtBrs(claim.amount)} is above the ${fmtBrs(claim.remaining)} left in the last 31 days.`;
  }
  return `Refused by the program: ${PLAIN[name] ?? `${name}.`}`;
}
