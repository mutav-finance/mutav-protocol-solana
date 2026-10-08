/**
 * Read helpers: the reserve snapshot, guarantees, claim filings, payouts,
 * queue positions and issuer income (the inbox and its receipts). Read-only
 * RPC calls; nothing here signs or sends.
 */
import {
  getAddressEncoder,
  getBase58Decoder,
  getBase64Encoder,
  type Account,
  type Address,
  type GetAccountInfoApi,
  type GetMultipleAccountsApi,
  type GetProgramAccountsApi,
  type ReadonlyUint8Array,
  type Rpc,
} from '@solana/kit';
import {
  fetchAllMaybeDepositRequest,
  fetchAllMaybeRedeemRequest,
  fetchVaultConfig,
  fetchVaultState,
  CLAIM_FILING_DISCRIMINATOR,
  GUARANTEE_DISCRIMINATOR,
  INCOME_RECEIPT_DISCRIMINATOR,
  getIncomeReceiptDecoder,
  type IncomeReceipt,
  PAYOUT_DISCRIMINATOR,
  getClaimFilingDecoder,
  getGuaranteeDecoder,
  getPayoutDecoder,
  type ClaimFiling,
  type Guarantee,
  type Payout,
  type VaultConfig,
  type VaultState,
} from './generated/accounts';
import { findGuaranteePda } from './generated/pdas/guarantee';
import { findIncomeReceiptPda } from './generated/pdas/incomeReceipt';
import { findStatePda } from './generated/pdas/state';
import { MUTAV_PROGRAM_ADDRESS } from './generated/programs/mutav';
import type { Solvency } from './math';
import {
  findDepositRequestPda,
  findIncomeInboxAddress,
  findRedeemRequestPda,
  findReserveAddresses,
  type ReserveAddresses,
} from './pdas';
import { solvencyFromAccounts } from './preview';

export type ReadRpc = Rpc<GetAccountInfoApi & GetMultipleAccountsApi>;
export type ScanRpc = Rpc<GetProgramAccountsApi>;
type ProgramOpt = { programAddress?: Address };

const b58 = getBase58Decoder();
const b64 = getBase64Encoder();

/** One reserve: its addresses, decoded config and state, and the §4 snapshot. */
export type ReserveSnapshot = {
  addresses: ReserveAddresses;
  config: Account<VaultConfig>;
  state: Account<VaultState>;
  solvency: Solvency;
};

export async function fetchReserve(rpc: ReadRpc, reserveMint: Address, o: ProgramOpt = {}): Promise<ReserveSnapshot> {
  const addresses = await findReserveAddresses(reserveMint, o);
  const [config, state] = await Promise.all([
    fetchVaultConfig(rpc, addresses.config),
    fetchVaultState(rpc, addresses.state),
  ]);
  return { addresses, config, state, solvency: solvencyFromAccounts(config.data, state.data) };
}

/** Program accounts of one type, optionally matching `bytes` at `offset` after the discriminator. */
async function scan<T extends object>(
  rpc: ScanRpc,
  discriminator: ReadonlyUint8Array,
  decode: (b: Uint8Array) => T,
  match: { offset: number; bytes: ReadonlyUint8Array } | null,
  o: ProgramOpt,
): Promise<Account<T>[]> {
  const memcmp = (offset: number, bytes: ReadonlyUint8Array) => ({
    memcmp: { offset: BigInt(offset), bytes: b58.decode(bytes), encoding: 'base58' as const },
  });
  const filters = [memcmp(0, discriminator), ...(match ? [memcmp(match.offset, match.bytes)] : [])];
  const programAddress = o.programAddress ?? MUTAV_PROGRAM_ADDRESS;
  const rows = (await rpc
    .getProgramAccounts(programAddress, { encoding: 'base64', filters } as never)
    .send()) as unknown as { pubkey: Address; account: { data: [string, string]; lamports: bigint; owner: Address; executable: boolean; space: bigint } }[];
  return rows.map(({ pubkey, account }) => {
    const data = b64.encode(account.data[0]) as Uint8Array;
    return {
      address: pubkey,
      data: decode(data),
      executable: account.executable,
      lamports: account.lamports,
      programAddress: account.owner,
      space: account.space,
    } as Account<T>;
  });
}

