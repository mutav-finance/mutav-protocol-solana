import { describe, expect, it } from "vitest";
import { computeSolvency, coverageRequired } from "@mutav-finance/mutav-protocol-solana";
import { previewRegisterGuarantee } from "../gate";
import { BRL, config, state } from "./fixtures";

const g = (cover: bigint, agencyOutstanding = 0n) => ({ rent: 3_000n * BRL, defaultCover: cover, exitCover: 0n, agencyOutstanding });

describe("register_guarantee gate preview", () => {
  const funded = state({ brsBalance: 50_000n * BRL, remainingCoverTotal: 40_000n * BRL });

  it("fits while coverage after stays within stable assets", () => {
    const p = previewRegisterGuarantee(config(), funded, g(9_000n * BRL));
    expect(p.fits).toBe(true);
    expect(p.freeCapitalBefore).toBe(10_000n * BRL);
    expect(p.coverageRequiredAfter).toBe(49_000n * BRL);
    expect(p.headroomAfter).toBe(1_000n * BRL);
  });

  it("fits exactly at the boundary and refuses one base unit past it", () => {
    expect(previewRegisterGuarantee(config(), funded, g(10_000n * BRL)).fits).toBe(true);
    const over = previewRegisterGuarantee(config(), funded, g(10_000n * BRL + 1n));
    expect(over).toMatchObject({ fits: false, refusal: "InsufficientFreeCapital" });
    expect(over.headroomAfter).toBe(-1n);
  });

  it("agrees with the math mirror's free capital (c = 100%)", () => {
    const sol = computeSolvency({
      brsBalance: funded.brsBalance, tesouroUnits: 0n, tesouroPrice: 0n, remainingCoverTotal: funded.remainingCoverTotal,
      coverageRatioBps: 10_000, provisions: 0n, bufferEarmark: 0n, featureFlags: 0n, headStarved: false,
    });
    expect(previewRegisterGuarantee(config(), funded, g(sol.freeCapital)).fits).toBe(true);
    expect(previewRegisterGuarantee(config(), funded, g(sol.freeCapital + 1n)).fits).toBe(false);
  });

  it("rounds coverage up like the program (c = 120%)", () => {
    const c = config({ coverageRatioBps: 12_000 });
    const s = state({ brsBalance: 12n, remainingCoverTotal: 0n });
    // ceil(1.2 × 10) = 12 fits; ceil(1.2 × 11) = 14 does not.
    expect(coverageRequired(11n, 12_000, 0n)).toBe(14n);
    expect(previewRegisterGuarantee(c, s, { rent: 1n, defaultCover: 10n, exitCover: 0n, agencyOutstanding: 0n }).fits).toBe(true);
    expect(previewRegisterGuarantee(c, s, { rent: 1n, defaultCover: 11n, exitCover: 0n, agencyOutstanding: 0n }).refusal).toBe("InsufficientFreeCapital");
  });

  it("below c = 1, sizes coverage at c × cover (c = 10%, ADR 0016)", () => {
    const c = config({ coverageRatioBps: 1_000 });
    // R$10k backs R$100k of cover: R$40k already, so R$60k more fits exactly.
    const s = state({ brsBalance: 10_000n * BRL, remainingCoverTotal: 40_000n * BRL });
    const fits = previewRegisterGuarantee(c, s, g(30_000n * BRL));
    expect(fits).toMatchObject({ fits: true, coverageRequiredBefore: 4_000n * BRL, coverageRequiredAfter: 7_000n * BRL });
    expect(fits.freeCapitalBefore).toBe(6_000n * BRL);
    const full = state({ brsBalance: 10_000n * BRL, remainingCoverTotal: 90_000n * BRL });
    expect(previewRegisterGuarantee(c, full, g(10_000n * BRL)).fits).toBe(true);
    // ceil(0.1 × (100k + 1 base unit)) = 10k + 1 base unit > 10k.
    expect(previewRegisterGuarantee(c, full, g(10_000n * BRL + 1n)).refusal).toBe("InsufficientFreeCapital");
  });

  it("below c = 1, coverage is never below the open provisions", () => {
    const c = config({ coverageRatioBps: 1_000 });
    // 60k cover, 9k filed: coverage max(6k, 9k) = 9k, free capital 1k.
    const s = state({ brsBalance: 10_000n * BRL, remainingCoverTotal: 60_000n * BRL, provisions: 9_000n * BRL });
    const p = previewRegisterGuarantee(c, s, g(30_000n * BRL));
    expect(p).toMatchObject({ fits: true, coverageRequiredBefore: 9_000n * BRL, coverageRequiredAfter: 9_000n * BRL, freeCapitalBefore: 1_000n * BRL });
    // Provisions above stable assets: under-covered, though c × cover alone would fit.
    const over = state({ ...s, provisions: 11_000n * BRL });
    expect(previewRegisterGuarantee(c, over, g(1_000n * BRL)).refusal).toBe("UnderCovered");
  });

  it("checks caps before solvency, in program order", () => {
    expect(previewRegisterGuarantee(config(), funded, g(30_000n * BRL + 1n)).refusal).toBe("GuaranteeCapExceeded");
    expect(previewRegisterGuarantee(config(), funded, g(5_000n * BRL, 56_000n * BRL)).refusal).toBe("AgencyCapExceeded");
    expect(previewRegisterGuarantee(config(), funded, { ...g(1n), rent: 0n }).refusal).toBe("InvalidParameter");
  });

  it("refuses while paused, in under-coverage mode, or under-covered inline", () => {
    expect(previewRegisterGuarantee(config({ paused: true }), funded, g(1n)).refusal).toBe("Paused");
    expect(previewRegisterGuarantee(config(), state({ ...funded, mode: 1 }), g(1n)).refusal).toBe("UnderCovered");
    // Ratio raised to 150%: 40k cover needs 60k, only 50k held — under-covered before refresh records it.
    expect(previewRegisterGuarantee(config({ coverageRatioBps: 15_000 }), funded, g(1n)).refusal).toBe("UnderCovered");
  });
});
