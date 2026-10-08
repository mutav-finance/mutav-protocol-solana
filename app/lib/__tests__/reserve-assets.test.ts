import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adapterRows,
  incomeSummary,
  incomeTakeRequest,
  PLANNED_RESERVE_INSTRUCTIONS,
  priceRequest,
  ADAPTER_CANDIDATES,
  EXPANSION_STEPS,
  reserveComposition,
  reserveConfigError,
  tesouroCapRequest,
  UNSET_ADDRESS,
} from "../reserve-assets";
import { INSTRUCTION_ROLE } from "../roles";
import { BRL, config, state } from "./fixtures";

const REPO = join(__dirname, "../../..");
const ADAPTER = "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo";
const MINT = "BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4";

const empty = { programId: UNSET_ADDRESS, subAuthority: UNSET_ADDRESS, assetMint: UNSET_ADDRESS, cap: 0n, allocated: 0n, enabled: false, reserved: new Uint8Array(64) };
const slots = (...used: Partial<typeof empty>[]) => [...used.map((u) => ({ ...empty, ...u })), ...Array(8 - used.length).fill(empty)];

function view({ brs, tesouro = 0n, inbox = 0n, capBps = 0, adapters = slots() }: { brs: bigint; tesouro?: bigint; inbox?: bigint; capBps?: number; adapters?: unknown[] }) {
  const c = config();
  return {
    config: { ...c, caps: { ...c.caps, maxTesouroShareBps: capBps }, adapters } as never,
    state: state({ brsBalance: brs, tesouroUnits: tesouro } as never),
    solvency: { tesouroValue: tesouro } as never,
    incomeInbox: { address: ADAPTER, exists: true, amount: inbox },
  };
}

describe("reserve composition", () => {
  it("is 100% BRS in the pilot (ADR 0018), with the reason", () => {
    const c = reserveComposition(view({ brs: 300_000n * BRL, inbox: 1_250n * BRL }));
    expect(c.stableAssets).toBe(300_000n * BRL);
    expect(c.brsShareBps).toBe(10_000n);
    expect(c.tesouroShareBps).toBe(0n);
    expect(c.inbox).toBe(1_250n * BRL);
    expect(c.capValue).toBe(0n);
    expect(c.capUsedBps).toBeNull();
    expect(c.overCap).toBe(false);
    expect(c.adapters).toEqual([]);
    expect(c.brsOnly).toBe(true);
    expect(c.tesouroZeroReason).toBe("The pilot reserve holds BRS only (ADR 0018); no adapter is whitelisted; the TESOURO share cap is 0%.");
  });

  it("does not count the income inbox toward stable assets or the shares", () => {
    const a = reserveComposition(view({ brs: 100n * BRL }));
    const b = reserveComposition(view({ brs: 100n * BRL, inbox: 999n * BRL }));
    expect(b.stableAssets).toBe(a.stableAssets);
    expect(b.brsShareBps).toBe(a.brsShareBps);
  });

  it("measures TESOURO against the share cap", () => {
    const adapters = slots({ programId: ADAPTER, assetMint: MINT, cap: 200n * BRL, allocated: 100n * BRL, enabled: true });
    const c = reserveComposition(view({ brs: 300n * BRL, tesouro: 100n * BRL, capBps: 5_000, adapters }));
    expect(c.stableAssets).toBe(400n * BRL);
    expect(c.tesouroShareBps).toBe(2_500n);
    expect(c.brsShareBps).toBe(7_500n);
    expect(c.capValue).toBe(200n * BRL);
    expect(c.capRoom).toBe(100n * BRL);
    expect(c.capUsedBps).toBe(5_000n);
    expect(c.tesouroZeroReason).toBeNull();
    expect(c.brsOnly).toBe(false);
    expect(c.adapters).toEqual([{ slot: 0, programId: ADAPTER, assetMint: MINT, cap: 200n * BRL, allocated: 100n * BRL, enabled: true }]);
  });

  it("flags TESOURO above the cap (after a cap cut or a price move)", () => {
    const c = reserveComposition(view({ brs: 100n * BRL, tesouro: 100n * BRL, capBps: 2_000 }));
    expect(c.overCap).toBe(true);
    expect(c.capRoom).toBe(0n);
  });

  it("has no shares while the reserve holds nothing", () => {
    const c = reserveComposition(view({ brs: 0n }));
    expect(c.brsShareBps).toBeNull();
    expect(c.tesouroShareBps).toBeNull();
  });

  it("lists only used adapter slots", () => {
    expect(adapterRows(slots({ programId: ADAPTER }, { programId: UNSET_ADDRESS }) as never).map((a) => a.slot)).toEqual([0]);
  });
});

