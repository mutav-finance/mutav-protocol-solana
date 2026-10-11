import { describe, expect, test } from 'bun:test';
import { address, createNoopSigner, type Address, type Instruction } from '@solana/kit';
import {
  getCancelPendingInstructionDataDecoder,
  getProposeRoleInstructionDataDecoder,
  type VaultConfig,
} from '../../clients/js/src';
import { composeAcceptRole, composeProposeRoles, composeSetCaps, ROLE_OPERATOR, ROLE_PAUSER } from '../devnet/lib/compose';
import { parseConfig } from '../devnet/lib/config';
import { filled, testAddress } from './fixtures';

const DEFAULT = address('11111111111111111111111111111111');
const cfg = parseConfig(filled());
const admin = createNoopSigner(cfg.admin);
const NOW = 1_000_000n;

/** The chain with other operator / pauser keys than the file, nothing pending. */
const chain = (o: Partial<VaultConfig> = {}): VaultConfig =>
  ({
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
});
