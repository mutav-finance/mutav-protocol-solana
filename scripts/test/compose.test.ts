import { describe, expect, test } from 'bun:test';
import { address, createNoopSigner, type Address, type Instruction } from '@solana/kit';
import {
  getCancelPendingInstructionDataDecoder,
  getSetGuardiansInstructionDataDecoder,
  REFRESH_DISCRIMINATOR,
  SET_CONFIG_DISCRIMINATOR,
  getProposeRoleInstructionDataDecoder,
  type VaultConfig,
} from '../../clients/js/src';
import { composeAcceptRole, composeProposeRoles, composeRoleChanges, composeSetCaps, composeSetGuardians, ROLE_ADMIN, ROLE_OPERATOR, ROLE_PAUSER } from '../devnet/lib/compose';
import { parseConfig } from '../devnet/lib/config';
import { rolesTitle } from '../devnet/roles';
import { filled, testAddress } from './fixtures';

const DEFAULT = address('11111111111111111111111111111111');
const cfg = parseConfig(filled());
const admin = createNoopSigner(cfg.admin);
const NOW = 1_000_000n;

/** The chain with other operator / pauser keys than the file, nothing pending. */
const chain = (o: Partial<VaultConfig> = {}): VaultConfig =>
  ({
    admin: cfg.admin,
    pendingAdmin: DEFAULT,
    pendingAdminExpiresAt: 0n,
    operator: testAddress(200),
    pauser: testAddress(201),
    pendingOperator: DEFAULT,
    pendingOperatorExpiresAt: 0n,
    pendingPauser: DEFAULT,
    pendingPauserExpiresAt: 0n,
    treasuryAccount: testAddress(202),
    paymentsAccount: testAddress(203),
    ...o,
  }) as VaultConfig;

const kinds = (ixs: readonly Instruction[]) =>
  ixs.map((ix) => {
    try {
      const d = getProposeRoleInstructionDataDecoder().decode(ix.data!);
      return `propose:${d.role}:${d.key}`;
    } catch {
      return `cancel:${getCancelPendingInstructionDataDecoder().decode(ix.data!).role}`;
    }
  });

describe('composeProposeRoles', () => {
  test('nothing pending: one propose per changed role', async () => {
    const ixs = await composeProposeRoles(cfg, chain(), admin, NOW);
    expect(kinds(ixs)).toEqual([`propose:${ROLE_OPERATOR}:${cfg.operator}`, `propose:${ROLE_PAUSER}:${cfg.pauser}`]);
  });

  test('the requested key already pending is refused', async () => {
    const c = chain({ pendingOperator: cfg.operator as Address, pendingOperatorExpiresAt: NOW + 10n });
    await expect(composeProposeRoles(cfg, c, admin, NOW)).rejects.toThrow('awaiting accept_role');
  });

  test('another unexpired pending key is cancelled first, in the same proposal', async () => {
    const c = chain({ pendingPauser: testAddress(210), pendingPauserExpiresAt: NOW });
    const ixs = await composeProposeRoles(cfg, c, admin, NOW);
    expect(kinds(ixs)).toEqual([
      `propose:${ROLE_OPERATOR}:${cfg.operator}`,
      `cancel:${ROLE_PAUSER}`,
      `propose:${ROLE_PAUSER}:${cfg.pauser}`,
    ]);
  });

  test('an expired pending key is simply replaced', async () => {
    const c = chain({
      pendingOperator: cfg.operator as Address,
      pendingOperatorExpiresAt: NOW - 1n,
      pendingPauser: testAddress(210),
      pendingPauserExpiresAt: NOW - 1n,
    });
    const ixs = await composeProposeRoles(cfg, c, admin, NOW);
    expect(kinds(ixs)).toEqual([`propose:${ROLE_OPERATOR}:${cfg.operator}`, `propose:${ROLE_PAUSER}:${cfg.pauser}`]);
  });
});

