/**
 * Gate preview for `register_guarantee` (protocol spec §5.2), computed with the
 * client's math mirror from the last read of `VaultConfig` / `VaultState`.
 *
 * It replays the program's checks in the program's order
 * (`instructions/operator/register_guarantee.rs`), so the first reason shown
 * is the error the program would return for the same state. It is a PREVIEW:
 * the program decides, and state can move between the read and the
 * transaction. The UI labels it as such.
 */
import {
  coverageRequired,
  solvencyFromAccounts,
  MODE_NORMAL,
  type VaultConfig,
  type VaultState,
} from "@mutav-finance/mutav-protocol-solana";

export type GateRefusal =
  | "Paused"
  | "UnderCovered"
  | "StalePrice"
  | "InvalidParameter"
  | "GuaranteeCapExceeded"
  | "AgencyCapExceeded"
  | "InsufficientFreeCapital";

export type GateInput = {
  rent: bigint;
  defaultCover: bigint;
  exitCover: bigint;
  /** `AgencyExposure.outstanding_cover`, or 0 for an agency's first guarantee. */
  agencyOutstanding: bigint;
};

export type GatePreview = {
  fits: boolean;
  refusal: GateRefusal | null;
  newCover: bigint;
  /** `free_capital` before the registration. */
  freeCapitalBefore: bigint;
  stableAssets: bigint;
  coverageRequiredBefore: bigint;
  /** `ceil(c × (remaining_cover_total + new_cover) / 10_000)`. */
  coverageRequiredAfter: bigint;
  /** `coverage_required_after + earmark_eff_before`; must be ≤ `stable_assets`. */
  needed: bigint;
  /** `stable_assets − needed` when it fits, else how far short (negative). */
  headroomAfter: bigint;
};

type ConfigView = Pick<VaultConfig, "paused" | "coverageRatioBps" | "featureFlags" | "caps">;
type StateView = Pick<
  VaultState,
  "mode" | "brsBalance" | "tesouroUnits" | "tesouroPrice" | "remainingCoverTotal" | "provisions" | "bufferEarmark"
>;

export function previewRegisterGuarantee(config: ConfigView, state: StateView, g: GateInput): GatePreview {
  const before = solvencyFromAccounts(config, state);
  const newCover = g.defaultCover + g.exitCover;
  const coverageRequiredAfter = coverageRequired(state.remainingCoverTotal + newCover, config.coverageRatioBps);
  const needed = coverageRequiredAfter + before.earmarkEff;
  const base = {
    newCover,
    freeCapitalBefore: before.freeCapital,
    stableAssets: before.stableAssets,
    coverageRequiredBefore: before.coverageRequired,
    coverageRequiredAfter,
    needed,
    headroomAfter: before.stableAssets - needed,
  };
  const refuse = (refusal: GateRefusal): GatePreview => ({ ...base, fits: false, refusal });

  if (config.paused) return refuse("Paused");
  if (state.mode !== MODE_NORMAL) return refuse("UnderCovered");
  if (state.tesouroUnits !== 0n) return refuse("StalePrice");
  if (before.underCovered) return refuse("UnderCovered");
  if (newCover <= 0n || g.rent <= 0n) return refuse("InvalidParameter");
  if (newCover > config.caps.maxCoverPerGuarantee) return refuse("GuaranteeCapExceeded");
  if (g.agencyOutstanding + newCover > config.caps.maxCoverPerAgency) return refuse("AgencyCapExceeded");
  if (needed > before.stableAssets) return refuse("InsufficientFreeCapital");
  return { ...base, fits: true, refusal: null };
}

/** Plain-English reason for a refusal, for the demo screen. */
export const REFUSAL_TEXT: Record<GateRefusal, string> = {
  Paused: "The reserve is paused.",
  UnderCovered: "The reserve is under-covered: new guarantees are frozen until coverage is restored.",
  StalePrice: "The reserve holds TESOURO and its price is stale.",
  InvalidParameter: "Rent and cover must both be above zero.",
  GuaranteeCapExceeded: "The cover is above the per-guarantee cap.",
  AgencyCapExceeded: "This agency would go over its per-agency cap.",
  InsufficientFreeCapital: "Not enough free capital: the reserve would no longer cover every guarantee.",
};
