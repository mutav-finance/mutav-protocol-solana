import { describe, expect, test } from 'bun:test';
import { AccountRole, createNoopSigner, getAddressEncoder, type Instruction } from '@solana/kit';
import { getProposeAdminInstruction, getSetConfigInstruction, MUTAV_PROGRAM_ADDRESS } from '../../clients/js/src';
import { ASSOCIATED_TOKEN_PROGRAM, BPF_LOADER_UPGRADEABLE, SYSTEM_PROGRAM, TOKEN_PROGRAM } from '../devnet/lib/compose';
import { composeUpgrade } from '../release/upgrade-proposal';
import { COMPUTE_BUDGET_PROGRAM, decodeInstruction, resolveMessage, TOKEN_2022_PROGRAM, type ResolvedInstruction } from '../release/lib/decode';
import { A, B, C, testAddress } from './fixtures';
import { compileMessage } from './squads-tx-fixtures';

const VAULT = testAddress(40);
const le = (v: bigint | number, n: number) => {
  const b = BigInt(v);
  return Array.from({ length: n }, (_, i) => Number((b >> BigInt(8 * i)) & 0xffn));
};
const ro = (address: typeof A) => ({ address, role: AccountRole.READONLY });
const w = (address: typeof A) => ({ address, role: AccountRole.WRITABLE });
const ws = (address: typeof A) => ({ address, role: AccountRole.WRITABLE_SIGNER });

/** Compiles one instruction into a message and decodes it back, as the CLI does. */
const roundTrip = (ix: Instruction, mutavProgramIds?: (typeof A)[]) => decodeInstruction(resolveMessage(compileMessage(VAULT, [ix]))[0]!, mutavProgramIds ? { mutavProgramIds } : {});

describe('MUTAV (Codama client)', () => {
  test('set_config: named args and accounts, high risk', () => {
    const ix = getSetConfigInstruction({
      admin: createNoopSigner(VAULT),
      config: A,
      state: B,
      treasuryAccount: C,
      paymentsAccount: testAddress(7),
      eventAuthority: testAddress(8),
      program: MUTAV_PROGRAM_ADDRESS,
      params: [{ __kind: 'MaxTvl', fields: [5_000_000_000n] }],
    });
    const d = roundTrip(ix);
    expect(d.family).toBe('mutav');
    expect(d.name).toBe('set_config');
    expect(d.args).toEqual({ params: [{ __kind: 'MaxTvl', fields: ['5000000000'] }] });
    expect(d.accounts.map((a) => [a.name, a.address])).toEqual([
      ['admin', VAULT],
      ['config', A],
      ['state', B],
      ['treasuryAccount', C],
      ['paymentsAccount', testAddress(7)],
      ['eventAuthority', testAddress(8)],
      ['program', MUTAV_PROGRAM_ADDRESS],
    ]);
    expect(d.accounts[0]).toMatchObject({ signer: true });
    expect(d.risks[0]!.level).toBe('high');
  });

  test('propose_admin is critical; a deployed program id decodes when named', () => {
    const deployed = testAddress(30);
    const ix = getProposeAdminInstruction({ admin: createNoopSigner(VAULT), config: A, eventAuthority: B, program: deployed, key: C }, { programAddress: deployed });
    expect(roundTrip(ix).family).toBe('raw'); // not the declared ID: unknown program
    const d = roundTrip(ix, [deployed]);
    expect(d.name).toBe('propose_admin');
    expect(d.args).toEqual({ key: C });
    expect(d.risks[0]!.level).toBe('critical');
  });

  test('trailing data or an unknown discriminator is raw', () => {
    const ix = getProposeAdminInstruction({ admin: createNoopSigner(VAULT), config: A, eventAuthority: B, program: MUTAV_PROGRAM_ADDRESS, key: C });
    const extra = roundTrip({ ...ix, data: new Uint8Array([...ix.data, 0]) });
    expect(extra.family).toBe('raw');
    expect(extra.error).toContain('trailing');
    const unknown = roundTrip({ ...ix, data: new Uint8Array(16) });
    expect(unknown.family).toBe('raw');
  });
});

