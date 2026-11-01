/**
 * Proposal intent files (docs/security/verify-proposal.md): what a Squads
 * proposal must contain, written and reviewed in a repo PR before the
 * proposal is created, under
 *
 *   governance/intents/<cluster>/<first 8 chars of the multisig>/<index>.json
 *
 * `parseIntent` validates one strictly (unknown keys refused); `compareVault`
 * and `compareConfig` list every difference between an intent and the
 * decoded on-chain transaction. Values are exact. The only placeholders are
 * `$vault` (an account that must be the multisig's vault at `vaultIndex`) and
 * `$any`, allowed only for the payer accounts in `ANY_ALLOWED`.
 */
import { address, isAddress, type Address } from '@solana/kit';
import { MUTAV_PROGRAM_ADDRESS } from '../../../clients/js/src';
import { ASSOCIATED_TOKEN_PROGRAM, BPF_LOADER_UPGRADEABLE, SYSTEM_PROGRAM, TOKEN_PROGRAM } from '../../devnet/lib/compose';
import { COMPUTE_BUDGET_PROGRAM, DECODED_FAMILIES, TOKEN_2022_PROGRAM, type DecodedAccount, type DecodedInstruction, type Json } from './decode';
import type { ConfigAction } from './squads-tx';

export const INTENT_VERSION = 'mutav-proposal-intent/v1';
export const VAULT = '$vault';
export const ANY = '$any';
/** `<program>.<instruction>.<account>` that may be `$any`: payers only, which must still be a message signer (the vault). */
export const ANY_ALLOWED = new Set(['ata.Create.payer', 'ata.CreateIdempotent.payer', 'loader.ExtendProgram.payer', 'loader.ExtendProgramChecked.payer']);

export type DecodedFamily = (typeof DECODED_FAMILIES)[number];
export type ExpectedDecoded = {
  program: DecodedFamily;
  name: string;
  /** Required for `mutav` only when it differs from the intent's `mutavProgramId`; fixed for the native programs. */
  programId: Address;
  args: Record<string, Json>;
  /** Every named account, exactly; `$vault` or (see `ANY_ALLOWED`) `$any`. */
  accounts: Record<string, string>;
  remainingAccounts: string[];
};
export type ExpectedRaw = {
  program: 'raw';
  programId: Address;
  /** sha256 hex of the instruction data. */
  dataSha256: string;
  accounts: { address: string; signer: boolean; writable: boolean }[];
  /** Why this instruction cannot be decoded (e.g. "Program Metadata IDL write"). */
  reason: string;
};
export type ExpectedInstruction = ExpectedDecoded | ExpectedRaw;
export type ExpectedConfigAction = { name: ConfigAction['name']; args: Record<string, Json> };
export type Upgrade = { programId: Address; buffer: Address; spill: Address; expectedHash: string };

export type Intent = {
  version: typeof INTENT_VERSION;
  cluster: 'devnet' | 'localnet';
  multisig: Address;
  index: bigint;
  title: string;
  mutavProgramId: Address;
  minTimeLockSecs?: number;
  transaction:
    | { kind: 'vault'; vaultIndex: number; ephemeralSigners: number; instructions: ExpectedInstruction[] }
    | { kind: 'config'; actions: ExpectedConfigAction[] };
  upgrade?: Upgrade;
};

