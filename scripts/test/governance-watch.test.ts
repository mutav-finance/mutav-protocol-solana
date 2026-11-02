import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAddressEncoder, type Address } from '@solana/kit';
import { getVaultConfigEncoder } from '../../clients/js/src';
import { programDataAddress } from '../devnet/lib/compose';
import { BPF_LOADER_UPGRADEABLE_ID, executableHash } from '../devnet/lib/hash';
import { DEFAULT_PUBKEY, SQUADS_V4_PROGRAM } from '../devnet/lib/squads';
import {
  balanceDelta,
  checkConfig,
  checkMultisig,
  checkNonces,
  checkOutflows,
  checkProgram,
  checkProposals,
  squadsProposalAddress,
  squadsTransactionAddress,
} from '../governance/lib/checks';
import { intentPath, parseExpectedState, type ExpectedState } from '../governance/lib/expected';
import type { SignatureInfo, TxBalances, WatchSource } from '../governance/lib/source';
import { exitCode, formatReport, runChecks } from '../governance/watch';
import { A, B, C, multisigBytes } from './fixtures';

const RAW = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'governance', 'expected-state.devnet.json'), 'utf8'));
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 4, 0, 0]);
const NOW = 1_800_000_000;

/** The committed devnet expected state, with the fixture program bytes' hash. */
function expected(): ExpectedState {
  const e = parseExpectedState(structuredClone(RAW));
  e.program.executableHash = executableHash(ELF);
  return e;
}

function msBytes(m: ExpectedState['multisigs']['admin'], o: Parameters<typeof multisigBytes>[0] = {}, txIndex?: bigint) {
  const b = multisigBytes({
    threshold: m.threshold,
    timeLock: m.timeLockSecs,
    members: m.members.map((x) => [x.key, x.permissions] as [Address, number]),
    ...o,
  });
  // transaction_index sits after discriminator, create_key, config_authority, threshold and time_lock.
  new DataView(b.buffer).setBigUint64(8 + 32 + 32 + 2 + 4, txIndex ?? m.lastKnownTransactionIndex, true);
  return b;
}

function programDataBytes(authority: Address | null, elf = ELF) {
  const b = new Uint8Array(45 + elf.length + 6);
  new DataView(b.buffer).setUint32(0, 3, true);
  if (authority) {
    b[12] = 1;
    b.set(getAddressEncoder().encode(authority), 13);
  }
  b.set(elf, 45);
  return b;
}

type ConfigOverrides = Partial<Record<string, unknown>> & { caps?: Partial<Record<string, unknown>> };

function configBytes(e: ExpectedState, o: ConfigOverrides = {}) {
  const c = e.config;
  const { caps, ...rest } = o;
  const guardians = [...c.guardians, DEFAULT_PUBKEY, DEFAULT_PUBKEY, DEFAULT_PUBKEY].slice(0, 3);
  return new Uint8Array(
    getVaultConfigEncoder().encode({
      version: 1,
      bump: 255,
      authorityBump: 254,
      admin: c.admin,
      operator: c.operator,
      pauser: c.pauser,
      reserveMint: c.reserveMint,
      reserveTokenProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address,
      reserveDecimals: 6,
      shareMint: A,
      coverageRatioBps: c.coverageRatioBps,
      feeTakeBps: c.feeTakeBps,
      paymentsAccount: c.paymentsAccount,
      treasuryAccount: c.treasuryAccount,
      investorAllowlistRoot: new Uint8Array(32),
      caps: { ...c.caps, reserved: new Uint8Array(32), ...(caps ?? {}) } as never,
      paused: c.paused,
      featureFlags: 0n,
      mutavCapitalWallet: B,
      adapterCount: 0,
      adapterBitmap: 0,
      pendingAdmin: DEFAULT_PUBKEY,
      pendingAdminExpiresAt: 0n,
      pendingOperator: DEFAULT_PUBKEY,
      pendingOperatorExpiresAt: 0n,
      pendingPauser: DEFAULT_PUBKEY,
      pendingPauserExpiresAt: 0n,
      guardians,
      disabledOps: 0,
      kycAttester: DEFAULT_PUBKEY,
      attestationProgram: DEFAULT_PUBKEY,
      requiredAttestationType: new Uint8Array(32),
      attesterEpoch: 0,
      reserved: new Uint8Array(411),
      ...(rest as object),
    }),
  );
}

