/**
 * Squads v4 transaction accounts, decoded by hand (like lib/squads.ts, so the
 * repo does not depend on the Squads SDK): `VaultTransaction`,
 * `ConfigTransaction` and `Proposal`, and their PDAs. Layouts from
 * squads-protocol/v4 `programs/squads_multisig_program/src/state/` and the
 * beet types of `@sqds/multisig` 2.1.4 (`src/generated/accounts`, `types`);
 * the test fixtures are pinned to bytes serialized by those beet types.
 *
 *   VaultTransaction: disc[8] | multisig | creator | index u64 | bump u8 |
 *     vault_index u8 | vault_bump u8 | ephemeral_signer_bumps Vec<u8> |
 *     message { num_signers u8, num_writable_signers u8,
 *       num_writable_non_signers u8, account_keys Vec<Pubkey>,
 *       instructions Vec<{ program_id_index u8, account_indexes Vec<u8>, data Vec<u8> }>,
 *       address_table_lookups Vec<{ account_key, writable_indexes Vec<u8>, readonly_indexes Vec<u8> }> }
 *   ConfigTransaction: disc[8] | multisig | creator | index u64 | bump u8 | actions Vec<ConfigAction>
 *   Proposal: disc[8] | multisig | transaction_index u64 | status (enum u8 [+ i64]) |
 *     bump u8 | approved Vec<Pubkey> | rejected Vec<Pubkey> | cancelled Vec<Pubkey>
 *
 * Vec lengths are u32 little-endian (Borsh). Read-only; signs nothing.
 */
import { createHash } from 'node:crypto';
import {
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from '@solana/kit';
import { SQUADS_V4_PROGRAM } from '../../devnet/lib/squads';

const disc = (name: string) => new Uint8Array(createHash('sha256').update(`account:${name}`).digest().subarray(0, 8));
export const VAULT_TRANSACTION_DISCRIMINATOR = disc('VaultTransaction');
export const CONFIG_TRANSACTION_DISCRIMINATOR = disc('ConfigTransaction');
export const PROPOSAL_DISCRIMINATOR = disc('Proposal');

const utf8 = getUtf8Encoder();
const u64le = (v: bigint) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, v, true);
  return b;
};

/** `["multisig", multisig, "transaction", index u64 LE]`: the vault or config transaction at `index`. */
export async function squadsTransactionAddress(multisig: Address, index: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(multisig), utf8.encode('transaction'), u64le(index)],
  });
  return pda;
}

/** `["multisig", multisig, "transaction", index u64 LE, "proposal"]`. */
export async function squadsProposalAddress(multisig: Address, index: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(multisig), utf8.encode('transaction'), u64le(index), utf8.encode('proposal')],
  });
  return pda;
}

/** `["multisig", transaction, "ephemeral_signer", i u8]`: a PDA the vault transaction may sign with. */
export async function squadsEphemeralSigner(transaction: Address, i: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(transaction), utf8.encode('ephemeral_signer'), new Uint8Array([i])],
  });
  return pda;
}

/** A little-endian Borsh reader that fails on any read past the end. */
export class Reader {
  o = 0;
  private dv: DataView;
  constructor(readonly data: Uint8Array) {
    this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }
  private need(n: number, what: string) {
    if (this.o + n > this.data.length) throw new Error(`${what} runs past the account data (offset ${this.o}, ${this.data.length} bytes)`);
  }
  u8(what = 'u8') {
    this.need(1, what);
    return this.data[this.o++]!;
  }
  u16(what = 'u16') {
    this.need(2, what);
    const v = this.dv.getUint16(this.o, true);
    this.o += 2;
    return v;
  }
  u32(what = 'u32') {
    this.need(4, what);
    const v = this.dv.getUint32(this.o, true);
    this.o += 4;
    return v;
  }
  u64(what = 'u64') {
    this.need(8, what);
    const v = this.dv.getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }
  i64(what = 'i64') {
    this.need(8, what);
    const v = this.dv.getBigInt64(this.o, true);
    this.o += 8;
    return v;
  }
  bytes(n: number, what = 'bytes') {
    this.need(n, what);
    const v = this.data.subarray(this.o, this.o + n);
    this.o += n;
    return v;
  }
  key(what = 'pubkey'): Address {
    return getAddressDecoder().decode(this.bytes(32, what));
  }
  vecBytes(what = 'Vec<u8>') {
    return this.bytes(this.u32(`${what} length`), what);
  }
  vec<T>(item: () => T, what = 'Vec'): T[] {
    const n = this.u32(`${what} length`);
    // Every item is at least one byte: refuse absurd lengths before looping.
    if (n > this.data.length - this.o) throw new Error(`${what} length ${n} runs past the account data`);
    return Array.from({ length: n }, item);
  }
  option<T>(item: () => T, what = 'Option'): T | null {
    const t = this.u8(`${what} tag`);
    if (t === 0) return null;
    if (t !== 1) throw new Error(`bad Option tag ${t} in ${what}`);
    return item();
  }
  /** The account must hold nothing after the decoded struct. */
  end(what: string) {
    if (this.o !== this.data.length) throw new Error(`${what} has ${this.data.length - this.o} unexpected trailing byte(s)`);
  }
}