const FIXED_PROGRAM: Record<Exclude<DecodedFamily, 'mutav'>, Address> = {
  loader: BPF_LOADER_UPGRADEABLE,
  system: SYSTEM_PROGRAM,
  'spl-token': TOKEN_PROGRAM,
  'token-2022': TOKEN_2022_PROGRAM,
  ata: ASSOCIATED_TOKEN_PROGRAM,
  'compute-budget': COMPUTE_BUDGET_PROGRAM,
};
const CONFIG_ACTIONS = ['AddMember', 'RemoveMember', 'ChangeThreshold', 'SetTimeLock', 'AddSpendingLimit', 'RemoveSpendingLimit', 'SetRentCollector'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates an intent; throws one error listing every problem. Never echoes whole values (a mistaken path may point at a key file). */
export function parseIntent(raw: unknown): Intent {
  const errs: string[] = [];
  const err = (m: string) => errs.push(m);
  if (!isObj(raw)) throw new Error('invalid intent: must be a JSON object');
  const keys = (o: Obj, where: string, allowed: string[], required: string[]) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) err(`${where}: unknown key "${k}"`);
    for (const k of required) if (!(k in o)) err(`${where}: missing "${k}"`);
  };
  const addr = (v: unknown, where: string): Address => {
    if (typeof v !== 'string' || !isAddress(v)) {
      err(`${where}: not a base58 address`);
      return SYSTEM_PROGRAM;
    }
    return address(v);
  };
  const int = (v: unknown, where: string, max: number): number => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) {
      err(`${where}: must be an integer in [0, ${max}]`);
      return 0;
    }
    return v;
  };
  const json = (v: unknown, where: string): Json => {
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (!Number.isSafeInteger(v)) err(`${where}: numbers must be safe integers (write large or fractional values as strings)`);
      return v;
    }
    if (Array.isArray(v)) return v.map((x, i) => json(x, `${where}[${i}]`));
    if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, json(x, `${where}.${k}`)]));
    err(`${where}: not a JSON value`);
    return null;
  };
  const record = (v: unknown, where: string): Record<string, Json> => {
    if (v === undefined) return {};
    if (!isObj(v)) {
      err(`${where}: must be an object`);
      return {};
    }
    return json(v, where) as Record<string, Json>;
  };
  const accountValue = (v: unknown, where: string, anyKey: string): string => {
    if (v === VAULT) return VAULT;
    if (v === ANY) {
      if (!ANY_ALLOWED.has(anyKey)) err(`${where}: "$any" is allowed only for ${[...ANY_ALLOWED].join(', ')}`);
      return ANY;
    }
    return addr(v, where);
  };

  keys(raw, 'intent', ['version', 'cluster', 'multisig', 'index', 'title', 'mutavProgramId', 'minTimeLockSecs', 'transaction', 'upgrade', 'notes'], ['version', 'cluster', 'multisig', 'index', 'title', 'transaction']);
  if (raw.version !== INTENT_VERSION) err(`intent.version: must be "${INTENT_VERSION}"`);
  if (raw.cluster !== 'devnet' && raw.cluster !== 'localnet') err('intent.cluster: must be "devnet" or "localnet" (mainnet is not supported)');
  const multisig = addr(raw.multisig, 'intent.multisig');
  let index = 0n;
  if ((typeof raw.index === 'number' && Number.isSafeInteger(raw.index) && raw.index > 0) || (typeof raw.index === 'string' && /^[1-9]\d{0,19}$/.test(raw.index))) {
    index = BigInt(raw.index as number | string);
    if (index >= 1n << 64n) err('intent.index: out of u64 range');
  } else err('intent.index: must be a positive integer (Squads transaction indexes start at 1)');
  if (typeof raw.title !== 'string' || !raw.title.trim()) err('intent.title: required, describe what the proposal does');
  if (raw.notes !== undefined && typeof raw.notes !== 'string') err('intent.notes: must be a string');
  const mutavProgramId = raw.mutavProgramId === undefined ? MUTAV_PROGRAM_ADDRESS : addr(raw.mutavProgramId, 'intent.mutavProgramId');
  const minTimeLockSecs = raw.minTimeLockSecs === undefined ? undefined : int(raw.minTimeLockSecs, 'intent.minTimeLockSecs', 0xffffffff);

  let transaction: Intent['transaction'] = { kind: 'config', actions: [] };
  const t = raw.transaction;
  if (!isObj(t)) err('intent.transaction: must be an object');
  else if (t.kind === 'vault') {
    keys(t, 'transaction', ['kind', 'vaultIndex', 'ephemeralSigners', 'instructions'], ['kind', 'vaultIndex', 'instructions']);
    const vaultIndex = int(t.vaultIndex, 'transaction.vaultIndex', 255);
    const ephemeralSigners = t.ephemeralSigners === undefined ? 0 : int(t.ephemeralSigners, 'transaction.ephemeralSigners', 255);
    const instructions: ExpectedInstruction[] = [];
    if (!Array.isArray(t.instructions) || t.instructions.length === 0) err('transaction.instructions: must be a non-empty array');
    else
      t.instructions.forEach((ix: unknown, i) => {
        const w = `instructions[${i}]`;
        if (!isObj(ix)) return err(`${w}: must be an object`);
        if (ix.program === 'raw') {
          keys(ix, w, ['program', 'programId', 'dataSha256', 'accounts', 'reason'], ['program', 'programId', 'dataSha256', 'accounts', 'reason']);
          if (typeof ix.dataSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(ix.dataSha256)) err(`${w}.dataSha256: must be 64 hex characters`);
          if (typeof ix.reason !== 'string' || !ix.reason.trim()) err(`${w}.reason: say why this instruction cannot be decoded`);
          const accounts = Array.isArray(ix.accounts)
            ? ix.accounts.map((a: unknown, j) => {
                if (!isObj(a)) {
                  err(`${w}.accounts[${j}]: must be { address, signer, writable }`);
                  return { address: '', signer: false, writable: false };
                }
                keys(a, `${w}.accounts[${j}]`, ['address', 'signer', 'writable'], ['address', 'signer', 'writable']);
                if (typeof a.signer !== 'boolean' || typeof a.writable !== 'boolean') err(`${w}.accounts[${j}]: signer and writable must be booleans`);
                return { address: accountValue(a.address, `${w}.accounts[${j}].address`, ''), signer: a.signer === true, writable: a.writable === true };
              })
            : (err(`${w}.accounts: must be an array`), []);
          instructions.push({ program: 'raw', programId: addr(ix.programId, `${w}.programId`), dataSha256: String(ix.dataSha256).toLowerCase(), accounts, reason: String(ix.reason) });
          return;
        }
        keys(ix, w, ['program', 'programId', 'name', 'args', 'accounts', 'remainingAccounts'], ['program', 'name']);
        if (!(DECODED_FAMILIES as readonly unknown[]).includes(ix.program)) return err(`${w}.program: must be one of ${[...DECODED_FAMILIES, 'raw'].join(', ')}`);
        const program = ix.program as DecodedFamily;
        if (typeof ix.name !== 'string' || !ix.name) err(`${w}.name: required`);
        const name = String(ix.name);
        let programId: Address;
        if (program === 'mutav') programId = ix.programId === undefined ? mutavProgramId : addr(ix.programId, `${w}.programId`);
        else {
          programId = FIXED_PROGRAM[program];
          if (ix.programId !== undefined && ix.programId !== programId) err(`${w}.programId: ${program} is always ${programId}`);
        }
        const accounts: Record<string, string> = {};
        if (ix.accounts !== undefined && !isObj(ix.accounts)) err(`${w}.accounts: must be an object of name -> address`);
        else for (const [k, v] of Object.entries(ix.accounts ?? {})) accounts[k] = accountValue(v, `${w}.accounts.${k}`, `${program}.${name}.${k}`);
        const remainingAccounts: string[] = [];
        if (ix.remainingAccounts !== undefined && !Array.isArray(ix.remainingAccounts)) err(`${w}.remainingAccounts: must be an array`);
        else (ix.remainingAccounts as unknown[] | undefined)?.forEach((v, j) => remainingAccounts.push(accountValue(v, `${w}.remainingAccounts[${j}]`, '')));
        instructions.push({ program, name, programId, args: record(ix.args, `${w}.args`), accounts, remainingAccounts });
      });
    transaction = { kind: 'vault', vaultIndex, ephemeralSigners, instructions };
  } else if (t.kind === 'config') {
    keys(t, 'transaction', ['kind', 'actions'], ['kind', 'actions']);
    const actions: ExpectedConfigAction[] = [];
    if (!Array.isArray(t.actions) || t.actions.length === 0) err('transaction.actions: must be a non-empty array');
    else
      t.actions.forEach((a: unknown, i) => {
        const w = `actions[${i}]`;
        if (!isObj(a)) return err(`${w}: must be an object`);
        keys(a, w, ['name', 'args'], ['name', 'args']);
        if (!CONFIG_ACTIONS.includes(a.name as string)) err(`${w}.name: must be one of ${CONFIG_ACTIONS.join(', ')}`);
        actions.push({ name: a.name as ConfigAction['name'], args: record(a.args, `${w}.args`) });
      });
    transaction = { kind: 'config', actions };
  } else err('transaction.kind: must be "vault" or "config"');

  let upgrade: Upgrade | undefined;
  if (raw.upgrade !== undefined) {
    const u = raw.upgrade;
    if (!isObj(u)) err('intent.upgrade: must be an object');
    else {
      keys(u, 'upgrade', ['programId', 'buffer', 'spill', 'expectedHash'], ['programId', 'buffer', 'spill', 'expectedHash']);
      if (typeof u.expectedHash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(u.expectedHash)) err('upgrade.expectedHash: must be the 64-hex `solana-verify get-executable-hash` of the reproduced build');
      upgrade = { programId: addr(u.programId, 'upgrade.programId'), buffer: addr(u.buffer, 'upgrade.buffer'), spill: addr(u.spill, 'upgrade.spill'), expectedHash: String(u.expectedHash).toLowerCase() };
    }
  }

  // Upgrade consistency (audit S9): one Upgrade, described by `upgrade`, and no authority change beside it.
  if (transaction.kind === 'vault') {
    const loader = transaction.instructions.filter((x): x is ExpectedDecoded => x.program === 'loader');
    const ups = loader.filter((x) => x.name === 'Upgrade');
    if (ups.length > 1) err('an intent may hold at most one loader Upgrade');
    if (ups.length && !upgrade) err('a loader Upgrade needs the "upgrade" block (programId, buffer, spill, expectedHash)');
    if (upgrade && !ups.length) err('"upgrade" is set but no loader Upgrade instruction is listed');
    if (ups.length && upgrade) {
      const a = ups[0]!.accounts;
      if (a.program !== upgrade.programId) err('the Upgrade accounts.program must equal upgrade.programId');
      if (a.buffer !== upgrade.buffer) err('the Upgrade accounts.buffer must equal upgrade.buffer');
      if (a.spill !== upgrade.spill && !(a.spill === VAULT)) err('the Upgrade accounts.spill must equal upgrade.spill');
      if (loader.some((x) => ['SetAuthority', 'SetAuthorityChecked', 'Close'].includes(x.name))) err('an upgrade intent may not also change or close a loader account (audit S9)');
    }
  } else if (upgrade) err('"upgrade" applies to vault transactions only');

  if (errs.length) throw new Error(`invalid intent:\n  ${errs.join('\n  ')}`);
  return {
    version: INTENT_VERSION,
    cluster: raw.cluster as Intent['cluster'],
    multisig,
    index,
    title: String(raw.title),
    mutavProgramId,
    ...(minTimeLockSecs === undefined ? {} : { minTimeLockSecs }),
    transaction,
    ...(upgrade ? { upgrade } : {}),
  };
}