type Fake = {
  accounts: Map<string, { owner: Address; data: Uint8Array }>;
  existing: Set<string>;
  nonces: Record<string, Address[]>;
  sigs: SignatureInfo[];
  txs: Record<string, TxBalances>;
  failOn?: keyof WatchSource;
};

function source(f: Fake): WatchSource {
  const guard = (k: keyof WatchSource) => {
    if (f.failOn === k) throw new Error('fetch failed: 429 Too Many Requests');
  };
  return {
    async account(a) {
      guard('account');
      return f.accounts.get(a) ?? null;
    },
    async exist(addrs) {
      guard('exist');
      return addrs.map((a) => f.existing.has(a));
    },
    async nonceAccountsWithAuthority(a) {
      guard('nonceAccountsWithAuthority');
      return f.nonces[a] ?? [];
    },
    async signatures(_a, o) {
      guard('signatures');
      const from = o.before ? f.sigs.findIndex((s) => s.signature === o.before) + 1 : 0;
      return f.sigs.slice(from, from + o.limit);
    },
    async transaction(s) {
      guard('transaction');
      return f.txs[s] ?? null;
    },
  };
}

/** A chain that matches the expected state exactly. */
async function matching(e: ExpectedState): Promise<Fake> {
  const accounts = new Map<string, { owner: Address; data: Uint8Array }>();
  accounts.set(e.multisigs.admin.address, { owner: SQUADS_V4_PROGRAM, data: msBytes(e.multisigs.admin) });
  accounts.set(e.multisigs.upgrade.address, { owner: SQUADS_V4_PROGRAM, data: msBytes(e.multisigs.upgrade) });
  accounts.set(e.program.id, { owner: BPF_LOADER_UPGRADEABLE_ID, data: new Uint8Array(36) });
  accounts.set(await programDataAddress(e.program.id), { owner: BPF_LOADER_UPGRADEABLE_ID, data: programDataBytes(e.program.upgradeAuthority) });
  accounts.set(e.config.address, { owner: e.program.id, data: configBytes(e) });
  return { accounts, existing: new Set(), nonces: {}, sigs: [], txs: {} };
}

const noIntents = () => false;

describe('expected state', () => {
  test('the committed devnet file parses', () => {
    const e = parseExpectedState(RAW);
    expect(e.cluster).toBe('devnet');
    expect(e.config.caps.maxTvl).toBe(1_000_000_000_000n);
  });

  test('refuses mainnet, bad addresses and bad hashes', () => {
    expect(() => parseExpectedState({ ...RAW, cluster: 'mainnet' })).toThrow('mainnet is refused');
    const bad = structuredClone(RAW);
    bad.config.admin = 'not-an-address';
    expect(() => parseExpectedState(bad)).toThrow('config.admin');
    const h = structuredClone(RAW);
    h.program.executableHash = 'abc';
    expect(() => parseExpectedState(h)).toThrow('executableHash');
  });

  test('intent path convention', () => {
    expect(intentPath('devnet', 'HrYif2YLwKJc5aMMp6qQjd9WhdkD9JBjajjGyr4a92xR' as Address, 12n)).toBe('governance/intents/devnet/HrYif2YL/12.json');
  });
});

