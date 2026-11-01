/**
 * Decodes every instruction of a Squads vault-transaction message into
 * named args and named accounts, for `verify-proposal.ts`:
 *
 * - MUTAV, through the Codama client in clients/js (`parseMutavInstruction`);
 * - BPF Loader Upgradeable (all ten instructions);
 * - System (transfers, account creation, every durable-nonce instruction);
 * - SPL Token and Token-2022 (the base instruction set);
 * - Associated Token Account and Compute Budget.
 *
 * Anything else, any instruction whose data does not decode exactly (no
 * trailing bytes) and any instruction with an address-lookup-table account
 * comes back as `family: 'raw'` with the reason in `error`. Risk flags follow
 * the app's proposal decoder conceptually (lib/proposal-decode.ts) but are
 * kept here: root scripts never import from app/. Signs nothing.
 */
import { createHash } from 'node:crypto';
import { AccountRole, address, type AccountMeta, type Address } from '@solana/kit';
import * as client from '../../../clients/js/src';
import { MUTAV_PROGRAM_ADDRESS, MutavInstruction, parseMutavInstruction } from '../../../clients/js/src';
import { ASSOCIATED_TOKEN_PROGRAM, BPF_LOADER_UPGRADEABLE, SYSTEM_PROGRAM, TOKEN_PROGRAM } from '../../devnet/lib/compose';
import { SQUADS_V4_PROGRAM } from '../../devnet/lib/squads';
import { Reader, type VaultTransactionMessage } from './squads-tx';

export const COMPUTE_BUDGET_PROGRAM = address('ComputeBudget111111111111111111111111111111');
export const TOKEN_2022_PROGRAM = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
/** Display labels only: these programs are never decoded, so they need a raw intent entry. */
export const KNOWN_PROGRAM_LABELS: Record<string, string> = {
  ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S: 'Program Metadata',
  verifycLy8mB96wd9wqq3WDXQwM4oU6r42Th37Db9fC: 'OtterSec verify program',
  [SQUADS_V4_PROGRAM]: 'Squads v4',
};

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Family = 'mutav' | 'loader' | 'system' | 'spl-token' | 'token-2022' | 'ata' | 'compute-budget' | 'raw';
export const DECODED_FAMILIES = ['mutav', 'loader', 'system', 'spl-token', 'token-2022', 'ata', 'compute-budget'] as const;

/** `critical`: authority or code change; `high`: moves money or changes reserve rules; `caution`: worth a second look. */
export type RiskLevel = 'critical' | 'high' | 'caution';
export type Risk = { level: RiskLevel; note: string };

export type DecodedAccount = { name: string; address: Address; signer: boolean; writable: boolean };
export type DecodedInstruction = {
  family: Family;
  programId: Address;
  /** Instruction name: MUTAV in program (snake_case) names, native programs in their Rust variant names; `raw` when not decoded. */
  name: string;
  args: Record<string, Json>;
  accounts: DecodedAccount[];
  /** Accounts after the named ones (MUTAV queue accounts, token multisig signers…). */
  remaining: DecodedAccount[];
  dataHex: string;
  dataSha256: string;
  risks: Risk[];
  /** Why the instruction is raw. */
  error?: string;
  /** Set when the instruction must never be approved, whatever the intent says (a durable nonce). */
  fatal?: string;
};

/** One message instruction with its accounts resolved; `null` where an address lookup table supplies it. */
export type ResolvedInstruction = { programId: Address | null; accounts: (Omit<DecodedAccount, 'name'> | null)[]; data: Uint8Array };

/** Resolves a vault-transaction message's compiled instructions against its static account keys. */
export function resolveMessage(m: VaultTransactionMessage): ResolvedInstruction[] {
  const meta = (i: number): Omit<DecodedAccount, 'name'> | null => {
    const key = m.accountKeys[i];
    if (key === undefined) return null; // an index into the lookup-table accounts
    const signer = i < m.numSigners;
    const writable = signer ? i < m.numWritableSigners : i - m.numSigners < m.numWritableNonSigners;
    return { address: key, signer, writable };
  };
  return m.instructions.map((ix) => ({
    programId: m.accountKeys[ix.programIdIndex] ?? null,
    accounts: ix.accountIndexes.map(meta),
    data: ix.data,
  }));
}