/**
 * Every `Guarantee` of one reserve. `Guarantee` does not store its config, so
 * each account is kept only if it is the PDA of `(config, id)`.
 */
export async function fetchGuaranteesForReserve(rpc: ScanRpc, config: Address, o: ProgramOpt = {}) {
  const all = await scan<Guarantee>(rpc, GUARANTEE_DISCRIMINATOR, (b) => getGuaranteeDecoder().decode(b), null, o);
  const mine = await Promise.all(
    all.map(async (g) => (await findGuaranteePda({ config, id: g.data.id }, o))[0] === g.address),
  );
  return all.filter((_, i) => mine[i]);
}

/** `Payout` and `ClaimFiling` layouts: discriminator (8), version (1), bump (1), then `guarantee`. */
const GUARANTEE_FIELD_OFFSET = 10;

/** Every `Payout` recorded against `guarantee`. */
export const fetchPayoutsForGuarantee = (rpc: ScanRpc, guarantee: Address, o: ProgramOpt = {}) =>
  scan<Payout>(rpc, PAYOUT_DISCRIMINATOR, (b) => getPayoutDecoder().decode(b), {
    offset: GUARANTEE_FIELD_OFFSET,
    bytes: getAddressEncoder().encode(guarantee),
  }, o);

/** Every `ClaimFiling` against `guarantee`. */
export const fetchClaimFilingsForGuarantee = (rpc: ScanRpc, guarantee: Address, o: ProgramOpt = {}) =>
  scan<ClaimFiling>(rpc, CLAIM_FILING_DISCRIMINATOR, (b) => getClaimFilingDecoder().decode(b), {
    offset: GUARANTEE_FIELD_OFFSET,
    bytes: getAddressEncoder().encode(guarantee),
  }, o);


export type QueuePosition = {
  seq: bigint;
  /** `redeem_head` / `deposit_head` when read. */
  head: bigint;
  /** No open request ahead of this one. */
  isHead: boolean;
  /** Open requests between the head and this one. */
  requestsAhead: number;
  /** Shares (redeem) or BRS (deposit) still waiting ahead of this one. */
  amountAhead: bigint;
  /** This request exists and still waits (`shares_remaining > 0` / pending). */
  open: boolean;
};

/** Most seqs a position read scans; a longer queue throws. */
export const MAX_QUEUE_SCAN = 512;

async function position<T>(
  head: bigint,
  next: bigint,
  seq: bigint,
  fetchAll: (seqs: bigint[]) => Promise<({ exists: true; data: T } | { exists: false })[]>,
  waiting: (r: T) => bigint, // amount still waiting, 0 if dead
): Promise<QueuePosition> {
  if (seq >= next || seq < head) {
    return { seq, head, isHead: false, requestsAhead: 0, amountAhead: 0n, open: false };
  }
  const span = Number(seq - head) + 1;
  if (span > MAX_QUEUE_SCAN) throw new RangeError(`queue position scan of ${span} seqs exceeds ${MAX_QUEUE_SCAN}`);
  const seqs = Array.from({ length: span }, (_, i) => head + BigInt(i));
  const rows = await fetchAll(seqs);
  let requestsAhead = 0;
  let amountAhead = 0n;
  for (const row of rows.slice(0, -1)) {
    const w = row.exists ? waiting(row.data) : 0n;
    if (w > 0n) {
      requestsAhead += 1;
      amountAhead += w;
    }
  }
  const last = rows[rows.length - 1]!;
  const open = last.exists && waiting(last.data) > 0n;
  return { seq, head, isHead: open && requestsAhead === 0, requestsAhead, amountAhead, open };
}