describe('runChecks', () => {
  test('a matching chain has no findings and exits 0', async () => {
    const e = expected();
    const r = await runChecks(source(await matching(e)), e, { nowSecs: NOW, intentExists: noIntents });
    expect(r.errors).toEqual([]);
    expect(r.findings).toEqual([]);
    expect(exitCode(r)).toBe(0);
    expect(formatReport(r, { cluster: 'devnet', rpcHost: 'h', expectedPath: 'p', at: new Date(0) }, (s) => s)).toContain('Result: OK');
  });

  test('an RPC failure exits 2 and is reported, with the URL redacted', async () => {
    const e = expected();
    const f = await matching(e);
    f.failOn = 'account';
    const r = await runChecks(source(f), e, { nowSecs: NOW, intentExists: noIntents });
    expect(exitCode(r)).toBe(2);
    expect(r.errors.map((x) => x.check)).toContain('program');
    const report = formatReport(
      { ...r, errors: [{ check: 'setup', message: 'GET https://rpc.example/TOKEN123 failed' }] },
      { cluster: 'devnet', rpcHost: 'rpc.example', expectedPath: 'p', at: new Date(0) },
      (s) => s.split('https://rpc.example/TOKEN123').join('rpc.example'),
    );
    expect(report).toContain('COULD NOT COMPLETE');
    expect(report).not.toContain('TOKEN123');
  });

  test('findings without errors exit 1', async () => {
    const e = expected();
    const f = await matching(e);
    f.nonces[e.multisigs.admin.members[0]!.key] = [C];
    const r = await runChecks(source(f), e, { nowSecs: NOW, intentExists: noIntents });
    expect(exitCode(r)).toBe(1);
  });
});

describe('checkMultisig', () => {
  const run = async (o: Parameters<typeof multisigBytes>[0], owner: Address = SQUADS_V4_PROGRAM) => {
    const e = expected();
    const m = e.multisigs.admin;
    const f = await matching(e);
    f.accounts.set(m.address, { owner, data: msBytes(m, o) });
    return (await checkMultisig(source(f), 'admin', m)).findings;
  };

  test('each kind of drift is CRITICAL', async () => {
    const m = expected().multisigs.admin;
    const keys = m.members.map((x) => x.key);
    expect((await run({ threshold: 1 }))[0]).toMatchObject({ severity: 'CRITICAL', message: expect.stringContaining('threshold is 1') });
    expect((await run({ timeLock: 0 }))[0]?.message).toContain('time_lock is 0s');
    expect((await run({ configAuthority: A }))[0]?.message).toContain(`config_authority is ${A}`);
    const perms = await run({ members: [[keys[0]!, 7], [keys[1]!, 1]] });
    expect(perms[0]?.message).toContain('has permissions 1, expected 7');
    const added = await run({ members: [[keys[0]!, 7], [keys[1]!, 7], [A, 7]] });
    expect(added[0]?.message).toContain(`unexpected member ${A}`);
    const removed = await run({ members: [[keys[0]!, 7]] });
    expect(removed[0]?.message).toContain(`member ${keys[1]} is missing`);
    expect((await run({}, A))[0]?.message).toContain('not the Squads v4 program');
    for (const f of [...perms, ...added, ...removed]) expect(f.severity).toBe('CRITICAL');
  });

  test('a vault that does not derive from the multisig is CRITICAL', async () => {
    const e = expected();
    e.multisigs.admin.vault = A;
    const out = (await checkMultisig(source(await matching(e)), 'admin', e.multisigs.admin)).findings;
    expect(out[0]?.message).toContain('derives to');
  });
});