describe('composeProposeRoles: stray pending handovers', () => {
  const matching = (o: Partial<VaultConfig> = {}) => chain({ operator: cfg.operator, pauser: cfg.pauser, ...o });

  test('roles that match with nothing pending: empty', async () => {
    expect(await composeProposeRoles(cfg, matching(), admin, NOW)).toEqual([]);
  });

  test('a matching key with a live or expired pending slot gets cancel_pending', async () => {
    const c = matching({
      pendingOperator: testAddress(211),
      pendingOperatorExpiresAt: NOW + 10n,
      pendingPauser: testAddress(212),
      pendingPauserExpiresAt: NOW - 10n,
    });
    expect(kinds(await composeProposeRoles(cfg, c, admin, NOW))).toEqual([`cancel:${ROLE_OPERATOR}`, `cancel:${ROLE_PAUSER}`]);
  });

  test('a pending admin the config does not name is refused without --cancel-admin (live or expired)', async () => {
    const live = matching({ pendingAdmin: testAddress(213), pendingAdminExpiresAt: NOW + 10n });
    await expect(composeProposeRoles(cfg, live, admin, NOW)).rejects.toThrow('--cancel-admin');
    await expect(composeProposeRoles(cfg, live, admin, NOW)).rejects.toThrow('in flight');
    const expired = matching({ pendingAdmin: testAddress(213), pendingAdminExpiresAt: NOW - 10n });
    await expect(composeProposeRoles(cfg, expired, admin, NOW)).rejects.toThrow('expired');
  });

  test('with cancelAdmin the pending admin is cancelled and named', async () => {
    const c = matching({ pendingAdmin: testAddress(213), pendingAdminExpiresAt: NOW + 10n, pendingPauser: testAddress(212) });
    const r = await composeRoleChanges(cfg, c, admin, NOW, { cancelAdmin: true });
    expect(kinds(r.instructions)).toEqual([`cancel:${ROLE_PAUSER}`, `cancel:${ROLE_ADMIN}`]);
    expect(r.cancelled).toEqual(['pauser', 'admin']);
    expect(rolesTitle(cfg, r.cancelled)).toContain('cancel_pending: pauser, admin');
    expect(rolesTitle(cfg, [])).not.toContain('cancel_pending');
  });

  test('a pending admin the config names as nextAdmin is kept', async () => {
    const c = matching({ pendingAdmin: testAddress(213), pendingAdminExpiresAt: NOW + 10n });
    expect(await composeProposeRoles({ ...cfg, nextAdmin: testAddress(213) }, c, admin, NOW)).toEqual([]);
  });

  test('a chain admin other than the config is refused', async () => {
    await expect(composeProposeRoles(cfg, matching({ admin: testAddress(214) }), admin, NOW)).rejects.toThrow('propose_admin');
  });
});

describe('guardians', () => {
  const onChain = (guardians: Address[]) => chain({ guardians } as Partial<VaultConfig>);
  test('the same set on-chain (any slot order): nothing to propose', async () => {
    const g = [testAddress(220), testAddress(221)];
    expect(await composeSetGuardians({ ...cfg, guardians: g }, onChain([DEFAULT, g[1]!, g[0]!]), admin)).toEqual([]);
    expect(await composeSetGuardians(cfg, onChain([DEFAULT, DEFAULT, DEFAULT]), admin)).toEqual([]);
  });
  test('a different set: set_guardians with all three slots, padded with the default key', async () => {
    const ixs = await composeSetGuardians({ ...cfg, guardians: [testAddress(220)] }, onChain([testAddress(222), DEFAULT, DEFAULT]), admin);
    expect(ixs).toHaveLength(1);
    expect(getSetGuardiansInstructionDataDecoder().decode(ixs[0]!.data!).guardians).toEqual([testAddress(220), DEFAULT, DEFAULT]);
  });
  test('no guardians in the config clears guardians set on-chain', async () => {
    const ixs = await composeSetGuardians(cfg, onChain([testAddress(222), DEFAULT, DEFAULT]), admin);
    expect(getSetGuardiansInstructionDataDecoder().decode(ixs[0]!.data!).guardians).toEqual([DEFAULT, DEFAULT, DEFAULT]);
  });
  test('the config refuses more than 3, duplicates, the default key and role keys', () => {
    const g = (guardians: unknown) => () => parseConfig({ ...filled(), guardians });
    expect(g([testAddress(1), testAddress(2), testAddress(3), testAddress(4)])).toThrow('at most 3');
    expect(g([testAddress(1), testAddress(1)])).toThrow('distinct');
    expect(g([DEFAULT])).toThrow('default key');
    expect(g([cfg.operator])).toThrow('admin, operator or pauser');
    expect(parseConfig({ ...filled(), guardians: [testAddress(230)] }).guardians).toEqual([testAddress(230)]);
  });
  test('the title names set_guardians', () => {
    expect(rolesTitle(cfg, [], true)).toContain('set_guardians');
  });
});

