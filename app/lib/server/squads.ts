/**
 * Squads v4 admin proposals, server-side (the SDK depends on web3.js v1, which
 * stays out of the browser bundle). Reads the multisig and its recent
 * proposals, and composes UNSIGNED transactions for a member's wallet to sign:
 * create (vault transaction + proposal + the creator's approval), approve,
 * execute. The vault signs the inner MUTAV instruction only when the proposal
 * executes, after the Squads time lock.
 */
import * as multisig from "@sqds/multisig";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { AccountRole, type Address, type Instruction } from "@solana/kit";
import { identifyMutavInstruction, MutavInstruction, MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import type { ServerEnv } from "./env";

export type ProposalStatus = "None" | "Draft" | "Active" | "Rejected" | "Approved" | "Executing" | "Executed" | "Cancelled";

export type ProposalView = {
  index: bigint;
  transaction: string;
  proposal: string;
  status: ProposalStatus;
  /** Unix seconds of the last status change, when Squads records one. */
  statusAt: bigint | null;
  approvals: string[];
  rejections: string[];
  /** Approved and time lock elapsed at `now`. */
  executable: boolean;
  /** When the time lock ends (Approved only). */
  executableAt: bigint | null;
  /** MUTAV instructions inside the vault transaction, by name. */
  instructions: string[];
};

export type MultisigView = {
  address: string;
  vault: string;
  threshold: number;
  timeLock: number;
  members: { key: string; permissions: number }[];
  transactionIndex: bigint;
  staleTransactionIndex: bigint;
  proposals: ProposalView[];
};

const conn = (env: ServerEnv) => new Connection(env.rpcUrl, "confirmed");
const pk = (a: string) => new PublicKey(a);

export function vaultAddress(multisigAddress: string, vaultIndex = 0): string {
  const [vault] = multisig.getVaultPda({ multisigPda: pk(multisigAddress), index: vaultIndex });
  return vault.toBase58();
}

const MUTAV_NAMES = Object.fromEntries(
  Object.entries(MutavInstruction).filter(([, v]) => typeof v === "number").map(([k, v]) => [v as number, k]),
) as Record<number, string>;

function instructionNames(tx: multisig.generated.VaultTransaction, programId: string): string[] {
  const keys = tx.message.accountKeys.map((k) => k.toBase58());
  return tx.message.instructions.map((ix) => {
    const prog = keys[ix.programIdIndex];
    if (prog !== programId) return `${prog?.slice(0, 4) ?? "?"}… instruction`;
    try {
      return MUTAV_NAMES[identifyMutavInstruction(new Uint8Array(ix.data)) as number] ?? "unknown";
    } catch {
      return "unknown";
    }
  });
}

const statusAt = (s: multisig.generated.ProposalStatus): bigint | null =>
  "timestamp" in s && s.timestamp !== undefined ? BigInt(s.timestamp.toString()) : null;

export async function readMultisig(env: ServerEnv, now: bigint, depth = 10): Promise<MultisigView> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  const c = conn(env);
  const msPda = pk(env.squadsMultisig);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(c, msPda);
  const txIndex = BigInt(ms.transactionIndex.toString());
  const from = txIndex > BigInt(depth) ? txIndex - BigInt(depth) + 1n : 1n;
  const proposals: ProposalView[] = [];
  for (let i = txIndex; i >= from; i--) {
    const [txPda] = multisig.getTransactionPda({ multisigPda: msPda, index: i });
    const [propPda] = multisig.getProposalPda({ multisigPda: msPda, transactionIndex: i });
    const [txInfo, propInfo] = await c.getMultipleAccountsInfo([txPda, propPda]);
    let names: string[] = [];
    if (txInfo) {
      try {
        const [vt] = multisig.accounts.VaultTransaction.fromAccountInfo(txInfo);
        names = instructionNames(vt, env.programId);
      } catch {
        names = ["(not a vault transaction)"];
      }
    }
    let view: Omit<ProposalView, "instructions" | "index" | "transaction" | "proposal"> = {
      status: "None",
      statusAt: null,
      approvals: [],
      rejections: [],
      executable: false,
      executableAt: null,
    };
    if (propInfo) {
      const [p] = multisig.accounts.Proposal.fromAccountInfo(propInfo);
      const at = statusAt(p.status);
      const executableAt = p.status.__kind === "Approved" && at !== null ? at + BigInt(ms.timeLock) : null;
      view = {
        status: p.status.__kind as ProposalStatus,
        statusAt: at,
        approvals: p.approved.map((k) => k.toBase58()),
        rejections: p.rejected.map((k) => k.toBase58()),
        executable: executableAt !== null && now >= executableAt,
        executableAt,
      };
    }
    proposals.push({ index: i, transaction: txPda.toBase58(), proposal: propPda.toBase58(), instructions: names, ...view });
  }
  return {
    address: env.squadsMultisig,
    vault: vaultAddress(env.squadsMultisig),
    threshold: ms.threshold,
    timeLock: ms.timeLock,
    members: ms.members.map((m) => ({ key: m.key.toBase58(), permissions: m.permissions.mask })),
    transactionIndex: txIndex,
    staleTransactionIndex: BigInt(ms.staleTransactionIndex.toString()),
    proposals,
  };
}

