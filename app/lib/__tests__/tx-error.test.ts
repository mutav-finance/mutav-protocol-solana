import { describe, expect, it } from "vitest";
import { ALREADY_RECORDED, decodeProgramError, errorText, refusalLine } from "../tx-error";

const R = (reais: number) => BigInt(reais) * 1_000_000n;

describe("decodeProgramError", () => {
  it("reads the name from Anchor's log line", () => {
    const logs = ["Program log: AnchorError occurred. Error Code: InsufficientFreeCapital. Error Number: 6008. Error Message: Insufficient free capital."];
    expect(decodeProgramError("Transaction simulation failed", logs)).toBe("InsufficientFreeCapital");
  });
  it("decodes the encoded forms wallets and the status read return", () => {
    expect(decodeProgramError("Error processing Instruction 0: custom program error: 0x1778", null)).toBe("InsufficientFreeCapital");
    expect(decodeProgramError('transaction failed: {"InstructionError":[0,{"Custom":6017}]}', null)).toBe("ClaimCallCapExceeded");
    expect(decodeProgramError("InstructionError(0, Custom(6007))", null)).toBe("UnderCovered");
  });
  it("recognises a reference recorded twice", () => {
    expect(decodeProgramError("failed", ["Allocate: account Address { … } already in use"])).toBe(ALREADY_RECORDED);
  });
  it("returns null for failures that are not program errors", () => {
    expect(decodeProgramError("The wallet declined the request.", null)).toBeNull();
    expect(decodeProgramError('{"Custom":1}', null)).toBeNull();
  });
});

describe("refusalLine", () => {
  const gate = { needed: R(45_000), stableAssets: R(44_000), newCover: R(18_000), maxCover: R(120_000) };
  it("explains the coverage gate with the preview numbers", () => {
    expect(refusalLine("InsufficientFreeCapital", { gate })).toBe("Refused by the coverage gate: needs R$\u00a045,000.00 of required coverage; the reserve holds R$\u00a044,000.00.");
    expect(refusalLine("GuaranteeCapExceeded", { gate: { ...gate, newCover: R(130_000) } })).toBe("Refused by the per-guarantee cap: R$\u00a0130,000.00 of cover is above the R$\u00a0120,000.00 cap.");
  });
  it("explains the claim caps", () => {
    const claim = { amount: R(16_000), perCall: R(15_000), remaining: R(20_000) };
    expect(refusalLine("ClaimCallCapExceeded", { claim })).toBe("Refused by the claim caps: R$\u00a016,000.00 is above the per-call cap of R$\u00a015,000.00.");
    expect(refusalLine("ClaimPeriodCapExceeded", { claim: { ...claim, remaining: R(1_000) } })).toBe("Refused by the claim caps: R$\u00a016,000.00 is above the R$\u00a01,000.00 left in the last 31 days.");
  });
  it("falls back to a generic line without numbers", () => {
    expect(refusalLine("InsufficientFreeCapital")).toBe("Refused by the program: not enough free capital for this cover.");
    expect(refusalLine("UnderCovered")).toMatch(/^Refused by the coverage gate: the reserve is under-covered/);
    expect(refusalLine("SomethingNew")).toBe("Refused by the program: SomethingNew.");
  });
});

describe("wallet and simulation error shapes", () => {
  const decode = (e: unknown) => decodeProgramError(errorText(e), null);
  it("reads the hex form from a plain Error message", () => {
    expect(decode(new Error("Transaction simulation failed: Error processing Instruction 1: custom program error: 0x1778"))).toBe("InsufficientFreeCapital");
  });
  it("reads the InstructionError JSON shape", () => {
    expect(decode({ InstructionError: [1, { Custom: 6008 }] })).toBe("InsufficientFreeCapital");
    expect(decode('{"InstructionError":[2,{"Custom":6008}]}')).toBe("InsufficientFreeCapital");
  });
  it("digs into Phantom / Wallet Standard error objects", () => {
    expect(decode({ code: -32603, message: "Unexpected error", cause: new Error("custom program error: 0x1778") })).toBe("InsufficientFreeCapital");
    expect(decode({ message: "Unexpected error", error: { InstructionError: [0, { Custom: 6008 }] } })).toBe("InsufficientFreeCapital");
    expect(decode({ message: "Unexpected error", data: { err: { InstructionError: [0, { Custom: 6008 }] } } })).toBe("InsufficientFreeCapital");
    expect(decode({ message: "Unexpected error", logs: ["Program log: AnchorError occurred. Error Code: InsufficientFreeCapital. Error Number: 6008."] })).toBe("InsufficientFreeCapital");
    expect(decode({ message: "Unexpected error", data: { logs: ["Program X failed: custom program error: 0x1778"] } })).toBe("InsufficientFreeCapital");
  });
  it("names every MUTAV custom code, not only the console's", () => {
    expect(decode(new Error("custom program error: 0x1785"))).toBe("NotAllowlisted");
    expect(decode({ InstructionError: [0, { Custom: 6046 }] })).toBe("ClaimRevisionMismatch");
    expect(decode({ InstructionError: [0, { Custom: 6026 }] })).toBe("PostCpiCheckFailed");
  });
  it("leaves a bare 'Unexpected error' undecoded and survives cycles", () => {
    const e: Record<string, unknown> = { message: "Unexpected error" };
    e.cause = e;
    expect(decode(e)).toBeNull();
    expect(errorText(e)).toContain("Unexpected error");
  });
});