describe('BPF Loader Upgradeable', () => {
  test('ExtendProgramChecked and Upgrade with named accounts', async () => {
    const ixs = await composeUpgrade({ programId: A, buffer: B, vault: VAULT, spill: VAULT, soLen: 2000, programDataLen: 45 + 1000 });
    const [ext, up] = ixs.map((ix) => roundTrip(ix));
    expect(ext!.name).toBe('ExtendProgramChecked');
    expect(ext!.args).toEqual({ additionalBytes: 1000 });
    expect(ext!.accounts.map((a) => a.name)).toEqual(['programData', 'program', 'authority', 'systemProgram', 'payer']);
    expect(up!.name).toBe('Upgrade');
    expect(up!.accounts.find((a) => a.name === 'buffer')!.address).toBe(B);
    expect(up!.accounts.find((a) => a.name === 'authority')!.address).toBe(VAULT);
    expect(up!.risks[0]!.level).toBe('critical');
  });

  test('SetAuthority and SetAuthorityChecked are critical; Close names its optional accounts', () => {
    const set = roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [w(A), { address: VAULT, role: AccountRole.READONLY_SIGNER }, ro(C)], data: new Uint8Array(le(4, 4)) });
    expect(set.name).toBe('SetAuthority');
    expect(set.accounts.map((a) => a.name)).toEqual(['account', 'currentAuthority', 'newAuthority']);
    expect(set.risks[0]!.level).toBe('critical');
    const checked = roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [w(A), { address: VAULT, role: AccountRole.READONLY_SIGNER }, { address: C, role: AccountRole.READONLY_SIGNER }], data: new Uint8Array(le(7, 4)) });
    expect(checked.name).toBe('SetAuthorityChecked');
    const close = roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [w(A), w(B)], data: new Uint8Array(le(5, 4)) });
    expect(close.name).toBe('Close');
    expect(close.accounts.map((a) => a.name)).toEqual(['account', 'recipient']);
  });

  test('Write reports offset, length and a hash of the bytes', () => {
    const d = roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [w(A), { address: VAULT, role: AccountRole.READONLY_SIGNER }], data: new Uint8Array([...le(1, 4), ...le(16, 4), ...le(3, 8), 1, 2, 3]) });
    expect(d.name).toBe('Write');
    expect(d.args).toMatchObject({ offset: 16, length: 3 });
  });

  test('an unknown tag or short accounts is raw', () => {
    expect(roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [], data: new Uint8Array(le(42, 4)) }).family).toBe('raw');
    expect(roundTrip({ programAddress: BPF_LOADER_UPGRADEABLE, accounts: [w(A)], data: new Uint8Array(le(3, 4)) }).error).toContain('at least 7');
  });
});

describe('System', () => {
  test('Transfer with lamports', () => {
    const d = roundTrip({ programAddress: SYSTEM_PROGRAM, accounts: [ws(VAULT), w(A)], data: new Uint8Array([...le(2, 4), ...le(1_000_000_000n, 8)]) });
    expect(d).toMatchObject({ family: 'system', name: 'Transfer', args: { lamports: '1000000000' } });
    expect(d.fatal).toBeUndefined();
  });
  test('CreateAccount names its owner', () => {
    const d = roundTrip({ programAddress: SYSTEM_PROGRAM, accounts: [ws(VAULT), { address: A, role: AccountRole.WRITABLE_SIGNER }], data: new Uint8Array([...le(0, 4), ...le(1, 8), ...le(165, 8), ...getAddressEncoder().encode(TOKEN_PROGRAM)]) });
    expect(d.args).toEqual({ lamports: '1', space: '165', owner: TOKEN_PROGRAM });
  });
  test.each([
    ['AdvanceNonceAccount', [...le(4, 4)], 3],
    ['WithdrawNonceAccount', [...le(5, 4), ...le(1, 8)], 5],
    ['InitializeNonceAccount', [...le(6, 4), ...getAddressEncoder().encode(VAULT)], 3],
    ['AuthorizeNonceAccount', [...le(7, 4), ...getAddressEncoder().encode(VAULT)], 2],
    ['UpgradeNonceAccount', [...le(12, 4)], 1],
  ])('%s is fatal', (name, data, n) => {
    const accounts = [w(A), ro(B), ws(VAULT), ro(C), ro(testAddress(9))].slice(0, n as number);
    const d = roundTrip({ programAddress: SYSTEM_PROGRAM, accounts, data: new Uint8Array(data as number[]) });
    expect(d.name).toBe(name as string);
    expect(d.fatal).toContain('durable nonce');
  });
  test('a nonce instruction stays fatal when its accounts do not decode', () => {
    const d = roundTrip({ programAddress: SYSTEM_PROGRAM, accounts: [], data: new Uint8Array(le(4, 4)) });
    expect(d.family).toBe('raw');
    expect(d.fatal).toContain('durable nonce');
  });
});

