import { afterEach, describe, expect, it, vi } from "vitest";
import * as multisig from "@sqds/multisig";
import { Connection, PublicKey, TransactionMessage } from "@solana/web3.js";
import { clearMemoCache, composeProposalAction, ProposalRefusedError, readCreateMemo } from "../server/squads";
import type { ServerEnv } from "../server/env";

const MS = PublicKey.unique();
const MEMBER = PublicKey.unique();
const STRANGER = PublicKey.unique();
const env = { cluster: "localnet", rpcUrl: "http://127.0.0.1:8899", squadsMultisig: MS.toBase58(), programId: PublicKey.unique().toBase58() } as unknown as ServerEnv;

function stubChain(status: string) {
  vi.spyOn(multisig.accounts.Multisig, "fromAccountAddress").mockResolvedValue({ members: [{ key: MEMBER }] } as never);
  vi.spyOn(Connection.prototype, "getAccountInfo").mockResolvedValue({ data: Buffer.alloc(0) } as never);
  vi.spyOn(multisig.accounts.Proposal, "fromAccountInfo").mockReturnValue([{ status: { __kind: status } }] as never);
  return vi.spyOn(Connection.prototype, "getSignaturesForAddress").mockResolvedValue([]);
}

afterEach(() => vi.restoreAllMocks());

describe("A3 execute is gated before any history read", () => {
  const config = {} as never;
  it("refuses a non-member", async () => {
    const sigs = stubChain("Approved");
    await expect(composeProposalAction(env, STRANGER.toBase58(), 3n, "execute", config)).rejects.toBeInstanceOf(ProposalRefusedError);
    expect(sigs).not.toHaveBeenCalled();
  });
  it("refuses a proposal that is not Approved", async () => {
    const sigs = stubChain("Active");
    await expect(composeProposalAction(env, MEMBER.toBase58(), 3n, "execute", config)).rejects.toThrow(/Active, not Approved/);
    expect(sigs).not.toHaveBeenCalled();
  });
});

describe("A3 create memo cache", () => {
  it("looks a found memo up once per transaction PDA", async () => {
    clearMemoCache();
    const index = 9n;
    const [txPda] = multisig.getTransactionPda({ multisigPda: MS, index });
    const create = multisig.instructions.vaultTransactionCreate({
      multisigPda: MS,
      transactionIndex: index,
      creator: MEMBER,
      rentPayer: MEMBER,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: new TransactionMessage({ payerKey: PublicKey.unique(), recentBlockhash: "11111111111111111111111111111111", instructions: [] }),
      memo: "mutav set_config|fee_take_bps=2000",
    });
    const message = new TransactionMessage({ payerKey: MEMBER, recentBlockhash: "11111111111111111111111111111111", instructions: [create] }).compileToV0Message();
    const sigs = vi.spyOn(Connection.prototype, "getSignaturesForAddress").mockResolvedValue([{ signature: "s1", err: null }] as never);
    const txs = vi.spyOn(Connection.prototype, "getTransaction").mockResolvedValue({ transaction: { message }, meta: { err: null, loadedAddresses: { writable: [], readonly: [] } } } as never);
    expect(await readCreateMemo(env, index, MEMBER.toBase58())).toBe("mutav set_config|fee_take_bps=2000");
    expect(await readCreateMemo(env, index, MEMBER.toBase58())).toBe("mutav set_config|fee_take_bps=2000");
    expect(sigs).toHaveBeenCalledTimes(1);
    expect(txs).toHaveBeenCalledTimes(1);
    expect(sigs.mock.calls[0]![0].toBase58()).toBe(txPda.toBase58());
  });
});
