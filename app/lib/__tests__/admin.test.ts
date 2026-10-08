import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, ALLOCATION_ALIAS, MAX_FEE_TAKE_BPS, capsError, generalConfigError, rolesError } from "../admin";

const PROGRAM = join(__dirname, "../../../programs/mutav/src");
const A = "9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU";
const B = "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo";
const C = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

describe("/admin sections", () => {
  it("are General, Money in & out, Allocation, in that order, with #reserve-assets kept as an alias", () => {
    expect(ADMIN_SECTIONS.map((s) => s.id)).toEqual(["general", "money", "allocation"]);
    expect(ALLOCATION_ALIAS).toBe("reserve-assets");
  });
});

describe("general bounds", () => {
  it("mirrors MAX_FEE_TAKE_BPS in the program", () => {
    const m = readFileSync(join(PROGRAM, "constants.rs"), "utf8").match(/pub const MAX_FEE_TAKE_BPS: u16 = ([\d_]+);/);
    expect(Number(m![1]!.replace(/_/g, ""))).toBe(MAX_FEE_TAKE_BPS);
  });

  it("checks c, the fee take and the payout SLA", () => {
    expect(generalConfigError({ coverageRatioBps: 1_000, feeTakeBps: 3_000, payoutSlaSecs: 0n })).toBeNull();
    expect(generalConfigError({ coverageRatioBps: 999 })).toMatch(/coverage_ratio_bps/);
    expect(generalConfigError({ feeTakeBps: 3_001 })).toMatch(/fee_take_bps/);
    expect(generalConfigError({ payoutSlaSecs: -1n })).toMatch(/payout_sla_secs/);
  });

  it("checks the merged caps", () => {
    expect(capsError({ minRequest: 1n, maxRequest: 2n, claimPeriodSecs: 1n })).toBeNull();
    expect(capsError({ minRequest: 3n, maxRequest: 2n, claimPeriodSecs: 1n })).toMatch(/min_request/);
    expect(capsError({ minRequest: 1n, maxRequest: 2n, claimPeriodSecs: 0n })).toMatch(/claim_period_secs/);
  });

  it("checks roles as validate_roles does: set, and three distinct keys", () => {
    expect(rolesError({ operator: B, pauser: C }, A)).toBeNull();
    expect(rolesError({ operator: A, pauser: C }, A)).toMatch(/distinct/);
    expect(rolesError({ operator: B, pauser: B }, A)).toMatch(/distinct/);
    expect(rolesError({ operator: "11111111111111111111111111111111", pauser: C }, A)).toMatch(/set/);
    expect(rolesError({ operator: "nope", pauser: C }, A)).toMatch(/addresses/);
  });
});
