import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { buildAllowlist } from "@mutav-finance/mutav-protocol-solana";
import { checkAllowlist } from "../allowlist";

const A = "9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU";
const B = "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo";
const C = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";

describe("allowlist status", () => {
  it("allowlists a listed wallet whose proof verifies against the on-chain root", async () => {
    const { root } = await buildAllowlist([address(A), address(B)]);
    const check = await checkAllowlist(root, [A, B], A);
    expect(check.state).toBe("allowlisted");
    expect(check.proof).not.toBeNull();
  });

  it("is read-only for a wallet that is not on the list", async () => {
    const { root } = await buildAllowlist([address(A), address(B)]);
    expect(await checkAllowlist(root, [A, B], C)).toEqual({ state: "not-listed", proof: null });
  });

  it("refuses when the on-chain root is zero (nobody allowlisted)", async () => {
    expect((await checkAllowlist(new Uint8Array(32), [A], A)).state).toBe("root-unset");
  });

  it("refuses when the server's list does not hash to the on-chain root", async () => {
    const { root } = await buildAllowlist([address(A), address(B)]);
    expect((await checkAllowlist(root, [A], A)).state).toBe("list-mismatch");
    expect((await checkAllowlist(root, [], A)).state).toBe("list-mismatch");
  });
});