export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
export const sha256Hex = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

/** A decoded value as JSON: bigints as decimal strings, bytes as hex, Codama options unwrapped (`None` is `null`). */
export function toJson(v: unknown): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (v instanceof Uint8Array) return hex(v);
  if (Array.isArray(v)) return v.map(toJson);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (o.__option === 'Some') return toJson(o.value);
    if (o.__option === 'None') return null;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, toJson(x)]));
  }
  throw new Error(`cannot represent ${typeof v} in a report`);
}

const snake = (k: string) => k.replace(/(?<!^)[A-Z]/g, (c) => `_${c}`).toLowerCase();

/** Names `accounts`: `required` must all be present, `optional` may follow; the rest are `remaining`. */
function named(accounts: Omit<DecodedAccount, 'name'>[], required: string[], optional: string[] = []) {
  if (accounts.length < required.length) throw new Error(`needs at least ${required.length} accounts, has ${accounts.length}`);
  const names = [...required, ...optional];
  return {
    accounts: accounts.slice(0, names.length).map((a, i) => ({ name: names[i]!, ...a })),
    remaining: accounts.slice(names.length).map((a, i) => ({ name: `remaining[${i}]`, ...a })),
  };
}

type Body = { name: string; args?: Record<string, Json>; accounts: DecodedAccount[]; remaining?: DecodedAccount[]; risks?: Risk[]; fatal?: string };

// ---------------------------------------------------------------- MUTAV

const MUTAV_KEYS = Object.fromEntries(
  Object.entries(MutavInstruction).filter(([, v]) => typeof v === 'number').map(([k, v]) => [v as number, k]),
) as Record<number, string>;

/** Bytes the instruction's Codama data decoder consumes: Codama ignores trailing data, this tool refuses it. */
function mutavDataLength(key: string, data: Uint8Array): number {
  const get = (client as unknown as Record<string, unknown>)[`get${key}InstructionDataDecoder`];
  if (typeof get !== 'function') throw new Error(`no Codama data decoder for ${key}`);
  const [, end] = (get() as { read: (b: Uint8Array, o: number) => [unknown, number] }).read(data, 0);
  return end;
}

/** Risk of each MUTAV instruction the admin vault signs; any other MUTAV instruction is flagged as unexpected. */
const MUTAV_RISK: Record<string, Risk> = {
  propose_admin: { level: 'critical', note: 'hands the reserve admin to a new key once it accepts' },
  propose_role: { level: 'high', note: 'appoints a new operator or pauser once it accepts' },
  cancel_pending: { level: 'caution', note: 'clears a pending role handover' },
  set_payments_account: { level: 'high', note: 'changes where claim payments are sent' },
  set_treasury_account: { level: 'high', note: 'changes where the treasury share of guarantee fees is sent' },
  set_config: { level: 'high', note: 'changes reserve parameters or caps' },
  set_allowlist_root: { level: 'high', note: 'changes who may request deposits' },
  set_guardians: { level: 'high', note: 'changes the keys that may pause' },
  revoke_operator: { level: 'caution', note: 'removes the operator' },
  revoke_pauser: { level: 'high', note: 'removes the pauser' },
  pause: { level: 'caution', note: 'pauses the reserve' },
  unpause: { level: 'high', note: 'resumes the reserve' },
  fulfil_deposits: { level: 'high', note: 'fills deposit requests at NAV within the given bounds' },
  fulfil_redeems: { level: 'high', note: 'fills redemption requests at NAV within the given bounds' },
  clear_fulfil_halt: { level: 'high', note: 'clears a fill halt' },
  approve_claim: { level: 'high', note: 'approves a claim for payment' },
  cancel_deposit: { level: 'caution', note: 'parks a deposit request (ADR 0030)' },
  cancel_redeem: { level: 'caution', note: 'parks a redemption request (ADR 0030)' },
  accept_admin: { level: 'critical', note: 'accepts the reserve admin: the vault becomes the admin' },
  advance_queue_head: { level: 'caution', note: 'anyone may send it; the admin vault does not normally sign it' },
};

