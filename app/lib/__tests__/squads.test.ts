import { describe, expect, it } from "vitest";
import * as multisig from "@sqds/multisig";
import { PublicKey } from "@solana/web3.js";
import { baselineCovers, baselineMemo, isLiveProposal, MAX_BASELINE_MEMO, parseBaselineMemo, staleCarry, staleCarryText } from "../config-diff";
import { decodeAccount, decodeTransactionAccount, scanIndices, SQUADS_PROGRAM } from "../server/squads";
import { EMPTY_VAULT_TRANSACTION, SQUADS_CONFIG_CHANGE, UNKNOWN_TRANSACTION_ACCOUNT } from "../proposal-decode";
import { config, BRL } from "./fixtures";

describe("A3 proposal scan", () => {
  it("scans every index back to the first, bounded", () => {
    expect(scanIndices(3n)).toEqual([3n, 2n, 1n]);
    expect(scanIndices(0n)).toEqual([]);
    const many = scanIndices(1000n, 256);
    expect(many.length).toBe(256);
    expect(many[0]).toBe(1000n);
    expect(many.at(-1)).toBe(745n);
  });
  it("treats Approved as live even when stale; Active only while fresh", () => {
    expect(isLiveProposal({ status: "Approved", stale: true })).toBe(true);
    expect(isLiveProposal({ status: "Executing" })).toBe(true);
    expect(isLiveProposal({ status: "Active", stale: false })).toBe(true);
    expect(isLiveProposal({ status: "Active", stale: true })).toBe(false);
    for (const s of ["Executed", "Rejected", "Cancelled", "None"]) expect(isLiveProposal({ status: s })).toBe(false);
  });
});

