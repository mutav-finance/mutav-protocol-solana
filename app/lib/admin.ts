/**
 * /admin section map and the program bounds the general and per-flow
 * `set_config` controls check before composing (the program checks them last).
 */
import { isAddress } from "@solana/kit";
import { MIN_COVERAGE_RATIO_BPS } from "@mutav-finance/mutav-protocol-solana";

/** Program maximum for `fee_take_bps` (`MAX_FEE_TAKE_BPS`, 30%); a test checks it against constants.rs. */
export const MAX_FEE_TAKE_BPS = 3_000;

/** The /admin sections, in page order. `#reserve-assets` is kept as an alias of `#allocation`. */
export const ADMIN_SECTIONS = [
  { id: "general", label: "General controls" },
  { id: "money", label: "Money in & out" },
  { id: "allocation", label: "Allocation" },
] as const;
export const ALLOCATION_ALIAS = "reserve-assets";

/**
 * Where each `set_config` field is edited on /admin: every parameter lives
 * with what it governs, in exactly one card.
 */
export const CONFIG_FIELD_HOME = {
  coverageRatioBps: "general-coverage",
  maxTvl: "general-coverage",
  maxCoverPerGuarantee: "general-coverage",
  maxCoverPerAgency: "general-coverage",
  minRequest: "money-deposits",
  maxRequest: "money-deposits",
  feeTakeBps: "money-fees",
  incomeTakeBps: "money-income",
  minFillAssets: "money-redemptions",
  maxClaimPerCall: "money-claims",
  maxClaimPerPeriod: "money-claims",
  claimPeriodSecs: "money-claims",
  payoutSlaSecs: "money-claims",
  /** The settlement floor; TODO(rename) `min_settlement_bps`. */
  maxTesouroShareBps: "allocation-controls",
  maxNavMoveBps: "general-emergency",
} as const;

/**
 * set_config fields the pilot app deliberately does not edit, and why. With
 * CONFIG_FIELD_HOME this covers every field set_config writes; a test derives
 * that list from the program, so a field cannot drop out of /admin unnoticed.
 */
export const CONFIG_FIELD_NOT_EDITED: Record<string, string> = {
  featureFlags: "SUPPORTED_FEATURES = 0 in the pilot binary: no feature can be switched on",
  mutavCapitalWallet: "the allowlisted capital wallet; fixed for the pilot",
  treasuryAccount: "fixed for the pilot; set_config carries the current one",
  tesouroPriceAccount: "per-adapter price feed, with the first adapter (ADR 0018)",
  p0: "per-adapter price feed, with the first adapter (ADR 0018)",
  t0: "per-adapter price feed, with the first adapter (ADR 0018)",
  yMaxBps: "per-adapter price feed, with the first adapter (ADR 0018)",
  maxStalenessSecs: "per-adapter price feed, with the first adapter (ADR 0018)",
  maxDeviationBps: "per-adapter price feed, with the first adapter (ADR 0018)",
  ...Object.fromEntries(
    [
      "bufferTargetBps", "bufferHeadroomBps", "bufferReleaseAfterSecs", "curveVersion", "hMinBps", "hPegBps", "hMaxBps", "pressureEpochSecs",
      "minInstantAssets", "maxInstantPerTx", "maxInstantPerWallet", "maxInstantPerPeriod", "instantPeriodSecs", "minHoldSecs", "maxPriceAgeSecs", "allowlistRoot", "barred",
    ].map((k) => [k, "phase-2 instant exit (ExitParams), disabled in the pilot"]),
  ),
};

// ── General controls ────────────────────────────────────────────────────────

/** The bound `validate_roles` enforces: set, distinct from the admin and from each other. */
export function rolesError(req: { operator: string; pauser: string }, admin: string): string | null {
  if (!isAddress(req.operator) || !isAddress(req.pauser)) return "operator and pauser must be addresses";
  if (req.operator === "11111111111111111111111111111111" || req.pauser === "11111111111111111111111111111111") return "operator and pauser must be set";
  if (req.operator === admin || req.pauser === admin || req.operator === req.pauser) return "operator, pauser and admin must be three distinct keys";
  return null;
}

/** The bounds `validate_params` puts on the general `set_config` fields. */
export function generalConfigError(req: { coverageRatioBps?: number; feeTakeBps?: number; payoutSlaSecs?: bigint }): string | null {
  if (req.payoutSlaSecs !== undefined && req.payoutSlaSecs < 0n) return "payout_sla_secs must be ≥ 0";
  const c = req.coverageRatioBps;
  if (c !== undefined && (!Number.isInteger(c) || c < MIN_COVERAGE_RATIO_BPS || c > 65_535)) return `coverage_ratio_bps must be ≥ ${MIN_COVERAGE_RATIO_BPS} (c ≥ 0.10, ADR 0016)`;
  const f = req.feeTakeBps;
  if (f !== undefined && (!Number.isInteger(f) || f < 0 || f > MAX_FEE_TAKE_BPS)) return `fee_take_bps must be 0–${MAX_FEE_TAKE_BPS}`;
  return null;
}

/** Bounds on the caps after the change is merged over the on-chain values (`validate_params`). */
export function capsError(caps: { minRequest: bigint; maxRequest: bigint; claimPeriodSecs: bigint }): string | null {
  if (caps.minRequest > caps.maxRequest) return "min_request must be ≤ max_request";
  if (caps.claimPeriodSecs <= 0n) return "claim_period_secs must be > 0";
  return null;
}