function decodeMutav(ix: ResolvedInstruction & { programId: Address }, accounts: Omit<DecodedAccount, 'name'>[]): Body {
  const metas: AccountMeta[] = accounts.map((a) => ({
    address: a.address,
    role: a.signer ? (a.writable ? AccountRole.WRITABLE_SIGNER : AccountRole.READONLY_SIGNER) : a.writable ? AccountRole.WRITABLE : AccountRole.READONLY,
  }));
  const parsed = parseMutavInstruction({ programAddress: ix.programId, accounts: metas, data: ix.data });
  const key = MUTAV_KEYS[parsed.instructionType];
  if (!key) throw new Error(`unknown MUTAV instruction ${parsed.instructionType}`);
  const end = mutavDataLength(key, ix.data);
  if (end !== ix.data.length) throw new Error(`instruction data has ${ix.data.length - end} unexpected trailing byte(s)`);
  const name = snake(key);
  const names = Object.keys(parsed.accounts as Record<string, unknown>);
  const { discriminator: _d, ...args } = (parsed as unknown as { data: Record<string, unknown> }).data;
  return {
    name,
    args: toJson(args) as Record<string, Json>,
    ...named(accounts, names),
    risks: [MUTAV_RISK[name] ?? { level: 'high', note: 'not an admin instruction: the admin vault does not normally sign it' }],
  };
}

// ---------------------------------------------------------------- native programs

const LOADER: Record<number, string> = {
  0: 'InitializeBuffer',
  1: 'Write',
  2: 'DeployWithMaxDataLen',
  3: 'Upgrade',
  4: 'SetAuthority',
  5: 'Close',
  6: 'ExtendProgram',
  7: 'SetAuthorityChecked',
  8: 'Migrate',
  9: 'ExtendProgramChecked',
};

function decodeLoader(r: Reader, a: Omit<DecodedAccount, 'name'>[]): Body {
  const tag = r.u32('loader tag');
  switch (tag) {
    case 0:
      return { name: 'InitializeBuffer', ...named(a, ['buffer'], ['authority']), risks: [{ level: 'high', note: 'creates a program buffer' }] };
    case 1: {
      const offset = r.u32('offset');
      const len = r.u64('bytes length');
      const bytes = r.bytes(Number(len), 'bytes');
      return { name: 'Write', args: { offset, length: bytes.length, bytesSha256: sha256Hex(bytes) }, ...named(a, ['buffer', 'authority']), risks: [{ level: 'high', note: 'writes program bytes into a buffer' }] };
    }
    case 2:
      return {
        name: 'DeployWithMaxDataLen',
        args: { maxDataLen: r.u64('max_data_len').toString() },
        ...named(a, ['payer', 'programData', 'program', 'buffer', 'rent', 'clock', 'systemProgram', 'authority']),
        risks: [{ level: 'critical', note: 'deploys a new program' }],
      };
    case 3:
      return {
        name: 'Upgrade',
        ...named(a, ['programData', 'program', 'buffer', 'spill', 'rent', 'clock', 'authority']),
        risks: [{ level: 'critical', note: 'replaces the program code with the buffer: the buffer is checked against --so and the intent hash' }],
      };
    case 4:
      return { name: 'SetAuthority', ...named(a, ['account', 'currentAuthority'], ['newAuthority']), risks: [{ level: 'critical', note: 'changes (or removes) an upgrade or buffer authority' }] };
    case 5:
      return { name: 'Close', ...named(a, ['account', 'recipient'], ['authority', 'program']), risks: [{ level: 'critical', note: 'closes a buffer or program account (a closed program cannot be redeployed at that address)' }] };
    case 6:
      return { name: 'ExtendProgram', args: { additionalBytes: r.u32('additional_bytes') }, ...named(a, ['programData', 'program'], ['systemProgram', 'payer']), risks: [{ level: 'caution', note: 'grows ProgramData' }] };
    case 7:
      return { name: 'SetAuthorityChecked', ...named(a, ['account', 'currentAuthority', 'newAuthority']), risks: [{ level: 'critical', note: 'changes an upgrade or buffer authority' }] };
    case 8:
      return { name: 'Migrate', ...named(a, ['programData', 'program', 'authority']), risks: [{ level: 'critical', note: 'migrates the program to loader v4' }] };
    case 9:
      return {
        name: 'ExtendProgramChecked',
        args: { additionalBytes: r.u32('additional_bytes') },
        ...named(a, ['programData', 'program', 'authority'], ['systemProgram', 'payer']),
        risks: [{ level: 'caution', note: 'grows ProgramData (signed by the upgrade authority)' }],
      };
    default:
      throw new Error(`unknown BPF Loader Upgradeable instruction ${tag}`);
  }
}