describe("set_config controls", () => {
  it("bounds the TESOURO share cap to 0–10000 bps", () => {
    expect(tesouroCapRequest("5000")).toEqual({ kind: "set_config", maxTesouroShareBps: 5_000 });
    expect(tesouroCapRequest("0")).toEqual({ kind: "set_config", maxTesouroShareBps: 0 });
    expect(tesouroCapRequest("10001")).toBeNull();
    expect(tesouroCapRequest("-1")).toBeNull();
    expect(tesouroCapRequest("50.5")).toBeNull();
    expect(tesouroCapRequest("")).toBeNull();
  });

  it("accepts only a zero income take while MAX_INCOME_TAKE_BPS is 0 (spec §12 Q47)", () => {
    expect(incomeTakeRequest("0")).toEqual({ kind: "set_config", incomeTakeBps: 0 });
    expect(incomeTakeRequest("1")).toBeNull();
    expect(incomeTakeRequest("500")).toBeNull();
    expect(reserveConfigError({ incomeTakeBps: 1 })).toMatch(/MAX_INCOME_TAKE_BPS/);
    expect(reserveConfigError({ incomeTakeBps: 0 })).toBeNull();
  });

  it("builds price parameters from the filled fields only, within the program's bounds", () => {
    expect(priceRequest({})).toEqual({ request: null, errors: [] });
    expect(priceRequest({ maxStalenessSecs: "3600", maxDeviationBps: "300" })).toEqual({ request: { kind: "set_config", price: { maxStalenessSecs: 3_600n, maxDeviationBps: 300 } }, errors: [] });
    expect(priceRequest({ tesouroPriceAccount: ADAPTER, t0: "-5", p0: "1000000000" }).request).toEqual({ kind: "set_config", price: { tesouroPriceAccount: ADAPTER, t0: -5n, p0: 1_000_000_000n } });
    const bad = priceRequest({ yMaxBps: "10001", maxStalenessSecs: "-1", tesouroPriceAccount: "nope", p0: "1" });
    expect(bad.request).toBeNull();
    expect(bad.errors.sort()).toEqual(["maxStalenessSecs", "tesouroPriceAccount", "yMaxBps"]);
    expect(reserveConfigError({ price: { maxNavMoveBps: 10_001 } })).toMatch(/0–10000/);
    expect(reserveConfigError({ maxTesouroShareBps: 10_001 })).toMatch(/max_tesouro_share_bps/);
  });
});

describe("issuer income summary", () => {
  it("lists swept statements newest first, with the VaultState totals", () => {
    const receipt = (slot: bigint, period: number) => ({
      address: `R${slot}`,
      blockTime: null,
      data: { incomeRefHash: new Uint8Array(32).fill(Number(slot)), period, gross: 10n * BRL, take: 0n, net: 10n * BRL, slot } as never,
    });
    const r = view({ brs: 100n * BRL, inbox: 3n * BRL });
    const s = incomeSummary({ ...r, state: state({ incomeTotal: 20n * BRL, incomeTakeTotal: 0n } as never), config: { ...(r.config as object), incomeTakeBps: 0 } as never }, [receipt(5n, 202_609), receipt(9n, 202_610), receipt(7n, 202_609)], 2);
    expect(s.last.map((x) => x.slot)).toEqual([9n, 7n]);
    expect(s.receipts).toBe(3);
    expect(s.inbox).toBe(3n * BRL);
    expect(s.sweptNet).toBe(20n * BRL);
    expect(s.takeBps).toBe(0);
  });
});

/** The backticked instructions in a row of the spec §2 role table. */
function specRole(role: string): string[] {
  const row = readFileSync(join(REPO, "docs/spec.md"), "utf8").split("\n").find((l) => l.startsWith(`| **${role}** |`));
  return [...row!.matchAll(/`(\w+)`/g)].map((x) => x[1]!);
}
const binary = () => [...readFileSync(join(REPO, "programs/mutav/src/lib.rs"), "utf8").matchAll(/pub fn (\w+)\s*\(\s*ctx: Context</g)].map((x) => x[1]!);

describe("planned reserve-allocation instructions", () => {
  it("are the spec's admin instructions that lib.rs does not have (besides pay_claim_admin)", () => {
    const missing = specRole("Admin").filter((ix) => !binary().includes(ix));
    expect(missing.sort()).toEqual([...PLANNED_RESERVE_INSTRUCTIONS.map((p) => p.ix), "pay_claim_admin"].sort());
  });

  it("are signed by the admin and none is offered as an action", () => {
    for (const p of PLANNED_RESERVE_INSTRUCTIONS) {
      expect(p.role).toBe("admin");
      expect(Object.keys(INSTRUCTION_ROLE)).not.toContain(p.ix);
    }
  });

  it("lists expansion steps whose live signers match the program and whose planned ones are in the spec", () => {
    const planned = PLANNED_RESERVE_INSTRUCTIONS.map((p) => p.ix);
    for (const st of EXPANSION_STEPS) {
      if (st.ix === null) expect(st.live).toBe(false);
      else if (st.live) expect([st.ix, INSTRUCTION_ROLE[st.ix as keyof typeof INSTRUCTION_ROLE]]).toEqual([st.ix, st.actor]);
      else expect(planned).toContain(st.ix);
    }
  });

  it("names TESOURO as the first candidate, with its blocker", () => {
    expect(ADAPTER_CANDIDATES.map((a) => a.asset)).toEqual(["TESOURO"]);
    expect(ADAPTER_CANDIDATES[0]!.blocker).toMatch(/BRS↔TESOURO/);
  });
});
