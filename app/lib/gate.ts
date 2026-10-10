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
  | "InvalidParameter"
  | "GuaranteeCapExceeded"
  | "InsufficientFreeCapital";

export type GateInput = {
  defaultCover: bigint;
  exitCover: bigint;
};

export type GatePreview = {
  fits: boolean;
  refusal: GateRefusal | null;
  newCover: bigint;
  /** `free_capital` before the registration. */
  freeCapitalBefore: bigint;
  stableAssets: bigint;
  coverageRequiredBefore: bigint;
  /** `max(ceil(c × (remaining_cover_total + new_cover) / 10_000), provisions)` (ADR 0016). */
  coverageRequiredAfter: bigint;
  /** `coverage_required_after`; must be ≤ `stable_assets`. */
  needed: bigint;
  /** `stable_assets − needed` when it fits, else how far short (negative). */
  headroomAfter: bigint;
};

type ConfigView = Pick<VaultConfig, "paused" | "coverageRatioBps" | "caps">;
type StateView = Pick<VaultState, "mode" | "brsBalance" | "remainingCoverTotal" | "provisions">;

export function previewRegisterGuarantee(config: ConfigView, state: StateView, g: GateInput): GatePreview {
  const before = solvencyFromAccounts(config, state);
  const newCover = g.defaultCover + g.exitCover;
  const coverageRequiredAfter = coverageRequired(state.remainingCoverTotal + newCover, config.coverageRatioBps, state.provisions);
  const needed = coverageRequiredAfter;
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
  if (before.underCovered) return refuse("UnderCovered");
  if (newCover <= 0n) return refuse("InvalidParameter");
  if (newCover > config.caps.maxCoverPerGuarantee) return refuse("GuaranteeCapExceeded");
  if (needed > before.stableAssets) return refuse("InsufficientFreeCapital");
  return { ...base, fits: true, refusal: null };
}

/** Plain-English reason for a refusal, for the demo screen. */
export const REFUSAL_TEXT: Record<GateRefusal, string> = {
  Paused: "The reserve is paused.",
  UnderCovered: "The reserve is under-covered: new guarantees are frozen until coverage is restored.",
  InvalidParameter: "Rent and cover must both be above zero.",
  GuaranteeCapExceeded: "The cover is above the per-guarantee cap.",
  InsufficientFreeCapital: "Not enough free capital: the reserve would no longer cover every guarantee.",
};