const NONCE_FATAL = 'durable-nonce instruction: a member never signs a transaction with a durable nonce, and a vault never touches one';

function decodeSystem(r: Reader, a: Omit<DecodedAccount, 'name'>[]): Body {
  const tag = r.u32('system tag');
  switch (tag) {
    case 0:
      return {
        name: 'CreateAccount',
        args: { lamports: r.u64().toString(), space: r.u64().toString(), owner: r.key('owner') },
        ...named(a, ['from', 'newAccount']),
        risks: [{ level: 'caution', note: 'funds a new account' }],
      };
    case 1:
      return { name: 'Assign', args: { owner: r.key('owner') }, ...named(a, ['account']), risks: [{ level: 'critical', note: 'gives the account to another program' }] };
    case 2:
      return { name: 'Transfer', args: { lamports: r.u64().toString() }, ...named(a, ['from', 'to']), risks: [{ level: 'high', note: 'moves SOL' }] };
    case 4:
      return { name: 'AdvanceNonceAccount', ...named(a, ['nonceAccount', 'recentBlockhashes', 'nonceAuthority']), risks: [{ level: 'critical', note: NONCE_FATAL }], fatal: NONCE_FATAL };
    case 5:
      return {
        name: 'WithdrawNonceAccount',
        args: { lamports: r.u64().toString() },
        ...named(a, ['nonceAccount', 'recipient', 'recentBlockhashes', 'rent', 'nonceAuthority']),
        risks: [{ level: 'critical', note: NONCE_FATAL }],
        fatal: NONCE_FATAL,
      };
    case 6:
      return { name: 'InitializeNonceAccount', args: { authority: r.key('authority') }, ...named(a, ['nonceAccount', 'recentBlockhashes', 'rent']), risks: [{ level: 'critical', note: NONCE_FATAL }], fatal: NONCE_FATAL };
    case 7:
      return { name: 'AuthorizeNonceAccount', args: { authority: r.key('authority') }, ...named(a, ['nonceAccount', 'nonceAuthority']), risks: [{ level: 'critical', note: NONCE_FATAL }], fatal: NONCE_FATAL };
    case 8:
      return { name: 'Allocate', args: { space: r.u64().toString() }, ...named(a, ['account']), risks: [{ level: 'caution', note: 'allocates account space' }] };
    case 12:
      return { name: 'UpgradeNonceAccount', ...named(a, ['nonceAccount']), risks: [{ level: 'critical', note: NONCE_FATAL }], fatal: NONCE_FATAL };
    default:
      throw new Error(`System instruction ${tag} is not decoded`);
  }
}

const AUTHORITY_TYPES = ['MintTokens', 'FreezeAccount', 'AccountOwner', 'CloseAccount'];

