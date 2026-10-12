import { describe, expect, test } from 'bun:test';
import { address, createNoopSigner } from '@solana/kit';
import {
  COMPUTE_BUDGET_PROGRAM,
  INITIALIZE_COMPUTE_UNIT_LIMIT,
  MAX_COMPUTE_UNIT_LIMIT,
  setComputeUnitLimitInstruction,
  SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT,
} from '../devnet/lib/compute';
import { composeSetAllowlistRoot } from '../devnet/lib/compose';
import { parseConfig } from '../devnet/lib/config';
import { toPayload } from '../devnet/lib/proposal';
import { filled } from './fixtures';

describe('compute-unit limits (opt-level z)', () => {
  test('SetComputeUnitLimit is instruction 2 with u32 little-endian units, no accounts', () => {
    const ix = setComputeUnitLimitInstruction(260_000);
    expect(ix.programAddress).toBe(address('ComputeBudget111111111111111111111111111111'));
    expect(ix.programAddress).toBe(COMPUTE_BUDGET_PROGRAM);
    expect(ix.accounts).toEqual([]);
    expect(Array.from(ix.data!)).toEqual([2, 0xa0, 0xf7, 0x03, 0x00]);
  });

  test('limits stay within the runtime maximum and above the 200k default', () => {
    for (const units of [INITIALIZE_COMPUTE_UNIT_LIMIT, SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT]) {
      expect(units).toBeGreaterThan(200_000);
      expect(units).toBeLessThanOrEqual(MAX_COMPUTE_UNIT_LIMIT);
    }
    for (const bad of [0, -1, 1.5, MAX_COMPUTE_UNIT_LIMIT + 1]) {
      expect(() => setComputeUnitLimitInstruction(bad)).toThrow(/compute-unit limit/);
    }
  });

  test('every proposal payload names the execute limit', async () => {
    const cfg = parseConfig(filled());
    const ix = await composeSetAllowlistRoot(cfg, new Uint8Array(32), createNoopSigner(cfg.admin));
    const p = toPayload({ title: 't', cluster: cfg.cluster, multisig: cfg.squads.multisig, vaultIndex: 0, vault: cfg.admin }, [ix]);
    expect(p.executeComputeUnitLimit).toBe(SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT);
    // The limit is for the outer execute transaction, never an inner instruction.
    expect(p.instructions.map((i) => i.programAddress)).not.toContain(COMPUTE_BUDGET_PROGRAM);
  });
});
