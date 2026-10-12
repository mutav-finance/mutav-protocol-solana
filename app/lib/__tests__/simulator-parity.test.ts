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
import { computeCoverage, coverageRequired } from "@mutav-finance/mutav-protocol-solana";

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
  cumWithdrawals: number;
  capitalRaised: number;
  claimCapMonths: number;
  take: number;
  req: { cBps: number; cover: number; perLease: number; overGuaranteeCap: boolean };
  rows: Row[];
};
type Params = Record<string, number | string | boolean>;
type Sim = {
  mutavCoverageRequired: (remaining: number, bps: number, provisions: number, stressBuffer?: number) => number;
  mutavFreeCapital: (stable: number, remaining: number, bps: number, provisions: number, stressBuffer?: number) => number;
  mutavGateAdmits: (stable: number, remaining: number, newCover: number, bps: number, provisions: number, stressBuffer?: number) => boolean;
  mutavGateCount: (stable: number, remaining: number, cover: number, bps: number, provisions: number, max: number, stressBuffer?: number) => number;
  mutavCoverageBps: (c: number) => number;
  mutavLeasesBacked: (stableBrl: number, coverBrl: number, bps: number) => number;
  mutavIssuerRate: (p: Params, tvl: number) => { rate: number; tier: number; flat: boolean; pctOfCdi: number };
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
 * Expected `coverage_required` (ADR 0016, ADR 0022), straight from the client:
 * `max(ceil(c × remaining / 10_000), provisions + min(stress_buffer, remaining − provisions))`.
 */
const expectedRequired = (remaining: bigint, bps: number, provisions: bigint, stress = 0n) =>
  coverageRequired(remaining, bps, provisions, stress);

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
/** A stress buffer: off, the devnet R$19k, or any amount. */
const stressOf = () => (R() < 0.3 ? 0 : R() < 0.5 ? 19_000 * 1_000_000 : amount());

describe("simulator ↔ client coverage maths", () => {
  it("coverage required matches the client's formula, stress buffer included, on random vectors", () => {
    for (let i = 0; i < 2_000; i++) {
      const remaining = amount(), c = bps(), stress = stressOf();
      const provisions = R() < 0.5 ? 0 : R() < 0.5 ? amount() : Math.ceil((remaining * c) / 10_000);
      const want = expectedRequired(BigInt(remaining), c, BigInt(provisions), BigInt(stress));
      expect(BigInt(sim.mutavCoverageRequired(remaining, c, provisions, stress)), `rem=${remaining} c=${c} prov=${provisions} sb=${stress}`).toBe(want);
    }
  });

  it("the stress buffer binds on a small book and never exceeds the unprovisioned cover (ADR 0022)", () => {
    const u = 1_000_000;
    expect(sim.mutavCoverageRequired(100_000 * u, 1_000, 4_000 * u, 19_000 * u)).toBe(23_000 * u);
    expect(sim.mutavCoverageRequired(10_000 * u, 1_000, 4_000 * u, 19_000 * u)).toBe(10_000 * u);
    expect(sim.mutavCoverageRequired(1_000_000 * u, 1_000, 4_000 * u, 19_000 * u)).toBe(100_000 * u);
  });

  it("rounds up like the program at the edges", () => {
    expect(sim.mutavCoverageRequired(11, 12_000, 0)).toBe(14);
    expect(sim.mutavCoverageRequired(1, 1_000, 0)).toBe(1);
    expect(sim.mutavCoverageRequired(0, 1_000, 0)).toBe(0);
    expect(sim.mutavCoverageRequired(0, 1_000, 7)).toBe(7);
    expect(sim.mutavCoverageRequired(100, 1_000, 5)).toBe(10);
    expect(sim.mutavCoverageRequired(100, 1_000, 11)).toBe(11);
  });

  it("free capital matches the client's computeCoverage (no provisions, no TESOURO, no earmark)", () => {
    for (let i = 0; i < 1_000; i++) {
      const remaining = amount(), c = bps(), stable = amount(), stress = stressOf();
      const sol = computeCoverage({
        brsBalance: BigInt(stable), remainingCoverTotal: BigInt(remaining), coverageRatioBps: c, provisions: 0n,
        stressBuffer: BigInt(stress),
      });
      expect(BigInt(sim.mutavFreeCapital(stable, remaining, c, 0, stress))).toBe(sol.freeCapital);
    }
  });

  it("the register_guarantee gate (rule 5) matches the expected formula, provisions included", () => {
    for (let i = 0; i < 2_000; i++) {
      const remaining = amount(), newCover = amount(), c = bps(), stress = stressOf();
      const provisions = R() < 0.6 ? 0 : amount();
      // Put stable assets near the boundary half the time, so both outcomes are exercised.
      const required = expectedRequired(BigInt(remaining + newCover), c, BigInt(provisions), BigInt(stress));
      const boundary = Number(required);
      const stable = R() < 0.5 ? Math.max(0, boundary + int(3) - 1) : amount();
      const want = required <= BigInt(stable);
      expect(sim.mutavGateAdmits(stable, remaining, newCover, c, provisions, stress), `stable=${stable} rem=${remaining} new=${newCover} c=${c} prov=${provisions} sb=${stress}`).toBe(want);
    }
  });

  it("counts identical registrations exactly as repeated gate calls", () => {
    for (let i = 0; i < 300; i++) {
      const c = bps(), cover = 1 + int(50_000_000_000), remaining = int(10) * cover, stable = int(400_000_000_000), max = int(120);
      const stress = R() < 0.5 ? 0 : int(60_000_000_000);
      let k = 0;
      while (k < max && expectedRequired(BigInt(remaining + (k + 1) * cover), c, 0n, BigInt(stress)) <= BigInt(stable)) k++;
      expect(sim.mutavGateCount(stable, remaining, cover, c, 0, max, stress)).toBe(k);
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
  // Read from the devnet config the deploy uses, so the simulator can't drift from it.
  const BRL = 1_000_000;
  const cfg = JSON.parse(readFileSync(fileURLToPath(new URL("../../../scripts/devnet/devnet.example.json", import.meta.url)), "utf8"));
  const devnet = {
    coverageRatioBps: Number(cfg.coverageRatioBps),
    caps: {
      maxTvl: Number(cfg.caps.maxTvl),
      maxCoverPerGuarantee: Number(cfg.caps.maxCoverPerGuarantee),
      maxClaimPerCall: Number(cfg.caps.maxClaimPerCall),
      maxClaimPerPeriod: Number(cfg.caps.maxClaimPerPeriod),
      stressBuffer: Number(cfg.caps.stressBuffer),
    },
    feeTakeBpsMax: 3_000,
  };
  const d = sim.MUTAV_DEFAULTS;

  it("pins c and every cap the simulator enforces", () => {
    expect(sim.mutavCoverageBps(d.coverageRatio as number)).toBe(devnet.coverageRatioBps);
    expect((d.maxTvl as number) * BRL).toBe(devnet.caps.maxTvl);
    expect((d.maxCoverPerGuarantee as number) * BRL).toBe(devnet.caps.maxCoverPerGuarantee);
    expect((d.maxClaimPerCall as number) * BRL).toBe(devnet.caps.maxClaimPerCall);
    expect((d.maxClaimPerPeriod as number) * BRL).toBe(devnet.caps.maxClaimPerPeriod);
    expect((d.stressBuffer as number) * BRL).toBe(devnet.caps.stressBuffer);
    // TODO(PR 3): the simulator still models a per-agency cap and a settlement floor; the program has
    // neither since ADR 0019 (the pilot holds BRS only, so the floor is 100%).
    expect(Math.round((100 - (d.maxTesouroSharePct as number)) * 100)).toBe(10_000);
    expect(sim.MUTAV_PROTOCOL.MAX_FEE_TAKE_BPS).toBe(devnet.feeTakeBpsMax);
    expect((d.takePct as number) * 100).toBeLessThanOrEqual(devnet.feeTakeBpsMax);
  });
});

describe("simulator Default (02 inputs on the devnet config)", () => {
  it("backs 30 leases on R$300k at c = 0.25 and stalls at 33 on insufficient free capital", () => {
    const r = sim.mutavCompute({ ...sim.MUTAV_DEFAULTS });
    expect(r.capacityAtStart).toBe(30);
    expect(r.finalActive).toBe(33);
    expect(r.firstRefusal).toBe("free-capital");
  });

  it("max_tvl (R$1M) backs about 101 working-product leases at c = 0.25", () => {
    const d = sim.MUTAV_DEFAULTS;
    expect(sim.mutavLeasesBacked(d.maxTvl as number, 39_600, sim.mutavCoverageBps(d.coverageRatio as number))).toBe(101);
  });
});

describe("simulator on the pilot", () => {
  // The "Pilot · recommended" preset as the page defines it (ADR 0028), so the test follows the page.
  const html = readFileSync(fileURLToPath(new URL("../../public/simulator.html", import.meta.url)), "utf8");
  const preset = html.match(/var PILOT = (\{[\s\S]*?\});/);
  if (!preset) throw new Error("simulator.html has no PILOT preset");
  const PILOT = runInNewContext(`(${preset[1]})`) as Params;
  const pilot = (o: Params = {}) => sim.mutavCompute({ ...sim.MUTAV_DEFAULTS, ...PILOT, ...o });

  it("the pilot preset holds the founders' parameters (ADR 0028, the path to R$1M)", () => {
    expect(PILOT).toMatchObject({
      perMonth: 17, months: 6, growthTarget: 102, feePct: 12, rent: 2200, defaultCover: 12, exitCover: 6,
      coverageRatio: 0.25, startCapital: 120_000, monthlyRaise: 170_000, raiseFrom: 2,
      maxTvl: 1_000_000, maxCoverPerGuarantee: 120_000, maxClaimPerCall: 15_000, maxClaimPerPeriod: 20_000,
      maxTesouroSharePct: 0, withdraw: "buffer",
    });
  });

  it("reaches the R$1M cap in month 6 on the path (97 leases) and runs the conservative 30-lease variant", () => {
    const rec = pilot();
    expect(rec.capacityAtStart).toBe(12);
    expect(rec.rows[0].active).toBe(12); // month 1 is capital-bound: the start backs 12 of the 17
    expect(rec.rows[4].balance).toBeLessThan(1_000_000);
    expect(rec.rows[5].balance).toBeGreaterThanOrEqual(1_000_000);
    expect(rec.finalActive).toBe(97);
    expect(rec.tvlRefused).toBeGreaterThan(0); // the last raise is refused at max_tvl
    expect(rec.cumWithdrawals).toBe(0);
    expect(rec.claimCapMonths).toBe(0);
    const cons = pilot({ coverageRatio: 0.5, perMonth: 5, growthTarget: 30, monthlyRaise: 100_000 });
    expect(cons.capacityAtStart).toBe(6);
    expect(cons.finalActive).toBe(30);
    expect(cons.blockedMonths).toBe(0);
  });

  it("drops to 3 leases at full backing (c = 1.0); the raises take it to 25", () => {
    const full = pilot({ coverageRatio: 1 });
    expect(full.capacityAtStart).toBe(3);
    expect(full.finalActive).toBe(25);
    expect(full.firstRefusal).toBe("free-capital");
  });

  it("stalls at 101 leases at 28 a month (Scale to 170)", () => {
    const r = pilot({ perMonth: 28 });
    expect(r.finalActive).toBe(101);
    expect(r.firstRefusal).toBe("free-capital");
    expect(sim.mutavCoverageRequired(170 * 39_600 * BRL_UNITS, 2_500, 0) / BRL_UNITS).toBe(1_683_000);
  });

  it("the earlier plan (10 a month, R$100k a month) admits all 60 leases on R$620k", () => {
    const r = pilot({ perMonth: 10, growthTarget: 60, monthlyRaise: 100_000 });
    expect(r.finalActive).toBe(60);
    expect(r.capitalRaised).toBe(620_000);
    expect(r.blockedMonths).toBe(0);
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
      const want =
        Number(expectedRequired(BigInt(Math.round(row.remaining * BRL_UNITS)), rec.req.cBps, 0n, BigInt((PILOT.stressBuffer as number) * BRL_UNITS))) / BRL_UNITS;
      expect(row.required).toBeCloseTo(want, 6);
    }
  });

  it("holds TESOURO to its cap and the take to 30%", () => {
    expect(pilot().tesouroShare).toBe(0);
    expect(pilot({ tesouroSharePct: 50 }).tesouroShare).toBe(0);
    expect(pilot({ tesouroSharePct: 50, maxTesouroSharePct: 50 }).tesouroShare).toBe(0.5);
    expect(pilot({ takePct: 45 }).take).toBe(0.3);
  });

  it("max_tvl refuses capital above the cap", () => {
    const r = pilot({ withdraw: "none", maxTvl: 500_000 });
    expect(r.tvlRefused).toBeGreaterThan(0);
  });
});

describe("simulator BRS income (swept monthly)", () => {
  // BRS yield set to 0 explicitly, so each test adds only the income it measures
  const run = (o: Params = {}) => sim.mutavCompute({ ...sim.MUTAV_DEFAULTS, months: 6, perMonth: 10, tesouroSharePct: 50, brsYieldPct: 0, ...o });
  /** Every result except the issuer income fields, which differ only in how a zero rate is reached. */
  const strip = (r: Result) => JSON.parse(JSON.stringify(r, (k, v) => (["brsIncome", "brs", "issuerRate", "issuerTier", "issuer"].includes(k) ? undefined : v)));

  it("defaults to a BRS-only pilot: issuer income one tier at 70% of CDI (CDI = Selic − 0,10 pp), no TESOURO", () => {
    const d = sim.MUTAV_DEFAULTS;
    expect(d.brsYieldPct).toBeNull();
    expect((d.selicPct as number) - (d.issuerCdiPct as number)).toBeCloseTo(0.1, 9);
    expect([d.tier1Min, d.tier1Pct, d.tier2Pct, d.tier3Pct, d.tier4Pct]).toEqual([0, 70, 0, 0, 0]);
    expect(sim.mutavIssuerRate(d, 100_000).rate).toBeCloseTo(0.7 * 0.1365, 12);
    expect(sim.MUTAV_DEFAULTS.tesouroSharePct).toBe(0);
    expect(sim.MUTAV_DEFAULTS.maxTesouroSharePct).toBe(0);
  });

  it("a 0% BRS yield leaves every result unchanged", () => {
    const cases: Params[] = [{}, { maxTesouroSharePct: 50 }, { stressOn: true }, { withdraw: "share" }, { coverageRatio: 1 }, { monthlyRaise: 50_000 }];
    for (const o of cases) {
      // no flat override and every tier at 0% of CDI: the tiered model must book nothing either
      const without: Params = { ...sim.MUTAV_DEFAULTS, months: 6, perMonth: 10, tesouroSharePct: 50, ...o, tier1Pct: 0 };
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


describe("simulator input parser (pt-BR)", () => {
  const html = readFileSync(fileURLToPath(new URL("../../public/simulator.html", import.meta.url)), "utf8");
  const src = html.match(/var inF = [\s\S]*?function parseIn[\s\S]*?\n {2}}\n/)?.[0];
  const ctx: { inF?: unknown; fmtIn?: (v: number) => string; parseIn?: (s: string) => number } = {};
  runInNewContext(`${src}\nthis.fmtIn = fmtIn; this.parseIn = parseIn;`, ctx);
  const { fmtIn, parseIn } = ctx as Required<typeof ctx>;

  it("parses its own formatted output back to the same value", () => {
    for (const v of [1.125, 2.005, 1234.5, 0.077, 0.1, 12.75, 1000, 40_000, 300_000, 10_000_000]) {
      expect(parseIn(fmtIn(v))).toBe(v);
    }
  });

  it("accepts what people paste", () => {
    expect(parseIn("300.000")).toBe(300_000);
    expect(parseIn("300000")).toBe(300_000);
    expect(parseIn("R$ 300.000,50")).toBe(300_000.5);
    expect(parseIn("0.1")).toBe(0.1);
    expect(parseIn("1,125")).toBe(1.125); // a lone comma is the decimal mark
    expect(Number.isNaN(parseIn("abc"))).toBe(true);
  });
});

describe("simulator issuer income (CDI-linked tiers on the whole balance)", () => {
  const base: Params = { ...sim.MUTAV_DEFAULTS, issuerCdiPct: 10, tier1Min: 0, tier1Pct: 50, tier2Min: 1_000_000, tier2Pct: 80, tier3Min: 2_000_000, tier3Pct: 90, tier4Min: 0, tier4Pct: 0 };
  const rate = (tvl: number, o: Params = {}) => sim.mutavIssuerRate({ ...base, ...o }, tvl);

  it("picks the highest tier whose threshold the TVL is strictly above", () => {
    expect(rate(0)).toMatchObject({ rate: 0, tier: 0 });
    expect(rate(1).tier).toBe(1);
    expect(rate(1_000_000).tier).toBe(1); // strictly above
    expect(rate(1_000_000.01).tier).toBe(2);
    expect(rate(3_000_000).tier).toBe(3);
    expect(rate(3_000_000).rate).toBeCloseTo(0.09, 12); // 90% × 10%
  });

  it("applies the tier rate to the whole balance each month", () => {
    const r = sim.mutavCompute({ ...base, months: 1, perMonth: 0, startCapital: 1_500_000, maxTvl: 2_000_000, monthlyRaise: 0 });
    expect(r.rows[0].brsIncome).toBeCloseTo((1_500_000 * 0.08) / 12, 6);
  });

  it("an older link's flat brsYieldPct overrides the tiers", () => {
    expect(rate(3_000_000, { brsYieldPct: 9.5 })).toMatchObject({ rate: 0.095, flat: true });
  });
});