function decodeToken(r: Reader, a: Omit<DecodedAccount, 'name'>[]): Body {
  const tag = r.u8('token tag');
  const amount = () => r.u64('amount').toString();
  switch (tag) {
    case 3:
      return { name: 'Transfer', args: { amount: amount() }, ...named(a, ['source', 'destination', 'authority']), risks: [{ level: 'high', note: 'moves tokens' }] };
    case 4:
      return { name: 'Approve', args: { amount: amount() }, ...named(a, ['source', 'delegate', 'owner']), risks: [{ level: 'critical', note: 'lets a delegate move tokens' }] };
    case 5:
      return { name: 'Revoke', ...named(a, ['source', 'owner']), risks: [{ level: 'caution', note: 'removes a delegate' }] };
    case 6: {
      const t = r.u8('authority_type');
      // COption<Pubkey> in token instruction data: a one-byte tag, then the key.
      const newAuthority = r.option(() => r.key('new_authority'), 'new_authority');
      return {
        name: 'SetAuthority',
        args: { authorityType: AUTHORITY_TYPES[t] ?? t, newAuthority },
        ...named(a, ['account', 'currentAuthority']),
        risks: [{ level: 'critical', note: 'changes a mint or token account authority' }],
      };
    }
    case 7:
      return { name: 'MintTo', args: { amount: amount() }, ...named(a, ['mint', 'account', 'mintAuthority']), risks: [{ level: 'high', note: 'mints tokens' }] };
    case 8:
      return { name: 'Burn', args: { amount: amount() }, ...named(a, ['account', 'mint', 'authority']), risks: [{ level: 'high', note: 'burns tokens' }] };
    case 9:
      return { name: 'CloseAccount', ...named(a, ['account', 'destination', 'owner']), risks: [{ level: 'high', note: 'closes a token account' }] };
    case 10:
      return { name: 'FreezeAccount', ...named(a, ['account', 'mint', 'freezeAuthority']), risks: [{ level: 'high', note: 'freezes a token account' }] };
    case 11:
      return { name: 'ThawAccount', ...named(a, ['account', 'mint', 'freezeAuthority']), risks: [{ level: 'caution', note: 'thaws a token account' }] };
    case 12:
      return {
        name: 'TransferChecked',
        args: { amount: amount(), decimals: r.u8('decimals') },
        ...named(a, ['source', 'mint', 'destination', 'authority']),
        risks: [{ level: 'high', note: 'moves tokens' }],
      };
    case 13:
      return {
        name: 'ApproveChecked',
        args: { amount: amount(), decimals: r.u8('decimals') },
        ...named(a, ['source', 'mint', 'delegate', 'owner']),
        risks: [{ level: 'critical', note: 'lets a delegate move tokens' }],
      };
    case 14:
      return { name: 'MintToChecked', args: { amount: amount(), decimals: r.u8('decimals') }, ...named(a, ['mint', 'account', 'mintAuthority']), risks: [{ level: 'high', note: 'mints tokens' }] };
    case 15:
      return { name: 'BurnChecked', args: { amount: amount(), decimals: r.u8('decimals') }, ...named(a, ['account', 'mint', 'authority']), risks: [{ level: 'high', note: 'burns tokens' }] };
    case 17:
      return { name: 'SyncNative', ...named(a, ['account']) };
    default:
      throw new Error(`token instruction ${tag} is not decoded`);
  }
}

function decodeAta(r: Reader, a: Omit<DecodedAccount, 'name'>[]): Body {
  const tag = r.data.length === 0 ? 0 : r.u8('ata tag');
  const create = ['payer', 'associatedAccount', 'wallet', 'mint', 'systemProgram', 'tokenProgram'];
  if (tag === 0) return { name: 'Create', ...named(a, create), risks: [{ level: 'caution', note: 'creates an associated token account' }] };
  if (tag === 1) return { name: 'CreateIdempotent', ...named(a, create), risks: [{ level: 'caution', note: 'creates an associated token account' }] };
  if (tag === 2) {
    return {
      name: 'RecoverNested',
      ...named(a, ['nestedAccount', 'nestedMint', 'destinationAccount', 'ownerAccount', 'ownerMint', 'wallet', 'tokenProgram']),
      risks: [{ level: 'high', note: 'moves tokens out of a nested associated token account' }],
    };
  }
  throw new Error(`associated token account instruction ${tag} is not decoded`);
}

