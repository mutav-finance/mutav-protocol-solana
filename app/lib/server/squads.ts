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
import { identifyMutavInstruction, MutavInstruction, MUTAV_PROGRAM_ADDRESS, type VaultConfig } from "@mutav-finance/mutav-protocol-solana";
import type { ServerEnv } from "./env";
import { baselineCovers, isLiveProposal, parseBaselineMemo, setConfigChanges, setConfigFields, staleCarry, staleCarryText, type ConfigChange } from "../config-diff";

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
  /** Members who voted to cancel an Approved proposal. */
  cancellations: string[];
  /** At or below the multisig's stale index: Draft/Active can no longer be voted on. */
  stale: boolean;
  /** Approved and time lock elapsed at `now`. */
  executable: boolean;
  /** When the time lock ends (Approved only). */
  executableAt: bigint | null;
  /** MUTAV instructions inside the vault transaction, by name. */
  instructions: string[];
  /** For a set_config inside: the fields it changes against on-chain config now, so approvers see the diff. */
  changes?: ConfigChange[];
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

/** The set_config inside a vault transaction, as a diff against `config`. */
function setConfigDiff(tx: multisig.generated.VaultTransaction, programId: string, config: VaultConfig): ConfigChange[] | undefined {
  const keys = tx.message.accountKeys.map((k) => k.toBase58());
  for (const ix of tx.message.instructions) {
    if (keys[ix.programIdIndex] !== programId) continue;
    const data = new Uint8Array(ix.data);
    try {
      if (identifyMutavInstruction(data) !== MutavInstruction.SetConfig) continue;
      // Sparse params (ADR 0026); the treasury moves with `set_treasury_account`.
      return setConfigChanges(data, config);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

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

/** Most proposal indices read back from the newest; the pilot multisig makes a handful a week. */
export const MAX_PROPOSAL_SCAN = 256;
/** Finished proposals shown besides every live one. */
const RECENT_FINISHED = 10;
/** Accounts per getMultipleAccountsInfo call (the RPC limit is 100). */
const BATCH = 100;

/** Indices to scan, newest first: every index back to the first, at most MAX_PROPOSAL_SCAN. */
export function scanIndices(txIndex: bigint, max = MAX_PROPOSAL_SCAN): bigint[] {
  const from = txIndex > BigInt(max) ? txIndex - BigInt(max) + 1n : 1n;
  const out: bigint[] = [];
  for (let i = txIndex; i >= from; i--) out.push(i);
  return out;
}

/**
 * The multisig and its proposals (A3): EVERY proposal that can still execute
 * or be voted on (scanned back MAX_PROPOSAL_SCAN indices, so an old Approved
 * set_config waiting on the time lock is never missed), plus the last few
 * finished ones for context.
 */
export async function readMultisig(env: ServerEnv, now: bigint, config?: VaultConfig): Promise<MultisigView> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  const c = conn(env);
  const msPda = pk(env.squadsMultisig);
  const ms = await multisig.accounts.Multisig.fromAccountAddress(c, msPda);
  const txIndex = BigInt(ms.transactionIndex.toString());
  const staleIndex = BigInt(ms.staleTransactionIndex.toString());
  const indices = scanIndices(txIndex);
  const pdas = indices.flatMap((i) => [
    multisig.getTransactionPda({ multisigPda: msPda, index: i })[0],
    multisig.getProposalPda({ multisigPda: msPda, transactionIndex: i })[0],
  ]);
  const infos: Awaited<ReturnType<Connection["getMultipleAccountsInfo"]>> = [];
  for (let k = 0; k < pdas.length; k += BATCH) infos.push(...(await c.getMultipleAccountsInfo(pdas.slice(k, k + BATCH))));
  const all: ProposalView[] = indices.map((i, n) => {
    const txPda = pdas[2 * n]!;
    const propPda = pdas[2 * n + 1]!;
    const txInfo = infos[2 * n] ?? null;
    const propInfo = infos[2 * n + 1] ?? null;
    let names: string[] = [];
    let changes: ConfigChange[] | undefined;
    if (txInfo) {
      try {
        const [vt] = multisig.accounts.VaultTransaction.fromAccountInfo(txInfo);
        names = instructionNames(vt, env.programId);
        if (config) changes = setConfigDiff(vt, env.programId, config);
      } catch {
        names = ["(not a vault transaction)"];
      }
    }
    let view: Omit<ProposalView, "instructions" | "index" | "transaction" | "proposal" | "stale"> = {
      status: "None",
      statusAt: null,
      approvals: [],
      rejections: [],
      cancellations: [],
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
        cancellations: p.cancelled.map((k) => k.toBase58()),
        executable: executableAt !== null && now >= executableAt,
        executableAt,
      };
    }
    return { index: i, transaction: txPda.toBase58(), proposal: propPda.toBase58(), instructions: names, stale: i <= staleIndex, ...(changes ? { changes } : {}), ...view };
  });
  const live = all.filter((p) => isLiveProposal(p));
  const finished = all.filter((p) => !isLiveProposal(p) && p.status !== "None").slice(0, RECENT_FINISHED);
  const proposals = [...live, ...finished].sort((a, b) => (a.index < b.index ? 1 : a.index > b.index ? -1 : 0));
  return {
    address: env.squadsMultisig,
    vault: vaultAddress(env.squadsMultisig),
    threshold: ms.threshold,
    timeLock: ms.timeLock,
    members: ms.members.map((m) => ({ key: m.key.toBase58(), permissions: m.permissions.mask })),
    transactionIndex: txIndex,
    staleTransactionIndex: staleIndex,
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

export type ProposalAction = "approve" | "reject" | "cancel" | "execute";

/** Compose an unsigned vote (approve, reject, cancel) or execute for a member's wallet. */
export async function composeProposalAction(env: ServerEnv, member: string, index: bigint, action: ProposalAction, config?: VaultConfig): Promise<string> {
  if (!env.squadsMultisig) throw new Error("SQUADS_MULTISIG is not set");
  const args = { multisigPda: pk(env.squadsMultisig), transactionIndex: index, member: pk(member) };
  switch (action) {
    case "approve":
      return unsigned(env, member, [multisig.instructions.proposalApprove(args)]);
    case "reject":
      // Active proposals: enough rejections (members − threshold + 1) make it Rejected.
      return unsigned(env, member, [multisig.instructions.proposalReject(args)]);
    case "cancel":
      // Approved proposals: `threshold` cancel votes make it Cancelled (V2 reallocates the vote list).
      return unsigned(env, member, [multisig.instructions.proposalCancelV2(args)]);
    case "execute": {
      if (config) await assertNoStaleCarry(env, index, config);
      const { instruction } = await multisig.instructions.vaultTransactionExecute({ connection: conn(env), ...args });
      return unsigned(env, member, [instruction]);
    }
  }
}

// ── The memo a proposal was created with (A3 stale-carry baseline) ─────────
//
// Squads keeps the memo in the create instruction, not in the account, so it
// is read back from history. Anyone can touch the transaction PDA (before or
// after it exists) with a transaction of their own, so the lookup accepts
// only a successful, top-level Squads `vaultTransactionCreate` for exactly
// this multisig and transaction PDA, whose creator is the one recorded
// on-chain, and takes the memo from that same instruction. Anything else is
// ignored; no match fails closed.

/** Signatures per getSignaturesForAddress page (the RPC maximum). */
const SIGNATURE_PAGE = 1000;
/** Pages read back before giving up (fail closed): 20,000 signatures. */
export const MAX_SIGNATURE_PAGES = 20;
/** Transactions fetched looking for the create before giving up (fail closed). */
export const MAX_CREATE_TX_READS = 100;

type SignatureRow = { signature: string; err: unknown };

/**
 * Every successful signature on an address, oldest first: pages back with
 * `before` until the history is exhausted. Throws past MAX_SIGNATURE_PAGES.
 */
export async function signaturesOldestFirst(page: (before: string | undefined) => Promise<SignatureRow[]>, maxPages = MAX_SIGNATURE_PAGES): Promise<string[]> {
  const out: string[] = [];
  let before: string | undefined;
  for (let n = 0; ; n++) {
    if (n >= maxPages) throw new StaleCarryError(`the proposal's transaction account has more than ${maxPages * SIGNATURE_PAGE} signatures: its creation cannot be located, so execute is refused (reject or cancel it and propose again)`);
    const rows = await page(before);
    for (const r of rows) if (!r.err) out.push(r.signature);
    if (rows.length < SIGNATURE_PAGE) break;
    before = rows.at(-1)!.signature;
  }
  return out.reverse();
}

/** A transaction's top-level instructions over its full account list (static keys, then loaded ones). */
export type CompiledTxLike = { keys: string[]; instructions: { programIdIndex: number; accountKeyIndexes: number[]; data: Uint8Array }[] };
/** The create instruction the memo may come from. */
export type CreateMatch = { multisig: string; transaction: string; creator: string };

const CREATE_DISC = Buffer.from(multisig.generated.vaultTransactionCreateInstructionDiscriminator);

/**
 * The memo of the top-level `vaultTransactionCreate` in `tx` whose accounts
 * are [multisig, transaction, creator, …] as wanted; null when none is.
 */
export function createMemoIn(tx: CompiledTxLike, want: CreateMatch): { memo: string | null } | null {
  for (const ix of tx.instructions) {
    if (tx.keys[ix.programIdIndex] !== SQUADS_PROGRAM) continue;
    const data = Buffer.from(ix.data);
    if (data.length < 8 || !data.subarray(0, 8).equals(CREATE_DISC)) continue;
    const acc = ix.accountKeyIndexes.map((i) => tx.keys[i]);
    if (acc[0] !== want.multisig || acc[1] !== want.transaction || acc[2] !== want.creator) continue;
    try {
      const [decoded] = multisig.generated.vaultTransactionCreateStruct.deserialize(data);
      return { memo: decoded.args.memo ?? null };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * The memo from the oldest successful transaction holding a matching create,
 * reading at most MAX_CREATE_TX_READS transactions (fail closed past it).
 * Null when none matches.
 */
export async function findCreateMemo(
  signatures: string[],
  fetchTx: (signature: string) => Promise<CompiledTxLike | null>,
  want: CreateMatch,
  maxReads = MAX_CREATE_TX_READS,
): Promise<string | null> {
  for (const [n, sig] of signatures.entries()) {
    if (n >= maxReads) throw new StaleCarryError(`more than ${maxReads} transactions touched the proposal's transaction account before a matching create: execute is refused (reject or cancel it and propose again)`);
    const tx = await fetchTx(sig);
    if (!tx) continue;
    const hit = createMemoIn(tx, want);
    if (hit) return hit.memo;
  }
  return null;
}

/**
 * The memo proposal `index` was created with, by the on-chain `creator` of its
 * vault transaction. Null when no matching create is in the RPC's history.
 */
export async function readCreateMemo(env: ServerEnv, index: bigint, creator: string): Promise<string | null> {
  if (!env.squadsMultisig) return null;
  const c = conn(env);
  const [txPda] = multisig.getTransactionPda({ multisigPda: pk(env.squadsMultisig), index });
  const sigs = await signaturesOldestFirst((before) => c.getSignaturesForAddress(txPda, { limit: SIGNATURE_PAGE, before }, "confirmed"));
  return findCreateMemo(
    sigs,
    async (sig) => {
      const tx = await c.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      if (!tx || tx.meta?.err) return null;
      const msg = tx.transaction.message;
      const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses ?? undefined }).keySegments().flat().map((k) => k.toBase58());
      return { keys, instructions: msg.compiledInstructions.map((ix) => ({ programIdIndex: ix.programIdIndex, accountKeyIndexes: ix.accountKeyIndexes, data: ix.data })) };
    },
    { multisig: env.squadsMultisig, transaction: txPda.toBase58(), creator },
  );
}

/**
 * Stale-carry check before executing a set_config proposal (A3): every field
 * it writes must still hold the value it had when the proposal was made.
 */
async function assertNoStaleCarry(env: ServerEnv, index: bigint, config: VaultConfig) {
  const [txPda] = multisig.getTransactionPda({ multisigPda: pk(env.squadsMultisig!), index });
  const info = await conn(env).getAccountInfo(txPda, "confirmed");
  if (!info) return;
  const [vt] = multisig.accounts.VaultTransaction.fromAccountInfo(info);
  const fields = setConfigFieldsOf(vt, env.programId);
  if (fields === null) return;
  const baseline = parseBaselineMemo(await readCreateMemo(env, index, vt.creator.toBase58()));
  if (!baseline || !baselineCovers(baseline, fields)) {
    throw new StaleCarryError(`proposal #${index} writes set_config but its memo does not record the values of exactly the fields it writes (made outside this app, or its creation is not in this RPC's history): reject or cancel it and propose again`);
  }
  const moved = staleCarry(baseline, config);
  if (moved.length > 0) throw new StaleCarryError(staleCarryText(index, moved));
}

/** The fields the vault transaction's set_config writes, or null when it has none. */
function setConfigFieldsOf(tx: multisig.generated.VaultTransaction, programId: string): string[] | null {
  const keys = tx.message.accountKeys.map((k) => k.toBase58());
  let out: string[] | null = null;
  for (const ix of tx.message.instructions) {
    if (keys[ix.programIdIndex] !== programId) continue;
    const data = new Uint8Array(ix.data);
    let isSetConfig = false;
    try {
      isSetConfig = identifyMutavInstruction(data) === MutavInstruction.SetConfig;
    } catch {
      isSetConfig = false;
    }
    if (isSetConfig) out = [...(out ?? []), ...setConfigFields(data)];
  }
  return out;
}

export class StaleCarryError extends Error {
  override name = "StaleCarryError";
}

/** Program ids a relayed transaction may touch (the relay refuses anything else). */
export const SQUADS_PROGRAM = multisig.PROGRAM_ID.toBase58();
export const MUTAV_DEFAULT = MUTAV_PROGRAM_ADDRESS as Address;