/** Where redeem request `seq` stands in the FIFO queue (dead seqs skipped). */
export async function getRedeemQueuePosition(rpc: ReadRpc, config: Address, seq: bigint, o: ProgramOpt = {}) {
  const state = (await fetchVaultState(rpc, await stateOf(config, o))).data;
  return position(state.redeemHead, state.nextRedeemSeq, seq, async (seqs) => {
    const addrs = await Promise.all(seqs.map(async (s) => (await findRedeemRequestPda({ config, seq: s }, o))[0]));
    return fetchAllMaybeRedeemRequest(rpc, addrs);
  }, (r) => r.sharesRemaining);
}

/** Where deposit request `seq` stands in the FIFO queue. */
export async function getDepositQueuePosition(rpc: ReadRpc, config: Address, seq: bigint, o: ProgramOpt = {}) {
  const state = (await fetchVaultState(rpc, await stateOf(config, o))).data;
  return position(state.depositHead, state.nextDepositSeq, seq, async (seqs) => {
    const addrs = await Promise.all(seqs.map(async (s) => (await findDepositRequestPda({ config, seq: s }, o))[0]));
    return fetchAllMaybeDepositRequest(rpc, addrs);
  }, (r) => (r.status === 0 ? r.assets : 0n));
}

const stateOf = async (config: Address, o: ProgramOpt) => (await findStatePda({ config }, o))[0];

/** SPL token account layout: `amount` is the `u64` at byte 64. */
const TOKEN_AMOUNT_OFFSET = 64;

/**
 * The income inbox of a reserve (ADR 0017) and its untracked balance: what
 * Nora has paid and the operator has not swept yet. `exists: false` before
 * `initialize`. This balance never counts toward NAV.
 *
 * The mint and token program come from the reserve's `VaultConfig`
 * (`reserveMint`, `reserveTokenProgram`), so a Token-2022 reserve reads its
 * own inbox (#29).
 */
export async function fetchIncomeInbox(
  rpc: ReadRpc,
  r: { vaultAuthority: Address; config: Pick<VaultConfig, 'reserveMint' | 'reserveTokenProgram'> },
): Promise<{ address: Address; exists: boolean; amount: bigint }> {
  const address = await findIncomeInboxAddress({
    vaultAuthority: r.vaultAuthority,
    reserveMint: r.config.reserveMint,
    tokenProgram: r.config.reserveTokenProgram,
  });
  const { value } = (await rpc.getAccountInfo(address, { encoding: 'base64' }).send()) as unknown as {
    value: { data: [string, string] } | null;
  };
  if (!value) return { address, exists: false, amount: 0n };
  const data = b64.encode(value.data[0]) as Uint8Array;
  if (data.length < TOKEN_AMOUNT_OFFSET + 8) throw new RangeError(`${address} is not a token account`);
  const amount = new DataView(data.buffer, data.byteOffset).getBigUint64(TOKEN_AMOUNT_OFFSET, true);
  return { address, exists: true, amount };
}

/**
 * Every `IncomeReceipt` of one reserve: one per swept issuer statement
 * (ADR 0017), newest slot first. `IncomeReceipt` does not store its config,
 * so each account is kept only if it is the PDA of `(config, income_ref_hash)`.
 */
export async function fetchIncomeReceiptsForReserve(rpc: ScanRpc, config: Address, o: ProgramOpt = {}) {
  const all = await scan<IncomeReceipt>(
    rpc,
    INCOME_RECEIPT_DISCRIMINATOR,
    (b) => getIncomeReceiptDecoder().decode(b),
    null,
    o,
  );
  const mine = await Promise.all(
    all.map(
      async (r) => (await findIncomeReceiptPda({ config, incomeRefHash: r.data.incomeRefHash }, o))[0] === r.address,
    ),
  );
  return all.filter((_, i) => mine[i]).sort((a, b) => (a.data.slot < b.data.slot ? 1 : a.data.slot > b.data.slot ? -1 : 0));
}