/** A kit instruction as a web3.js v1 instruction (for the Squads message). */
export function toLegacyInstruction(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: pk(ix.programAddress),
    keys: (ix.accounts ?? []).map((m) => ({
      pubkey: pk(m.address),
      isSigner: m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER,
      isWritable: m.role === AccountRole.WRITABLE || m.role === AccountRole.WRITABLE_SIGNER,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

/** Every signer inside a vault transaction must be the vault itself. */
export function assertOnlyVaultSigns(ixs: Instruction[], vault: string) {
  for (const ix of ixs) {
    for (const m of ix.accounts ?? []) {
      const signer = m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER;
      if (signer && m.address !== vault) throw new Error(`instruction needs signer ${m.address}, not the vault ${vault}`);
    }
  }
}

async function unsigned(env: ServerEnv, payer: string, ixs: TransactionInstruction[]): Promise<string> {
  const { blockhash } = await conn(env).getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({ payerKey: pk(payer), recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64");
}

export async function composeProposalCreate(env: ServerEnv, member: string, inner: Instruction[], memo: string): Promise<{ tx: string; index: bigint }> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  const c = conn(env);
  const msPda = pk(env.squadsMultisig);
  const vault = vaultAddress(env.squadsMultisig);
  assertOnlyVaultSigns(inner, vault);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(c, msPda);
  const index = BigInt(ms.transactionIndex.toString()) + 1n;
  const { blockhash } = await c.getLatestBlockhash("confirmed");
  const creator = pk(member);
  const ixs = [
    multisig.instructions.vaultTransactionCreate({
      multisigPda: msPda,
      transactionIndex: index,
      creator,
      rentPayer: creator,
      vaultIndex: 0,
      ephemeralSigners: 0,
      transactionMessage: new TransactionMessage({ payerKey: pk(vault), recentBlockhash: blockhash, instructions: inner.map(toLegacyInstruction) }),
      memo,
    }),
    multisig.instructions.proposalCreate({ multisigPda: msPda, transactionIndex: index, creator, rentPayer: creator }),
    multisig.instructions.proposalApprove({ multisigPda: msPda, transactionIndex: index, member: creator }),
  ];
  return { tx: await unsigned(env, member, ixs), index };
}

export async function composeProposalApprove(env: ServerEnv, member: string, index: bigint): Promise<string> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  return unsigned(env, member, [
    multisig.instructions.proposalApprove({ multisigPda: pk(env.squadsMultisig), transactionIndex: index, member: pk(member) }),
  ]);
}

export async function composeProposalExecute(env: ServerEnv, member: string, index: bigint): Promise<string> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  const { instruction } = await multisig.instructions.vaultTransactionExecute({
    connection: conn(env),
    multisigPda: pk(env.squadsMultisig),
    transactionIndex: index,
    member: pk(member),
  });
  return unsigned(env, member, [instruction]);
}

/** Program ids a relayed transaction may touch (the relay refuses anything else). */
export const SQUADS_PROGRAM = multisig.PROGRAM_ID.toBase58();
export const MUTAV_DEFAULT = MUTAV_PROGRAM_ADDRESS as Address;
