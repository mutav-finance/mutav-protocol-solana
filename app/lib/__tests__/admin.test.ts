import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, ALLOCATION_ALIAS, CONFIG_FIELD_HOME, CONFIG_FIELD_NOT_EDITED, MAX_FEE_TAKE_BPS, capsError, generalConfigError, rolesError } from "../admin";

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

describe("set_config field homes", () => {
  const ADMIN = join(__dirname, "../../components/admin");
  const file = { general: "General.tsx", money: "Money.tsx", allocation: "Allocation.tsx" } as const;
  const src = (f: string) => readFileSync(join(ADMIN, f), "utf8");
  /** Fields a ConfigCard edits in a file: `brsField("key"`, `secsField("key"`, `bpsField("key"`. */
  const cardFields = (f: string) => [...src(f).matchAll(/(?:brs|secs|bps)Field\("(\w+)"/g)].map((x) => x[1]!);

  it("puts every per-flow field in exactly one card, in its home section", () => {
    const all = Object.values(file).flatMap(cardFields);
    expect(new Set(all).size).toBe(all.length);
    for (const [field, home] of Object.entries(CONFIG_FIELD_HOME)) {
      const f = file[home.split("-")[0] as keyof typeof file];
      expect([field, src(f)]).toEqual([field, expect.stringContaining(`id="${home}"`)]);
      if (all.includes(field)) expect([field, cardFields(f)]).toEqual([field, expect.arrayContaining([field])]);
    }
    expect(all.sort()).toEqual(Object.keys(CONFIG_FIELD_HOME).filter((k) => all.includes(k)).sort());
  });

  it("gives every field set_config writes a home on /admin or a stated reason, derived from the program", () => {
    // set_config's own fields plus those its apply_caps / apply_price / apply_exit write (config.rs).
    const ids = (f: string) => [...readFileSync(join(PROGRAM, f), "utf8").matchAll(/field::([A-Z0-9_]+)/g)].map((x) => x[1]!);
    const written = new Set([...ids("instructions/admin/set_config.rs"), ...ids("state/config.rs")]);
    const key = (id: string) =>
      id === "EXIT_BARRED_0" ? "barred" : id.replace(/^(CAPS|PRICE|EXIT)_/, "").toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    const fields = [...written].map(key).sort();
    expect(fields.length).toBeGreaterThan(30);
    const covered = [...Object.keys(CONFIG_FIELD_HOME), ...Object.keys(CONFIG_FIELD_NOT_EDITED)];
    expect(new Set(covered).size).toBe(covered.length);
    expect(covered.sort()).toEqual(fields);
  });

  it("keeps the NAV-move guard next to clear_fulfil_halt in Emergency", () => {
    expect(CONFIG_FIELD_HOME.maxNavMoveBps).toBe("general-emergency");
  });

  it("keeps the partial-fill floor with redemptions and the payout SLA with claim payments", () => {
    expect(CONFIG_FIELD_HOME.minFillAssets).toBe("money-redemptions");
    expect(CONFIG_FIELD_HOME.payoutSlaSecs).toBe("money-claims");
    expect(cardFields("General.tsx")).not.toContain("payoutSlaSecs");
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