describe('SPL Token, Token-2022, ATA, Compute Budget', () => {
  test('TransferChecked on both token programs', () => {
    for (const p of [TOKEN_PROGRAM, TOKEN_2022_PROGRAM]) {
      const d = roundTrip({ programAddress: p, accounts: [w(A), ro(B), w(C), { address: VAULT, role: AccountRole.READONLY_SIGNER }], data: new Uint8Array([12, ...le(250, 8), 6]) });
      expect(d).toMatchObject({ name: 'TransferChecked', args: { amount: '250', decimals: 6 } });
      expect(d.accounts.map((a) => a.name)).toEqual(['source', 'mint', 'destination', 'authority']);
    }
  });
  test('Approve and SetAuthority are critical', () => {
    expect(roundTrip({ programAddress: TOKEN_PROGRAM, accounts: [w(A), ro(B), ws(VAULT)], data: new Uint8Array([4, ...le(1, 8)]) }).risks[0]!.level).toBe('critical');
    const s = roundTrip({ programAddress: TOKEN_PROGRAM, accounts: [w(A), ws(VAULT)], data: new Uint8Array([6, 2, 1, ...getAddressEncoder().encode(B)]) });
    expect(s.args).toEqual({ authorityType: 'AccountOwner', newAuthority: B });
    const none = roundTrip({ programAddress: TOKEN_PROGRAM, accounts: [w(A), ws(VAULT)], data: new Uint8Array([6, 3, 0]) });
    expect(none.args).toEqual({ authorityType: 'CloseAccount', newAuthority: null });
  });
  test('ATA Create (empty data) and CreateIdempotent', () => {
    const accounts = [ws(VAULT), w(A), ro(B), ro(C), ro(SYSTEM_PROGRAM), ro(TOKEN_PROGRAM)];
    expect(roundTrip({ programAddress: ASSOCIATED_TOKEN_PROGRAM, accounts, data: new Uint8Array() }).name).toBe('Create');
    const d = roundTrip({ programAddress: ASSOCIATED_TOKEN_PROGRAM, accounts, data: new Uint8Array([1]) });
    expect(d.name).toBe('CreateIdempotent');
    expect(d.accounts[0]).toMatchObject({ name: 'payer', address: VAULT });
  });
  test('Compute Budget', () => {
    expect(roundTrip({ programAddress: COMPUTE_BUDGET_PROGRAM, data: new Uint8Array([2, ...le(400_000, 4)]) })).toMatchObject({ name: 'SetComputeUnitLimit', args: { units: 400000 } });
    expect(roundTrip({ programAddress: COMPUTE_BUDGET_PROGRAM, data: new Uint8Array([3, ...le(5, 8)]) }).args).toEqual({ microLamports: '5' });
    expect(roundTrip({ programAddress: COMPUTE_BUDGET_PROGRAM, data: new Uint8Array([2, 1]) }).family).toBe('raw');
  });
});

describe('raw', () => {
  test('an unknown program is raw with its data hash and every account', () => {
    const d = roundTrip({ programAddress: testAddress(50), accounts: [w(A), ws(VAULT)], data: new Uint8Array([1, 2, 3]) });
    expect(d.family).toBe('raw');
    expect(d.dataSha256).toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
    expect(d.accounts.map((a) => [a.address, a.signer, a.writable])).toEqual([
      [A, false, true],
      [VAULT, true, true],
    ]);
  });
  test('an account from an address lookup table is raw', () => {
    const ix: ResolvedInstruction = { programId: SYSTEM_PROGRAM, accounts: [null], data: new Uint8Array(le(2, 4)) };
    expect(decodeInstruction(ix).error).toContain('address lookup table');
  });
});