const startsWith = (data: Uint8Array, d: Uint8Array) => data.length >= 8 && d.every((b, i) => data[i] === b);

export type CompiledInstruction = { programIdIndex: number; accountIndexes: number[]; data: Uint8Array };
export type AddressTableLookup = { accountKey: Address; writableIndexes: number[]; readonlyIndexes: number[] };
export type VaultTransactionMessage = {
  numSigners: number;
  numWritableSigners: number;
  numWritableNonSigners: number;
  accountKeys: Address[];
  instructions: CompiledInstruction[];
  addressTableLookups: AddressTableLookup[];
};
export type VaultTransaction = {
  kind: 'vault';
  multisig: Address;
  creator: Address;
  index: bigint;
  bump: number;
  vaultIndex: number;
  vaultBump: number;
  ephemeralSignerBumps: number[];
  message: VaultTransactionMessage;
};

export type ConfigAction =
  | { name: 'AddMember'; args: { newMember: Address; permissions: number } }
  | { name: 'RemoveMember'; args: { oldMember: Address } }
  | { name: 'ChangeThreshold'; args: { newThreshold: number } }
  | { name: 'SetTimeLock'; args: { newTimeLock: number } }
  | {
      name: 'AddSpendingLimit';
      args: { createKey: Address; vaultIndex: number; mint: Address; amount: bigint; period: string; members: Address[]; destinations: Address[] };
    }
  | { name: 'RemoveSpendingLimit'; args: { spendingLimit: Address } }
  | { name: 'SetRentCollector'; args: { newRentCollector: Address | null } };

export type ConfigTransaction = { kind: 'config'; multisig: Address; creator: Address; index: bigint; bump: number; actions: ConfigAction[] };

export const SPENDING_LIMIT_PERIODS = ['OneTime', 'Day', 'Week', 'Month'] as const;

function readConfigAction(r: Reader): ConfigAction {
  const tag = r.u8('ConfigAction tag');
  switch (tag) {
    case 0:
      return { name: 'AddMember', args: { newMember: r.key('AddMember.key'), permissions: r.u8('AddMember.permissions') } };
    case 1:
      return { name: 'RemoveMember', args: { oldMember: r.key('RemoveMember.old_member') } };
    case 2:
      return { name: 'ChangeThreshold', args: { newThreshold: r.u16('ChangeThreshold.new_threshold') } };
    case 3:
      return { name: 'SetTimeLock', args: { newTimeLock: r.u32('SetTimeLock.new_time_lock') } };
    case 4: {
      const createKey = r.key('AddSpendingLimit.create_key');
      const vaultIndex = r.u8('AddSpendingLimit.vault_index');
      const mint = r.key('AddSpendingLimit.mint');
      const amount = r.u64('AddSpendingLimit.amount');
      const p = r.u8('AddSpendingLimit.period');
      const period = SPENDING_LIMIT_PERIODS[p];
      if (!period) throw new Error(`unknown spending-limit period ${p}`);
      const members = r.vec(() => r.key('AddSpendingLimit.members'), 'AddSpendingLimit.members');
      const destinations = r.vec(() => r.key('AddSpendingLimit.destinations'), 'AddSpendingLimit.destinations');
      return { name: 'AddSpendingLimit', args: { createKey, vaultIndex, mint, amount, period, members, destinations } };
    }
    case 5:
      return { name: 'RemoveSpendingLimit', args: { spendingLimit: r.key('RemoveSpendingLimit.spending_limit') } };
    case 6:
      return { name: 'SetRentCollector', args: { newRentCollector: r.option(() => r.key('SetRentCollector'), 'SetRentCollector') } };
    default:
      throw new Error(`unknown Squads ConfigAction tag ${tag}`);
  }
}