describe("A3 stale-carry check", () => {
  const c = config();
  it("records the baseline of each written field and reads it back", () => {
    const memo = baselineMemo(["caps.max_tvl", "fee_take_bps"], c)!;
    expect(memo).toBe(`mutav set_config|caps.max_tvl=${100_000n * BRL};fee_take_bps=2000`);
    expect(parseBaselineMemo(memo)).toEqual({ "caps.max_tvl": String(100_000n * BRL), fee_take_bps: "2000" });
    expect(parseBaselineMemo("mutav unpause")).toBeNull();
    expect(parseBaselineMemo(null)).toBeNull();
  });
  it("returns no baseline (the build refuses) rather than overflow the create transaction", () => {
    const fields = Array.from({ length: 40 }, () => "caps.max_claim_per_period");
    expect(baselineMemo(fields, c)).toBeNull();
    expect(baselineMemo(["fee_take_bps"], c)!.length).toBeLessThanOrEqual(MAX_BASELINE_MEMO);
  });
  it("accepts a baseline only when it names exactly the fields written", () => {
    const b = parseBaselineMemo(baselineMemo(["caps.max_tvl", "fee_take_bps"], c))!;
    expect(baselineCovers(b, ["caps.max_tvl", "fee_take_bps"])).toBe(true);
    expect(baselineCovers(b, ["caps.max_tvl"])).toBe(false);
    expect(baselineCovers(b, ["caps.max_tvl", "fee_take_bps", "coverage_ratio_bps"])).toBe(false);
    expect(baselineCovers(parseBaselineMemo("mutav set_config|")!, ["fee_take_bps"])).toBe(false);
  });
  it("flags a field that moved since the proposal was made", () => {
    const baseline = parseBaselineMemo(baselineMemo(["caps.max_tvl", "fee_take_bps"], c))!;
    expect(staleCarry(baseline, c)).toEqual([]);
    const moved = staleCarry(baseline, config({ feeTakeBps: 1_500 } as never));
    expect(moved).toEqual([{ field: "fee_take_bps", from: "2000", to: "1500" }]);
    expect(staleCarryText(7n, moved)).toMatch(/#7 .*fee_take_bps was 2000, is 1500 now.*reject or cancel #7/);
  });
});

describe("a proposal's transaction account is decoded by owner and discriminator", () => {
  const MS = PublicKey.unique();
  const CREATOR = PublicKey.unique();
  // K[0] = 0 and K[4..16] = 0: with ChangeThreshold(1) after it, the vault decoder reads these bytes as an empty message.
  const kBytes = new Uint8Array(32).fill(7);
  kBytes[0] = 0;
  kBytes.fill(0, 4, 16);
  const K = new PublicKey(kBytes);
  const configTx = multisig.generated.ConfigTransaction.fromArgs({
    multisig: MS,
    creator: CREATOR,
    index: 9,
    bump: 255,
    actions: [
      { __kind: "AddMember", newMember: { key: K, permissions: { mask: 7 } } },
      { __kind: "ChangeThreshold", newThreshold: 1 },
    ],
  }).serialize()[0];
  const vaultTx = (instructions: multisig.generated.MultisigCompiledInstruction[]) =>
    multisig.generated.VaultTransaction.fromArgs({
      multisig: MS,
      creator: CREATOR,
      index: 9,
      bump: 255,
      vaultIndex: 0,
      vaultBump: 254,
      ephemeralSignerBumps: new Uint8Array(),
      message: { numSigners: 1, numWritableSigners: 1, numWritableNonSigners: 0, accountKeys: [MS, CREATOR], instructions, addressTableLookups: [] },
    }).serialize()[0];
  const owned = (data: Buffer, owner = multisig.PROGRAM_ID) => ({ owner, data });

  it("the SDK's vault decoder alone misreads this config change as an empty vault transaction", () => {
    const [vt] = multisig.generated.VaultTransaction.deserialize(configTx);
    expect(vt.message.instructions).toHaveLength(0);
  });
  it("decodes it as a Squads config change, with its actions, flagged", () => {
    const acc = decodeTransactionAccount(owned(configTx));
    expect(acc).toEqual({ kind: "config", actions: [{ kind: "AddMember", key: K.toBase58(), permissions: 7 }, { kind: "ChangeThreshold", threshold: 1 }] });
    const [d] = decodeAccount(acc, { programId: SQUADS_PROGRAM });
    expect(d!.name).toBe(SQUADS_CONFIG_CHANGE);
    expect(d!.details.map((x) => x.label)).toEqual(["changes", "AddMember: key", "AddMember: permissions", "ChangeThreshold: threshold"]);
    expect(d!.details.every((x) => x.warn)).toBe(true);
  });
  it("decodes a vault transaction's instructions", () => {
    const acc = decodeTransactionAccount(owned(vaultTx([{ programIdIndex: 1, accountIndexes: new Uint8Array([0]), data: new Uint8Array([1, 2]) }])));
    expect(acc).toEqual({ kind: "vault", raw: [{ programId: CREATOR.toBase58(), accounts: [MS.toBase58()], data: new Uint8Array([1, 2]) }] });
  });
  it("flags a vault transaction with no instruction", () => {
    const acc = decodeTransactionAccount(owned(vaultTx([])));
    expect(acc).toEqual({ kind: "vault", raw: [] });
    const [d, ...rest] = decodeAccount(acc, { programId: SQUADS_PROGRAM });
    expect(rest).toEqual([]);
    expect(d!.name).toBe(EMPTY_VAULT_TRANSACTION);
    expect(d!.details.every((x) => x.warn)).toBe(true);
  });
  it("flags an account not owned by the Squads v4 program", () => {
    const other = PublicKey.unique();
    const acc = decodeTransactionAccount(owned(configTx, other));
    expect(acc).toMatchObject({ kind: "unknown", owner: other.toBase58() });
    const [d] = decodeAccount(acc, { programId: SQUADS_PROGRAM });
    expect(d).toMatchObject({ program: "foreign", programId: other.toBase58(), name: UNKNOWN_TRANSACTION_ACCOUNT });
    expect(d!.details[0]!.warn).toBe(true);
    expect(d!.details[0]!.value).toMatch(/not the Squads v4 program/);
  });
  it("flags any other discriminator, and data too short for one", () => {
    const proposal = Buffer.from(configTx);
    Buffer.from(multisig.generated.proposalDiscriminator).copy(proposal, 0);
    expect(decodeTransactionAccount(owned(proposal))).toMatchObject({ kind: "unknown", reason: expect.stringMatching(/neither a vault nor a config transaction/) });
    expect(decodeTransactionAccount(owned(Buffer.alloc(4)))).toMatchObject({ kind: "unknown" });
  });
  it("flags a known discriminator over data that does not decode", () => {
    expect(decodeTransactionAccount(owned(Buffer.from(configTx.subarray(0, 20))))).toMatchObject({ kind: "unknown", reason: expect.stringMatching(/could not be decoded/) });
  });
  it("no account: nothing to show", () => {
    expect(decodeAccount(null, { programId: SQUADS_PROGRAM })).toEqual([]);
  });
});
