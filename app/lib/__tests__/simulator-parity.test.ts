/**
 * Parity between the reserve simulator (`public/simulator.html`, a static page)
 * and the program's coverage maths as mirrored by the client
 * (`@mutav-finance/mutav-protocol-solana`, `clients/js/src/math.ts`).
 *
 * The simulator's calc script is plain browser JS with a `module.exports`
 * block, so it is loaded here in a VM context and its exports are checked on
 * random vectors in base units.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { computeSolvency, coverageRequired } from "@mutav-finance/mutav-protocol-solana";

type Row = { refusal: string | null; newLeases: number; remaining: number; required: number; balance: number; active: number; opening: number; gain: number; brsIncome: number };
type Result = {
  finalActive: number;
  plannedActive: number;
  blockedMonths: number;
  firstRefusal: string | null;
  capacityAtStart: number;
  endRemaining: number;
  endRequired: number;
  endBalance: number;
  tesouroShare: number;
  tvlRefused: number;
  take: number;
  req: { cBps: number; cover: number; perLease: number; overGuaranteeCap: boolean };
  rows: Row[];
};
type Params = Record<string, number | string | boolean>;
type Sim = {
  mutavCoverageRequired: (remaining: number, bps: number, provisions: number) => number;
  mutavFreeCapital: (stable: number, remaining: number, bps: number, provisions: number) => number;
  mutavGateAdmits: (stable: number, remaining: number, newCover: number, bps: number, provisions: number) => boolean;
  mutavGateCount: (stable: number, remaining: number, cover: number, bps: number, provisions: number, max: number) => number;
  mutavCoverageBps: (c: number) => number;
  mutavCompute: (p: Params) => Result;
  MUTAV_DEFAULTS: Params;
  MUTAV_PROTOCOL: { MIN_COVERAGE_RATIO_BPS: number; MAX_FEE_TAKE_BPS: number };
};

function loadSimulator(): Sim {
  const html = readFileSync(fileURLToPath(new URL("../../public/simulator.html", import.meta.url)), "utf8");
  const calc = html.match(/<script id="calc">([\s\S]*?)<\/script>/);
  if (!calc) throw new Error("simulator.html has no <script id=\"calc\">");
  const sandbox = { module: { exports: {} as unknown } };
  runInNewContext(calc[1], sandbox);
  return sandbox.module.exports as Sim;
}

const sim = loadSimulator();
/** BRS base units per real (6 decimals). */
const BRL_UNITS = 1_000_000;

/**
 * Expected `coverage_required` under ADR 0016: `max(ceil(c × remaining / 10_000), provisions)`.
 * TODO(PR A): once the client's `coverageRequired` takes `provisions`, call it directly
 * instead of taking the max here.
 */
const expectedRequired = (remaining: bigint, bps: number, provisions: bigint) => {
  const c = coverageRequired(remaining, bps);
  return c > provisions ? c : provisions;
};

/** Deterministic PRNG (mulberry32), so a failure is reproducible. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(0x5eed);
const int = (max: number) => Math.floor(R() * max);
/** Base units (6 dp) up to R$1bn, with small values over-represented. */
const amount = () => (R() < 0.2 ? int(1_000) : Math.floor(10 ** (R() * 15)));
const bps = () => (R() < 0.15 ? [1_000, 2_500, 10_000, 20_000][int(4)] : 1_000 + int(19_001));