/** The intent path the docs prescribe: `governance/intents/<cluster>/<multisig[0..8]>/<index>.json`. */
export const intentPath = (i: Pick<Intent, 'cluster' | 'multisig' | 'index'>) => `governance/intents/${i.cluster}/${i.multisig.slice(0, 8)}/${i.index}.json`;

// ---------------------------------------------------------------- comparison

const leaf = (v: Json) => (v === null ? 'null' : String(v));
const show = (v: Json | undefined) => (v === undefined ? '(absent)' : JSON.stringify(v));

/**
 * Differences between an expected and a decoded JSON value. Numbers and
 * decimal strings compare equal (`1000` and `"1000"`): decoded u64s are
 * strings; everything else is exact, object keys included.
 */
export function diffJson(path: string, want: Json | undefined, got: Json | undefined, out: string[]) {
  if (want === undefined || got === undefined) {
    if (want !== got) out.push(`${path}: expected ${show(want)}, got ${show(got)}`);
    return;
  }
  const wo = typeof want === 'object' && want !== null;
  const go = typeof got === 'object' && got !== null;
  if (!wo || !go) {
    if (wo !== go || leaf(want) !== leaf(got) || (typeof want === 'boolean') !== (typeof got === 'boolean')) out.push(`${path}: expected ${show(want)}, got ${show(got)}`);
    return;
  }
  if (Array.isArray(want) !== Array.isArray(got)) return void out.push(`${path}: expected ${show(want)}, got ${show(got)}`);
  if (Array.isArray(want) && Array.isArray(got)) {
    if (want.length !== got.length) out.push(`${path}: expected ${want.length} item(s), got ${got.length}`);
    for (let i = 0; i < Math.min(want.length, got.length); i++) diffJson(`${path}[${i}]`, want[i], got[i], out);
    return;
  }
  const w = want as Record<string, Json>;
  const g = got as Record<string, Json>;
  for (const k of new Set([...Object.keys(w), ...Object.keys(g)])) diffJson(path ? `${path}.${k}` : k, w[k], g[k], out);
}