describe('nextAdmin in the config', () => {
  test('is optional and parsed as an address', () => {
    expect(cfg.nextAdmin).toBeUndefined();
    expect(parseConfig({ ...filled(), nextAdmin: testAddress(215) }).nextAdmin).toBe(testAddress(215));
    expect(() => parseConfig({ ...filled(), nextAdmin: 'nope' })).toThrow('nextAdmin');
  });
});

describe('composeAcceptRole', () => {
  test('passes the money accounts for the operator only', async () => {
    const op = await composeAcceptRole(cfg, chain(), ROLE_OPERATOR, createNoopSigner(cfg.operator));
    expect(op.accounts![2].address).toBe(testAddress(202));
    expect(op.accounts![3].address).toBe(testAddress(203));
    const pa = await composeAcceptRole(cfg, chain(), ROLE_PAUSER, createNoopSigner(cfg.pauser));
    expect(pa.accounts![2].address).toBe(cfg.programId);
    expect(pa.accounts![3].address).toBe(cfg.programId);
  });
});

describe('composeSetCaps', () => {
  test('a carve missing from the file keeps the chain value', async () => {
    const raw = filled();
    delete raw.caps.stressBuffer;
    delete raw.caps.maxQueueWaitSecs;
    delete raw.caps.maxReinstateAge;
    const f = parseConfig(raw);
    const onChain = {
      ...chain(),
      coverageRatioBps: f.coverageRatioBps,
      feeTakeBps: f.feeTakeBps,
      featureFlags: 0n,
      mutavCapitalWallet: f.mutavCapitalWallet,
      caps: { ...f.caps, stressBuffer: 7n, maxQueueWaitSecs: 8n, maxReinstateAge: 9n },
    } as unknown as VaultConfig;
    expect(await composeSetCaps(f, onChain, admin)).toEqual([]);
  });

  const onChain = (f = cfg) =>
    ({
      ...chain(),
      coverageRatioBps: f.coverageRatioBps,
      feeTakeBps: f.feeTakeBps,
      featureFlags: 0n,
      mutavCapitalWallet: f.mutavCapitalWallet,
      caps: { ...f.caps, stressBuffer: f.caps.stressBuffer ?? 0n, maxQueueWaitSecs: f.caps.maxQueueWaitSecs ?? 0n, maxReinstateAge: f.caps.maxReinstateAge ?? 0n },
    }) as unknown as VaultConfig;
  const names = (ixs: readonly Instruction[]) =>
    ixs.map((ix) => {
      const d = Buffer.from(ix.data!.subarray(0, 8)).toString('hex');
      if (d === Buffer.from(SET_CONFIG_DISCRIMINATOR).toString('hex')) return 'set_config';
      if (d === Buffer.from(REFRESH_DISCRIMINATOR).toString('hex')) return 'refresh';
      return d;
    });

  test('a change that needs a refresh is wrapped: refresh, set_config, refresh', async () => {
    const ixs = await composeSetCaps({ ...cfg, coverageRatioBps: cfg.coverageRatioBps + 100 }, onChain(), admin);
    expect(names(ixs)).toEqual(['refresh', 'set_config', 'refresh']);
  });

  test('a change that needs none is set_config alone', async () => {
    const ixs = await composeSetCaps({ ...cfg, caps: { ...cfg.caps, maxTvl: cfg.caps.maxTvl + 1n } }, onChain(), admin);
    expect(names(ixs)).toEqual(['set_config']);
  });
});