describe("simulator ↔ client coverage maths", () => {
  it("coverage required matches max(ceil(c × remaining), provisions) on random vectors", () => {
    for (let i = 0; i < 2_000; i++) {
      const remaining = amount(), c = bps();
      const provisions = R() < 0.5 ? 0 : R() < 0.5 ? amount() : Math.ceil((remaining * c) / 10_000);
      const want = expectedRequired(BigInt(remaining), c, BigInt(provisions));
      expect(BigInt(sim.mutavCoverageRequired(remaining, c, provisions)), `rem=${remaining} c=${c} prov=${provisions}`).toBe(want);
    }
  });

  it("rounds up like the program at the edges", () => {
    expect(sim.mutavCoverageRequired(11, 12_000, 0)).toBe(14);
    expect(sim.mutavCoverageRequired(1, 1_000, 0)).toBe(1);
    expect(sim.mutavCoverageRequired(0, 1_000, 0)).toBe(0);
    expect(sim.mutavCoverageRequired(0, 1_000, 7)).toBe(7);
    expect(sim.mutavCoverageRequired(100, 1_000, 5)).toBe(10);
    expect(sim.mutavCoverageRequired(100, 1_000, 11)).toBe(11);
  });

  it("free capital matches the client's computeSolvency (no provisions, no TESOURO, no earmark)", () => {
    for (let i = 0; i < 1_000; i++) {
      const remaining = amount(), c = bps(), stable = amount();
      const sol = computeSolvency({
        brsBalance: BigInt(stable), tesouroUnits: 0n, tesouroPrice: 0n, remainingCoverTotal: BigInt(remaining),
        coverageRatioBps: c, provisions: 0n, bufferEarmark: 0n, featureFlags: 0n, headStarved: false,
      });
      expect(BigInt(sim.mutavFreeCapital(stable, remaining, c, 0))).toBe(sol.freeCapital);
    }
  });

  it("the register_guarantee gate (rule 5) matches the expected formula, provisions included", () => {
    for (let i = 0; i < 2_000; i++) {
      const remaining = amount(), newCover = amount(), c = bps();
      const provisions = R() < 0.6 ? 0 : amount();
      // Put stable assets near the boundary half the time, so both outcomes are exercised.
      const boundary = Number(expectedRequired(BigInt(remaining + newCover), c, BigInt(provisions)));
      const stable = R() < 0.5 ? Math.max(0, boundary + int(3) - 1) : amount();
      const want = expectedRequired(BigInt(remaining + newCover), c, BigInt(provisions)) <= BigInt(stable);
      expect(sim.mutavGateAdmits(stable, remaining, newCover, c, provisions), `stable=${stable} rem=${remaining} new=${newCover} c=${c} prov=${provisions}`).toBe(want);
    }
  });

  it("counts identical registrations exactly as repeated gate calls", () => {
    for (let i = 0; i < 300; i++) {
      const c = bps(), cover = 1 + int(50_000_000_000), remaining = int(10) * cover, stable = int(400_000_000_000), max = int(120);
      let k = 0;
      while (k < max && expectedRequired(BigInt(remaining + (k + 1) * cover), c, 0n) <= BigInt(stable)) k++;
      expect(sim.mutavGateCount(stable, remaining, cover, c, 0, max)).toBe(k);
    }
  });

  it("never lets c fall below the program floor", () => {
    expect(sim.MUTAV_PROTOCOL.MIN_COVERAGE_RATIO_BPS).toBe(1_000);
    expect(sim.mutavCoverageBps(0.05)).toBe(1_000);
    expect(sim.mutavCoverageBps(0.1)).toBe(1_000);
    expect(sim.mutavCoverageBps(0.25)).toBe(2_500);
    expect(sim.mutavCoverageBps(1)).toBe(10_000);
  });
});

describe("simulator defaults = the devnet config", () => {
  // TODO(PR A): read these from scripts/devnet/devnet.example.json once it carries the
  // locked values (c = 1_000 and the caps below); until then they are pinned here.
  const BRL = 1_000_000;
  const devnet = {
    coverageRatioBps: 1_000,
    caps: {
      maxTvl: 300_000 * BRL,
      maxCoverPerGuarantee: 40_000 * BRL,
      maxCoverPerAgency: 10_000_000 * BRL,
      maxClaimPerCall: 10_000 * BRL,
      maxClaimPerPeriod: 20_000 * BRL,
      maxTesouroShareBps: 0,
    },
    feeTakeBpsMax: 3_000,
  };
  const d = sim.MUTAV_DEFAULTS;

  it("pins c and every cap the simulator enforces", () => {
    expect(sim.mutavCoverageBps(d.coverageRatio as number)).toBe(devnet.coverageRatioBps);
    expect((d.maxTvl as number) * BRL).toBe(devnet.caps.maxTvl);
    expect((d.maxCoverPerGuarantee as number) * BRL).toBe(devnet.caps.maxCoverPerGuarantee);
    expect((d.maxCoverPerAgency as number) * BRL).toBe(devnet.caps.maxCoverPerAgency);
    expect((d.maxClaimPerCall as number) * BRL).toBe(devnet.caps.maxClaimPerCall);
    expect((d.maxClaimPerPeriod as number) * BRL).toBe(devnet.caps.maxClaimPerPeriod);
    expect(Math.round((d.maxTesouroSharePct as number) * 100)).toBe(devnet.caps.maxTesouroShareBps);
    expect(sim.MUTAV_PROTOCOL.MAX_FEE_TAKE_BPS).toBe(devnet.feeTakeBpsMax);
    expect((d.takePct as number) * 100).toBeLessThanOrEqual(devnet.feeTakeBpsMax);
  });

  it("the per-agency cap leaves room above max_tvl ÷ c for fee growth, so it never binds", () => {
    expect(devnet.caps.maxCoverPerAgency).toBeGreaterThanOrEqual((3 * devnet.caps.maxTvl * 10_000) / devnet.coverageRatioBps);
  });
});