const resolve = (v: string, vault: Address) => (v === VAULT ? vault : v);
const label = (d: DecodedInstruction) => (d.family === 'raw' ? `raw instruction for ${d.programId}` : `${d.family}.${d.name}`);

function compareAccounts(where: string, want: Record<string, string>, got: DecodedAccount[], vault: Address, out: string[]) {
  const g = new Map(got.map((a) => [a.name, a.address]));
  for (const [k, v] of Object.entries(want)) {
    const a = g.get(k);
    if (a === undefined) out.push(`${where} account ${k}: expected ${resolve(v, vault)}, absent`);
    else if (v !== ANY && resolve(v, vault) !== a) out.push(`${where} account ${k}: expected ${resolve(v, vault)}, got ${a}`);
  }
  for (const a of got) if (!(a.name in want)) out.push(`${where} account ${a.name}: ${a.address} is not in the intent (every account must be named)`);
}

/** Differences between one expected and one decoded instruction. */
export function compareInstruction(where: string, want: ExpectedInstruction, got: DecodedInstruction, vault: Address): string[] {
  const out: string[] = [];
  if (want.program === 'raw') {
    if (got.family !== 'raw') return [`${where}: decodes as ${label(got)}; name it in the intent instead of listing it raw`];
    if (got.programId !== want.programId) out.push(`${where} program: expected ${want.programId}, got ${got.programId}`);
    if (got.dataSha256 !== want.dataSha256) out.push(`${where} data sha256: expected ${want.dataSha256}, got ${got.dataSha256}`);
    if (got.accounts.length !== want.accounts.length) out.push(`${where}: expected ${want.accounts.length} account(s), got ${got.accounts.length}`);
    want.accounts.forEach((a, i) => {
      const b = got.accounts[i];
      if (!b) return;
      if (a.address !== ANY && resolve(a.address, vault) !== b.address) out.push(`${where} accounts[${i}]: expected ${resolve(a.address, vault)}, got ${b.address}`);
      if (a.signer !== b.signer || a.writable !== b.writable) out.push(`${where} accounts[${i}]: expected signer=${a.signer} writable=${a.writable}, got signer=${b.signer} writable=${b.writable}`);
    });
    return out;
  }
  if (got.family === 'raw') return [`${where}: expected ${want.program}.${want.name}, got an undecodable ${label(got)} (${got.error})`];
  if (got.family !== want.program || got.name !== want.name) return [`${where}: expected ${want.program}.${want.name}, got ${label(got)}`];
  if (got.programId !== want.programId) out.push(`${where} program: expected ${want.programId}, got ${got.programId}`);
  compareAccounts(where, want.accounts, got.accounts, vault, out);
  if (got.remaining.length !== want.remainingAccounts.length) out.push(`${where}: expected ${want.remainingAccounts.length} remaining account(s), got ${got.remaining.length}`);
  want.remainingAccounts.forEach((a, i) => {
    const b = got.remaining[i];
    if (b && resolve(a, vault) !== b.address) out.push(`${where} remaining[${i}]: expected ${resolve(a, vault)}, got ${b.address}`);
  });
  const argDiffs: string[] = [];
  diffJson('', want.args, got.args, argDiffs);
  out.push(...argDiffs.map((d) => `${where} arg ${d}`));
  return out;
}