export function decodeVaultTransaction(data: Uint8Array): VaultTransaction {
  if (!startsWith(data, VAULT_TRANSACTION_DISCRIMINATOR)) throw new Error('not a Squads v4 VaultTransaction account (discriminator mismatch)');
  const r = new Reader(data);
  r.o = 8;
  const multisig = r.key('multisig');
  const creator = r.key('creator');
  const index = r.u64('index');
  const bump = r.u8('bump');
  const vaultIndex = r.u8('vault_index');
  const vaultBump = r.u8('vault_bump');
  const ephemeralSignerBumps = [...r.vecBytes('ephemeral_signer_bumps')];
  const numSigners = r.u8('num_signers');
  const numWritableSigners = r.u8('num_writable_signers');
  const numWritableNonSigners = r.u8('num_writable_non_signers');
  const accountKeys = r.vec(() => r.key('account_keys'), 'account_keys');
  const instructions = r.vec(
    () => ({ programIdIndex: r.u8('program_id_index'), accountIndexes: [...r.vecBytes('account_indexes')], data: r.vecBytes('instruction data').slice() }),
    'instructions',
  );
  const addressTableLookups = r.vec(
    () => ({ accountKey: r.key('lookup table'), writableIndexes: [...r.vecBytes('writable_indexes')], readonlyIndexes: [...r.vecBytes('readonly_indexes')] }),
    'address_table_lookups',
  );
  r.end('VaultTransaction');
  return {
    kind: 'vault',
    multisig,
    creator,
    index,
    bump,
    vaultIndex,
    vaultBump,
    ephemeralSignerBumps,
    message: { numSigners, numWritableSigners, numWritableNonSigners, accountKeys, instructions, addressTableLookups },
  };
}

export function decodeConfigTransaction(data: Uint8Array): ConfigTransaction {
  if (!startsWith(data, CONFIG_TRANSACTION_DISCRIMINATOR)) throw new Error('not a Squads v4 ConfigTransaction account (discriminator mismatch)');
  const r = new Reader(data);
  r.o = 8;
  const multisig = r.key('multisig');
  const creator = r.key('creator');
  const index = r.u64('index');
  const bump = r.u8('bump');
  const actions = r.vec(() => readConfigAction(r), 'actions');
  r.end('ConfigTransaction');
  return { kind: 'config', multisig, creator, index, bump, actions };
}

/** Which transaction account this is, by discriminator; `null` when neither. */
export function transactionKind(data: Uint8Array): 'vault' | 'config' | null {
  if (startsWith(data, VAULT_TRANSACTION_DISCRIMINATOR)) return 'vault';
  if (startsWith(data, CONFIG_TRANSACTION_DISCRIMINATOR)) return 'config';
  return null;
}

export const PROPOSAL_STATUSES = ['Draft', 'Active', 'Rejected', 'Approved', 'Executing', 'Executed', 'Cancelled'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export type Proposal = {
  multisig: Address;
  transactionIndex: bigint;
  status: ProposalStatus;
  /** Unix seconds the status was set (none for the deprecated `Executing`). */
  statusTimestamp: bigint | null;
  bump: number;
  approved: Address[];
  rejected: Address[];
  cancelled: Address[];
};

export function decodeProposal(data: Uint8Array): Proposal {
  if (!startsWith(data, PROPOSAL_DISCRIMINATOR)) throw new Error('not a Squads v4 Proposal account (discriminator mismatch)');
  const r = new Reader(data);
  r.o = 8;
  const multisig = r.key('multisig');
  const transactionIndex = r.u64('transaction_index');
  const t = r.u8('status tag');
  const status = PROPOSAL_STATUSES[t];
  if (!status) throw new Error(`unknown proposal status tag ${t}`);
  const statusTimestamp = status === 'Executing' ? null : r.i64('status timestamp');
  const bump = r.u8('bump');
  const approved = r.vec(() => r.key('approved'), 'approved');
  const rejected = r.vec(() => r.key('rejected'), 'rejected');
  const cancelled = r.vec(() => r.key('cancelled'), 'cancelled');
  // Squads allocates Proposal with room for every member's vote: unused
  // capacity is zero bytes, so only trailing non-zero bytes are refused.
  if (r.data.subarray(r.o).some((b) => b !== 0)) throw new Error('Proposal has unexpected non-zero trailing bytes');
  return { multisig, transactionIndex, status, statusTimestamp, bump, approved, rejected, cancelled };
}
