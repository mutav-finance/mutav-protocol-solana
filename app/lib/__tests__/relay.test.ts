import { describe, expect, it } from "vitest";
import { AccountRole, address, getBase64EncodedWireTransaction, getTransactionDecoder, getBase64Encoder, type Instruction } from "@solana/kit";
import { MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { unsignedTransaction } from "../server/compose";
import { assertRelayable, boundedBody, COMPUTE_BUDGET_PROGRAM, MAX_RELAY_BODY_BYTES, RelayRefusedError } from "../server/relay";
import { notSeenText, requiredFeature, transportFor, walletSendError } from "../client/transport";

const PAYER = address("9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU");
const SQUADS = "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf";
const MULTISIG = address("HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo");
const OTHER_MULTISIG = address("BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4");
const lifetime = { blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", lastValidBlockHeight: 10n };
const policy = { mutav: MUTAV_PROGRAM_ADDRESS, squadsProgram: SQUADS, squadsMultisig: MULTISIG };

const ix = (program: string, first?: string): Instruction => ({
  programAddress: address(program),
  accounts: first ? [{ address: address(first), role: AccountRole.WRITABLE }] : [],
  data: new Uint8Array([1, 2, 3]),
});

/** The unsigned wire transaction with every signature slot filled with junk (the relay checks presence, the cluster checks validity). */
function signed(ixs: Instruction[]): string {
  const wire = unsignedTransaction(PAYER, ixs, lifetime);
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const sigs = Object.fromEntries(Object.keys(tx.signatures).map((k) => [k, new Uint8Array(64).fill(7)]));
  return getBase64EncodedWireTransaction({ ...tx, signatures: sigs } as never);
}

describe("relay rules (A1, localnet only)", () => {
  it("relays MUTAV instructions, with compute budget", () => {
    expect(() => assertRelayable(signed([ix(COMPUTE_BUDGET_PROGRAM), ix(MUTAV_PROGRAM_ADDRESS)]), policy)).not.toThrow();
  });
  it("relays Squads instructions only on the configured multisig", () => {
    expect(() => assertRelayable(signed([ix(SQUADS, MULTISIG)]), policy)).not.toThrow();
    expect(() => assertRelayable(signed([ix(SQUADS, OTHER_MULTISIG)]), policy)).toThrow(/only the configured multisig/);
    expect(() => assertRelayable(signed([ix(SQUADS, MULTISIG)]), { ...policy, squadsMultisig: null })).toThrow(RelayRefusedError);
  });
  it("refuses bare System or Token transfers and compute-budget-only transactions", () => {
    expect(() => assertRelayable(signed([ix("11111111111111111111111111111111")]), policy)).toThrow(/for program 1111/);
    expect(() => assertRelayable(signed([ix(MUTAV_PROGRAM_ADDRESS), ix("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")]), policy)).toThrow(/Tokenkeg/);
    expect(() => assertRelayable(signed([ix(COMPUTE_BUDGET_PROGRAM)]), policy)).toThrow(/no MUTAV or Squads/);
  });
  it("refuses an unsigned transaction", () => {
    expect(() => assertRelayable(unsignedTransaction(PAYER, [ix(MUTAV_PROGRAM_ADDRESS)], lifetime), policy)).toThrow(/not fully signed/);
  });
  it("refuses a body over the size limit, declared or actual", async () => {
    const big = "x".repeat(MAX_RELAY_BODY_BYTES + 1);
    await expect(boundedBody(new Request("http://x", { method: "POST", body: big }))).rejects.toThrow(/over 4096 bytes/);
    await expect(boundedBody(new Request("http://x", { method: "POST", body: "{}", headers: { "content-length": "99999" } }))).rejects.toThrow(/over/);
    await expect(boundedBody(new Request("http://x", { method: "POST", body: "{}" }))).resolves.toBe("{}");
  });
});

describe("transport", () => {
  it("devnet: the wallet signs and sends; localnet: sign, then the relay", () => {
    expect(transportFor("devnet")).toBe("wallet-send");
    expect(requiredFeature("devnet")).toBe("solana:signAndSendTransaction");
    expect(transportFor("localnet")).toBe("relay");
    expect(requiredFeature("localnet")).toBe("solana:signTransaction");
  });
  it("explains a wallet on another cluster", () => {
    expect(walletSendError("Transaction simulation failed: Blockhash not found", "devnet")).toMatch(/switch it to devnet/);
    expect(walletSendError("User rejected the request.", "devnet")).toBe("The wallet declined the request.");
    expect(walletSendError("other", "devnet")).toBe("other");
    expect(notSeenText("devnet", 30)).toMatch(/not seen on devnet after 30 s/);
  });
});