describe('checkProposals', () => {
  test('no new index, no finding', async () => {
    const e = expected();
    const m = e.multisigs.admin;
    expect(await checkProposals(source(await matching(e)), 'devnet', 'admin', m, m.lastKnownTransactionIndex, noIntents)).toEqual([]);
  });

  test('a new index without an intent file is HIGH and names verify-proposal', async () => {
    const e = expected();
    const m = e.multisigs.admin;
    const f = await matching(e);
    const next = m.lastKnownTransactionIndex + 1n;
    f.existing.add(await squadsTransactionAddress(m.address, next));
    f.existing.add(await squadsProposalAddress(m.address, next));
    const out = await checkProposals(source(f), 'devnet', 'admin', m, next, noIntents);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'HIGH' });
    expect(out[0]!.message).toContain('unexpected proposal');
    expect(out[0]!.message).toContain(intentPath('devnet', m.address, next));
    expect(out[0]!.message).toContain('bun run verify-proposal');
    expect(out[0]!.message).toContain('transaction account present, proposal account present');
  });

  test('a new index with its intent committed is still HIGH, as a new proposal', async () => {
    const e = expected();
    const m = e.multisigs.admin;
    const next = m.lastKnownTransactionIndex + 1n;
    const want = intentPath('devnet', m.address, next);
    const out = await checkProposals(source(await matching(e)), 'devnet', 'admin', m, next, (p) => p === want);
    expect(out[0]!.severity).toBe('HIGH');
    expect(out[0]!.message).toContain('new proposal');
    expect(out[0]!.message).toContain('is committed');
  });

  test('a chain index below the acknowledged one is HIGH; long runs are bounded', async () => {
    const e = expected();
    const m = e.multisigs.admin;
    const src = source(await matching(e));
    expect((await checkProposals(src, 'devnet', 'admin', m, m.lastKnownTransactionIndex - 1n, noIntents))[0]!.message).toContain('below lastKnownTransactionIndex');
    const many = await checkProposals(src, 'devnet', 'admin', m, m.lastKnownTransactionIndex + 50n, noIntents);
    expect(many).toHaveLength(21);
    expect(many.at(-1)!.message).toContain('30 more new indexes');
  });

  test('runChecks reads the index from the multisig account', async () => {
    const e = expected();
    const f = await matching(e);
    f.accounts.set(e.multisigs.upgrade.address, { owner: SQUADS_V4_PROGRAM, data: msBytes(e.multisigs.upgrade, {}, e.multisigs.upgrade.lastKnownTransactionIndex + 2n) });
    const r = await runChecks(source(f), e, { nowSecs: NOW, intentExists: noIntents });
    expect(r.findings.filter((x) => x.check === 'proposals upgrade')).toHaveLength(2);
  });
});

describe('checkProgram', () => {
  test('a changed upgrade authority or executable hash is CRITICAL', async () => {
    const e = expected();
    const f = await matching(e);
    const pd = await programDataAddress(e.program.id);
    f.accounts.set(pd, { owner: BPF_LOADER_UPGRADEABLE_ID, data: programDataBytes(A) });
    expect((await checkProgram(source(f), e.program))[0]).toMatchObject({ severity: 'CRITICAL', message: expect.stringContaining(`upgrade authority is ${A}`) });
    f.accounts.set(pd, { owner: BPF_LOADER_UPGRADEABLE_ID, data: programDataBytes(null) });
    expect((await checkProgram(source(f), e.program))[0]!.message).toContain('none (immutable)');
    f.accounts.set(pd, { owner: BPF_LOADER_UPGRADEABLE_ID, data: programDataBytes(e.program.upgradeAuthority, new Uint8Array([9, 9, 9])) });
    expect((await checkProgram(source(f), e.program))[0]!.message).toContain('an upgrade happened');
  });

  test('trailing zeros do not change the hash; a missing program is CRITICAL', async () => {
    const e = expected();
    const f = await matching(e);
    expect(await checkProgram(source(f), e.program)).toEqual([]);
    f.accounts.delete(e.program.id);
    expect((await checkProgram(source(f), e.program))[0]!.message).toContain('not found');
  });
});

describe('checkConfig', () => {
  const run = async (o: ConfigOverrides) => {
    const e = expected();
    const f = await matching(e);
    f.accounts.set(e.config.address, { owner: e.program.id, data: configBytes(e, o) });
    return checkConfig(source(f), e);
  };

  test('roles, pending handovers, payments and treasury are CRITICAL', async () => {
    for (const o of [
      { admin: A },
      { operator: A },
      { pauser: A },
      { paymentsAccount: A },
      { treasuryAccount: A },
      { guardians: [A, DEFAULT_PUBKEY, DEFAULT_PUBKEY] },
      { pendingOperator: A },
    ]) {
      const out = await run(o);
      expect(out).toHaveLength(1);
      expect(out[0]!.severity).toBe('CRITICAL');
    }
  });

  test('caps, coverage ratio, fee take and the pause flag are HIGH', async () => {
    for (const o of [{ caps: { maxClaimPerCall: 1n } }, { caps: { maxNavMoveBps: 1 } }, { coverageRatioBps: 1000 }, { feeTakeBps: 0 }, { paused: true }]) {
      const out = await run(o);
      expect(out).toHaveLength(1);
      expect(out[0]!.severity).toBe('HIGH');
    }
    expect((await run({ caps: { maxClaimPerCall: 1n } }))[0]!.message).toContain('caps.maxClaimPerCall is 1, expected 15000000000');
  });

  test('a config owned by another program is CRITICAL', async () => {
    const e = expected();
    const f = await matching(e);
    f.accounts.set(e.config.address, { owner: A, data: configBytes(e) });
    expect((await checkConfig(source(f), e))[0]!.message).toContain('not the program');
  });
});

