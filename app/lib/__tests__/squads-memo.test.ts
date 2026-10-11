import { describe, expect, it } from "vitest";
import * as multisig from "@sqds/multisig";
import { PublicKey, TransactionInstruction, TransactionMessage } from "@solana/web3.js";
import { createMemoIn, findCreateMemo, signaturesOldestFirst, StaleCarryError, type CompiledTxLike, type CreateMatch } from "../server/squads";

// Unique public keys (no key pairs).
const key = () => PublicKey.unique();
const MS = key();
const OTHER_MS = key();
const CREATOR = key();
const ATTACKER = key();
const INDEX = 7n;
const [TX_PDA] = multisig.getTransactionPda({ multisigPda: MS, index: INDEX });
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const want: CreateMatch = { multisig: MS.toBase58(), transaction: TX_PDA.toBase58(), creator: CREATOR.toBase58() };

function create(opts: { ms?: PublicKey; index?: bigint; creator?: PublicKey; memo: string }): TransactionInstruction {
  const creator = opts.creator ?? CREATOR;
  return multisig.instructions.vaultTransactionCreate({
    multisigPda: opts.ms ?? MS,
    transactionIndex: opts.index ?? INDEX,
    creator,
    rentPayer: creator,
    vaultIndex: 0,
    ephemeralSigners: 0,
    transactionMessage: new TransactionMessage({ payerKey: key(), recentBlockhash: "11111111111111111111111111111111", instructions: [] }),
    memo: opts.memo,
  });
}

function compiled(payer: PublicKey, ixs: TransactionInstruction[]): CompiledTxLike {
  const msg = new TransactionMessage({ payerKey: payer, recentBlockhash: "11111111111111111111111111111111", instructions: ixs }).compileToV0Message();
  return {
    keys: msg.staticAccountKeys.map((k) => k.toBase58()),
    instructions: msg.compiledInstructions.map((ix) => ({ programIdIndex: ix.programIdIndex, accountKeyIndexes: ix.accountKeyIndexes, data: ix.data })),
  };
}

const GENUINE = "mutav set_config|fee_take_bps=2000";
const SPOOF = "mutav set_config|fee_take_bps=9999";

describe("A3 create memo: only the genuine vaultTransactionCreate counts", () => {
  it("reads the memo of the create for this multisig, transaction PDA and creator", () => {
    expect(createMemoIn(compiled(CREATOR, [create({ memo: GENUINE })]), want)).toEqual({ memo: GENUINE });
  });
  it("ignores a memo-program instruction that touches the transaction PDA", () => {
    const touch = new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: TX_PDA, isSigner: false, isWritable: false }], data: Buffer.from(SPOOF) });
    expect(createMemoIn(compiled(ATTACKER, [touch]), want)).toBeNull();
  });
  it("ignores a create for another multisig, another index, or another creator", () => {
    expect(createMemoIn(compiled(ATTACKER, [create({ ms: OTHER_MS, memo: SPOOF })]), want)).toBeNull();
    expect(createMemoIn(compiled(ATTACKER, [create({ index: INDEX + 1n, memo: SPOOF })]), want)).toBeNull();
    expect(createMemoIn(compiled(ATTACKER, [create({ creator: ATTACKER, memo: SPOOF })]), want)).toBeNull();
  });
  it("ignores other Squads instructions", () => {
    const prop = multisig.instructions.proposalCreate({ multisigPda: MS, transactionIndex: INDEX, creator: CREATOR, rentPayer: CREATOR });
    expect(createMemoIn(compiled(CREATOR, [prop]), want)).toBeNull();
  });
  it("skips pre-touches and takes the memo from the matching transaction", async () => {
    const txs: Record<string, CompiledTxLike | null> = {
      a: compiled(ATTACKER, [new TransactionInstruction({ programId: MEMO_PROGRAM, keys: [{ pubkey: TX_PDA, isSigner: false, isWritable: false }], data: Buffer.from(SPOOF) })]),
      b: compiled(ATTACKER, [create({ creator: ATTACKER, memo: SPOOF })]),
      c: null,
      d: compiled(CREATOR, [create({ memo: GENUINE })]),
      e: compiled(ATTACKER, [create({ memo: SPOOF })]),
    };
    expect(await findCreateMemo(["a", "b", "c", "d", "e"], async (s) => txs[s] ?? null, want)).toBe(GENUINE);
  });
  it("fails closed when nothing matches, or too many transactions come first", async () => {
    const junk = compiled(ATTACKER, [create({ creator: ATTACKER, memo: SPOOF })]);
    expect(await findCreateMemo(["a", "b"], async () => junk, want)).toBeNull();
    await expect(findCreateMemo(["a", "b", "c"], async () => junk, want, 2)).rejects.toBeInstanceOf(StaleCarryError);
  });
});

describe("A3 signature paging", () => {
  const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ signature: `s${from - i}`, err: (from - i) % 7 === 0 ? { x: 1 } : null }));
  it("pages back with `before` until exhausted, oldest first, skipping failures", async () => {
    // Newest first, 2,500 signatures: s2500 … s1.
    const seen: (string | undefined)[] = [];
    const page = async (before: string | undefined) => {
      seen.push(before);
      const top = before === undefined ? 2500 : Number(before.slice(1)) - 1;
      return rows(top, Math.min(1000, top));
    };
    const out = await signaturesOldestFirst(page);
    expect(seen).toEqual([undefined, "s1501", "s501"]);
    expect(out[0]).toBe("s1");
    expect(out.at(-1)).toBe("s2500");
    expect(out).not.toContain("s7");
    expect(out.length).toBe(2500 - Math.floor(2500 / 7));
  });
  it("fails closed past the page bound", async () => {
    await expect(signaturesOldestFirst(async () => rows(5000, 1000), 3)).rejects.toBeInstanceOf(StaleCarryError);
  });
});