describe("simulator on the pilot", () => {
  const pilot = (o: Params = {}) =>
    sim.mutavCompute({ ...sim.MUTAV_DEFAULTS, months: 6, perMonth: 10, tesouroSharePct: 50, ...o });

  it("backs about 75 leases on R$300k at c = 0.10 and runs the 30- and 60-lease pilots", () => {
    const rec = pilot();
    expect(rec.capacityAtStart).toBe(75);
    expect(rec.finalActive).toBe(60);
    expect(rec.blockedMonths).toBe(0);
    expect(pilot({ perMonth: 5 }).finalActive).toBe(30);
  });

  it("drops to about 7 leases at full backing (c = 1.0)", () => {
    const full = pilot({ coverageRatio: 1 });
    expect(full.capacityAtStart).toBe(7);
    expect(full.finalActive).toBe(7);
    expect(full.firstRefusal).toBe("free-capital");
  });

  it("refuses every lease above the per-guarantee cap", () => {
    const capped = pilot({ maxCoverPerGuarantee: 30_000 });
    expect(capped.req.overGuaranteeCap).toBe(true);
    expect(capped.finalActive).toBe(0);
    expect(capped.firstRefusal).toBe("guarantee-cap");
  });

  it("paid claims reduce remaining cover, and coverage required follows it", () => {
    const rec = pilot();
    expect(rec.endRemaining).toBeLessThan(rec.finalActive * rec.req.cover);
    for (const row of rec.rows) {
      const want = Number(expectedRequired(BigInt(Math.round(row.remaining * BRL_UNITS)), rec.req.cBps, 0n)) / BRL_UNITS;
      expect(row.required).toBeCloseTo(want, 6);
    }
  });

  it("holds TESOURO to its cap and the take to 30%", () => {
    expect(pilot().tesouroShare).toBe(0);
    expect(pilot({ maxTesouroSharePct: 50 }).tesouroShare).toBe(0.5);
    expect(pilot({ takePct: 45 }).take).toBe(0.3);
  });

  it("max_tvl refuses capital above the cap", () => {
    const r = pilot({ monthlyRaise: 50_000 });
    expect(r.tvlRefused).toBeGreaterThan(0);
  });
});

describe("simulator BRS income (swept monthly)", () => {
  const run = (o: Params = {}) => sim.mutavCompute({ ...sim.MUTAV_DEFAULTS, months: 6, perMonth: 10, tesouroSharePct: 50, ...o });
  /** Every result except the new BRS fields, which are 0 at a 0% BRS yield. */
  const strip = (r: Result) => JSON.parse(JSON.stringify(r, (k, v) => (k === "brsIncome" || k === "brs" ? undefined : v)));

  it("defaults to a 0% BRS yield", () => {
    expect(sim.MUTAV_DEFAULTS.brsYieldPct).toBe(0);
  });

  it("a 0% BRS yield leaves every result unchanged", () => {
    const cases: Params[] = [{}, { maxTesouroSharePct: 50 }, { stressOn: true }, { withdraw: "share" }, { coverageRatio: 1 }, { monthlyRaise: 50_000 }];
    for (const o of cases) {
      const without: Params = { ...sim.MUTAV_DEFAULTS, months: 6, perMonth: 10, tesouroSharePct: 50, ...o };
      delete without.brsYieldPct;
      const a = run({ ...o, brsYieldPct: 0 });
      expect(strip(a)).toEqual(strip(sim.mutavCompute(without)));
      expect(a.rows.every((x) => x.brsIncome === 0)).toBe(true);
    }
  });

  it("with TESOURO at 0, month 1 books stable × y / 12 and counts it in net gain and stable assets", () => {
    const y = 8;
    const base = run({ maxTesouroSharePct: 0 });
    const withBrs = run({ maxTesouroSharePct: 0, brsYieldPct: y });
    const m1 = withBrs.rows[0];
    const b1 = base.rows[0];
    expect(m1.brsIncome).toBeCloseTo((m1.opening * y) / 100 / 12, 6);
    expect(m1.gain - b1.gain).toBeCloseTo(m1.brsIncome, 6);
    expect(withBrs.rows[0].balance - base.rows[0].balance).toBeCloseTo(m1.brsIncome, 6);
    expect(withBrs.endBalance).toBeGreaterThan(base.endBalance);
  });

  it("accrues only on the BRS share left by the effective TESOURO split", () => {
    const r = run({ maxTesouroSharePct: 50, brsYieldPct: 8 });
    const m1 = r.rows[0];
    expect(r.tesouroShare).toBe(0.5);
    expect(m1.brsIncome).toBeCloseTo((m1.opening * 0.5 * 0.08) / 12, 6);
  });
});

