import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adapterRows,
  incomeSummary,
  PLANNED_RESERVE_INSTRUCTIONS,
  ADAPTER_CANDIDATES,
  EXPANSION_STEPS,
  reserveComposition,
} from "../reserve-assets";
import { INSTRUCTION_ROLE } from "../roles";
import { BRL, config, state } from "./fixtures";

const REPO = join(__dirname, "../../..");
const ADAPTER = "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo";

function view({ brs, inbox = 0n }: { brs: bigint; inbox?: bigint }) {
  return {
    config: config() as never,
    state: state({ brsBalance: brs }),
    solvency: { stableAssets: brs } as never,
    incomeInbox: { address: ADAPTER, exists: true, amount: inbox },
  };
}

describe("reserve composition", () => {
  it("is 100% BRS in the pilot (ADR 0018, ADR 0019): no adapters and a 100% floor, with the reason", () => {
    const c = reserveComposition(view({ brs: 300_000n * BRL, inbox: 1_250n * BRL }));
    expect(c.stableAssets).toBe(300_000n * BRL);
    expect(c.brsShareBps).toBe(10_000n);
    expect(c.adapterShareBps).toBe(0n);
    expect(c.inbox).toBe(1_250n * BRL);
    expect(c.floorBps).toBe(10_000);
    expect(c.floorValue).toBe(300_000n * BRL);
    expect(c.roomAboveFloor).toBe(0n);
    expect(c.belowFloor).toBe(false);
    expect(c.adapters).toEqual([]);
    expect(c.brsOnly).toBe(true);
    expect(c.brsOnlyReason).toBe("The pilot reserve holds BRS only (ADR 0018); no adapter is whitelisted; the settlement floor is 100%.");
  });

  it("does not count the income inbox toward stable assets or the shares", () => {
    const a = reserveComposition(view({ brs: 100n * BRL }));
    const b = reserveComposition(view({ brs: 100n * BRL, inbox: 999n * BRL }));
    expect(b.stableAssets).toBe(a.stableAssets);
    expect(b.brsShareBps).toBe(a.brsShareBps);
  });

  it("has no shares while the reserve holds nothing", () => {
    const c = reserveComposition(view({ brs: 0n }));
    expect(c.brsShareBps).toBeNull();
    expect(c.adapterShareBps).toBeNull();
  });

  it("lists no adapters: the program keeps no inline adapter list (ADR 0019)", () => {
    expect(adapterRows()).toEqual([]);
  });
});

describe("issuer income summary", () => {
  it("lists swept statements newest first, with the VaultState totals", () => {
    const receipt = (slot: bigint, period: number) => ({
      address: `R${slot}`,
      blockTime: null,
      data: { refHash: new Uint8Array(32).fill(Number(slot)), period, gross: 10n * BRL, take: 0n, net: 10n * BRL, slot } as never,
    });
    const r = view({ brs: 100n * BRL, inbox: 3n * BRL });
    const s = incomeSummary({ ...r, state: state({ incomeTotal: 20n * BRL }) }, [receipt(5n, 202_609), receipt(9n, 202_610), receipt(7n, 202_609)], 2);
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