describe('checkNonces', () => {
  test('a nonce account with a member as authority is HIGH; none, no finding', async () => {
    const e = expected();
    const f = await matching(e);
    const members = e.multisigs.upgrade.members.map((x) => x.key);
    expect(await checkNonces(source(f), members)).toEqual([]);
    f.nonces[members[1]!] = [B];
    const out = await checkNonces(source(f), [...members, members[1]!]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ severity: 'HIGH', message: expect.stringContaining(`durable nonce account ${B}`) });
  });
});

describe('checkOutflows', () => {
  const e = expected();
  const acct = e.reserve.tokenAccount;
  const tx = (pre: bigint, post: bigint, extraKeys = 0): TxBalances => ({
    accountKeys: [...Array.from({ length: extraKeys }, (_, i) => `K${i}`), acct],
    pre: [{ accountIndex: extraKeys, amount: String(pre) }],
    post: [{ accountIndex: extraKeys, amount: String(post) }],
  });
  const chain = (rows: [string, number, TxBalances, unknown?][]): Fake => ({
    accounts: new Map(),
    existing: new Set(),
    nonces: {},
    sigs: rows.map(([signature, blockTime, , err]) => ({ signature, blockTime, err: err ?? null })),
    txs: Object.fromEntries(rows.map(([s, , t]) => [s, t])),
  });

  test('balanceDelta reads pre/post token balances, lookup-table keys included', () => {
    expect(balanceDelta(tx(10n, 4n, 3), acct)).toBe(-6n);
    expect(balanceDelta(tx(10n, 14n), acct)).toBe(4n);
    expect(balanceDelta({ accountKeys: ['x'], pre: [], post: [] }, acct)).toBe(0n);
  });

  test('under the threshold: no finding; over: HIGH; old and failed transactions are ignored', async () => {
    const t = e.reserve.outflowAlertThreshold;
    const under = await checkOutflows(source(chain([['s1', NOW - 60, tx(t, 1n)]])), e.reserve, NOW);
    expect(under.findings).toEqual([]);
    expect(under.total).toBe(t - 1n);
    const over = await checkOutflows(
      source(
        chain([
          ['s1', NOW - 60, tx(t, 0n)],
          ['s2', NOW - 120, tx(5n, 4n)],
          ['s3', NOW - 130, tx(100n, 0n), { InstructionError: [0, 'Custom'] }],
          ['old', NOW - e.reserve.outflowWindowSecs - 1, tx(10n * t, 0n)],
        ]),
      ),
      e.reserve,
      NOW,
    );
    expect(over.total).toBe(t + 1n);
    expect(over.scanned).toBe(3);
    expect(over.findings).toHaveLength(1);
    expect(over.findings[0]).toMatchObject({ severity: 'HIGH', message: expect.stringContaining('above the alert threshold') });
  });

  test('inflows do not count; the page bound is HIGH', async () => {
    const rows: [string, number, TxBalances][] = Array.from({ length: 12 }, (_, i) => [`s${i}`, NOW - i, tx(0n, 5n)]);
    const out = await checkOutflows(source(chain(rows)), e.reserve, NOW, { pageSize: 5, maxPages: 2 });
    expect(out.total).toBe(0n);
    expect(out.findings[0]!.message).toContain('page bound');
    const fits = await checkOutflows(source(chain(rows)), e.reserve, NOW, { pageSize: 5, maxPages: 3 });
    expect(fits.findings).toEqual([]);
    expect(fits.scanned).toBe(12);
  });

  test('a missing transaction is a run error', async () => {
    const f = chain([['s1', NOW, tx(1n, 0n)]]);
    f.txs = {};
    await expect(checkOutflows(source(f), e.reserve, NOW)).rejects.toThrow('not found');
  });
});
