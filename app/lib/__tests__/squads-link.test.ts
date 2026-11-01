import { describe, expect, it } from "vitest";
import { squadsApproval, SQUADS_PUBLIC_CLIENT_URL, VERIFY_BEFORE_APPROVING } from "../squads-link";

const MS = "Vote111111111111111111111111111111111111111";

describe("Squads approval link (NEW-R3-1)", () => {
  it("on devnet, links to the Squads v4 client and names the multisig, the index and the devnet RPC", () => {
    const l = squadsApproval("devnet", MS, 7n)!;
    expect(l.href).toBe(SQUADS_PUBLIC_CLIENT_URL);
    expect(l.href).toBe("https://github.com/Squads-Protocol/public-v4-client");
    expect(l.label).toBe("Squads v4 client (open source)");
    expect(l.steps).toContain(MS);
    expect(l.steps).toContain("#7");
    expect(l.steps).toMatch(/devnet RPC/);
    expect(l.steps).toMatch(/no deep link/);
    expect(l.steps).toMatch(/build or open the Squads v4 client/);
  });
  it("on localnet there is none: the Squads app cannot reach a local validator", () => {
    expect(squadsApproval("localnet", MS, 1n)).toBeNull();
  });
  it("the verification note names the local step and says the view is not proof", () => {
    expect(VERIFY_BEFORE_APPROVING).toMatch(/local verification step/);
    expect(VERIFY_BEFORE_APPROVING).toMatch(/not proof/);
  });
});