/** Differences between an intent's instruction list and the decoded vault message, in order. */
export function compareVault(want: ExpectedInstruction[], got: DecodedInstruction[], vault: Address): string[] {
  const out: string[] = [];
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) out.push(...compareInstruction(`instruction #${i}`, want[i]!, got[i]!, vault));
  for (let i = n; i < got.length; i++) out.push(`instruction #${i}: unexpected extra ${label(got[i]!)}`);
  for (let i = n; i < want.length; i++) out.push(`instruction #${i}: missing ${want[i]!.program}.${want[i]!.program === 'raw' ? want[i]!.programId : (want[i] as ExpectedDecoded).name}`);
  if (out.length && want.length === got.length) {
    // Same instructions, other order? Each actual one must match a distinct expected one.
    const free = want.map((_, i) => i);
    const permuted = got.every((g) => {
      const k = free.findIndex((j) => compareInstruction('', want[j]!, g, vault).length === 0);
      if (k < 0) return false;
      free.splice(k, 1);
      return true;
    });
    if (permuted) out.push('the transaction holds exactly the intended instructions, but in a different order (order matters: refuse it)');
  }
  return out;
}

/** Differences between an intent's config actions and the decoded ConfigTransaction. */
export function compareConfig(want: ExpectedConfigAction[], got: { name: string; args: Record<string, Json> }[]): string[] {
  const out: string[] = [];
  const n = Math.min(want.length, got.length);
  for (let i = 0; i < n; i++) {
    const w = want[i]!;
    const g = got[i]!;
    if (w.name !== g.name) {
      out.push(`action #${i}: expected ${w.name}, got ${g.name}`);
      continue;
    }
    const d: string[] = [];
    diffJson('', w.args, g.args, d);
    out.push(...d.map((x) => `action #${i} ${g.name} arg ${x}`));
  }
  for (let i = n; i < got.length; i++) out.push(`action #${i}: unexpected extra ${got[i]!.name}`);
  for (let i = n; i < want.length; i++) out.push(`action #${i}: missing ${want[i]!.name}`);
  return out;
}