function decodeComputeBudget(r: Reader, a: Omit<DecodedAccount, 'name'>[]): Body {
  const tag = r.u8('compute budget tag');
  const none = named(a, []);
  if (none.remaining.length) throw new Error('Compute Budget instructions take no accounts');
  switch (tag) {
    case 0:
      return { name: 'RequestUnits', args: { units: r.u32(), additionalFee: r.u32() }, ...none };
    case 1:
      return { name: 'RequestHeapFrame', args: { bytes: r.u32() }, ...none };
    case 2:
      return { name: 'SetComputeUnitLimit', args: { units: r.u32() }, ...none };
    case 3:
      return { name: 'SetComputeUnitPrice', args: { microLamports: r.u64().toString() }, ...none };
    case 4:
      return { name: 'SetLoadedAccountsDataSizeLimit', args: { bytes: r.u32() }, ...none };
    default:
      throw new Error(`Compute Budget instruction ${tag} is not decoded`);
  }
}

// ---------------------------------------------------------------- entry point

export type DecodeOptions = { /** Program ids decoded as MUTAV (the declared ID by default). */ mutavProgramIds?: Address[] };

export function familyOf(programId: Address, o: DecodeOptions = {}): Family {
  const mutav = o.mutavProgramIds ?? [MUTAV_PROGRAM_ADDRESS];
  if (mutav.includes(programId)) return 'mutav';
  if (programId === BPF_LOADER_UPGRADEABLE) return 'loader';
  if (programId === SYSTEM_PROGRAM) return 'system';
  if (programId === TOKEN_PROGRAM) return 'spl-token';
  if (programId === TOKEN_2022_PROGRAM) return 'token-2022';
  if (programId === ASSOCIATED_TOKEN_PROGRAM) return 'ata';
  if (programId === COMPUTE_BUDGET_PROGRAM) return 'compute-budget';
  return 'raw';
}

export function decodeInstruction(ix: ResolvedInstruction, o: DecodeOptions = {}): DecodedInstruction {
  const base = { dataHex: hex(ix.data), dataSha256: sha256Hex(ix.data), args: {}, remaining: [] as DecodedAccount[] };
  const rawAccounts = (): DecodedAccount[] =>
    ix.accounts.map((a, i) => (a ? { name: `accounts[${i}]`, ...a } : { name: `accounts[${i}]`, address: '(lookup table)' as Address, signer: false, writable: false }));
  const raw = (programId: Address, error: string, risks: Risk[] = []): DecodedInstruction => ({
    ...base,
    family: 'raw',
    programId,
    name: 'raw',
    accounts: rawAccounts(),
    error,
    risks: [{ level: 'high', note: `not decoded: ${error}` }, ...risks],
  });
  if (ix.programId === null) return raw('(lookup table)' as Address, 'the program id comes from an address lookup table');
  const programId = ix.programId;
  if (ix.accounts.some((a) => a === null)) return raw(programId, 'an account comes from an address lookup table (refused: every account must be in the message)');
  const accounts = ix.accounts as Omit<DecodedAccount, 'name'>[];
  const family = familyOf(programId, o);
  if (family === 'raw') return raw(programId, `unknown program${KNOWN_PROGRAM_LABELS[programId] ? ` (${KNOWN_PROGRAM_LABELS[programId]})` : ''}`);
  let body: Body;
  try {
    if (family === 'mutav') body = decodeMutav({ ...ix, programId }, accounts);
    else {
      const r = new Reader(ix.data);
      if (family === 'loader') body = decodeLoader(r, accounts);
      else if (family === 'system') body = decodeSystem(r, accounts);
      else if (family === 'spl-token' || family === 'token-2022') body = decodeToken(r, accounts);
      else if (family === 'ata') body = decodeAta(r, accounts);
      else body = decodeComputeBudget(r, accounts);
      r.end('instruction data');
    }
  } catch (e) {
    // A System nonce instruction stays fatal even when its accounts are short.
    const fatal = family === 'system' && ix.data.length >= 4 && [4, 5, 6, 7, 12].includes(new DataView(ix.data.buffer, ix.data.byteOffset).getUint32(0, true));
    const out = raw(programId, `${family} data or accounts do not decode: ${(e as Error).message}`);
    return fatal ? { ...out, fatal: NONCE_FATAL } : out;
  }
  return { ...base, family, programId, args: body.args ?? {}, name: body.name, accounts: body.accounts, remaining: body.remaining ?? [], risks: body.risks ?? [], ...(body.fatal ? { fatal: body.fatal } : {}) };
}
