import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import { A, B, C, multisigBytes } from './fixtures';
import {
  checkSquadsAccount,
  checkSquadsMultisig,
  decodeSquadsMultisig,
  DEFAULT_PUBKEY,
  MULTISIG_DISCRIMINATOR,
  PERMISSION,
  squadsVaultAddress,
  SQUADS_V4_PROGRAM,
} from '../devnet/lib/squads';


describe('decodeSquadsMultisig', () => {
  test('decodes every field', () => {
    const m = decodeSquadsMultisig(multisigBytes({ rentCollector: B, timeLock: 172_800 }));
    expect(m).toEqual({
      createKey: C,
      configAuthority: DEFAULT_PUBKEY,
      threshold: 2,
      timeLock: 172_800,
      transactionIndex: 17n,
      staleTransactionIndex: 3n,
      rentCollector: B,
      bump: 254,
      members: [
        { key: A, permissions: 7 },
        { key: B, permissions: 7 },
        { key: C, permissions: 7 },
      ],
    });
  });

  test('refuses other accounts and truncated data', () => {
    const bad = multisigBytes({});
    bad[0] ^= 1;
    expect(() => decodeSquadsMultisig(bad)).toThrow('discriminator');
    expect(() => decodeSquadsMultisig(multisigBytes({}).subarray(0, 120))).toThrow();
  });

  test('discriminator is sha256("account:Multisig")[..8]', () => {
    expect(Buffer.from(MULTISIG_DISCRIMINATOR).toString('hex')).toBe('e07479ba44a14fec');
  });
});

describe('checkSquadsMultisig', () => {
  const floor = 86_400;
  const expected = { members: [A, B, C], threshold: 2, timeLockFloorSecs: floor };
  const check = (o: Parameters<typeof multisigBytes>[0], e = expected) => checkSquadsMultisig(decodeSquadsMultisig(multisigBytes(o)), e);

  test('an autonomous multisig with the exact members and threshold, at the floor, passes', () => {
    expect(check({})).toEqual([]);
    expect(check({ timeLock: floor })).toEqual([]);
  });

  test('member order does not matter', () => {
    expect(check({}, { ...expected, members: [C, A, B] })).toEqual([]);
  });

  test('a controlled multisig fails', () => {
    expect(check({ configAuthority: A }).join()).toContain('config_authority');
  });

  test('a time lock below the floor fails', () => {
    expect(check({ timeLock: floor - 1 }).join()).toContain('time_lock');
  });

  test('a threshold other than the configured one fails, lower or higher', () => {
    expect(check({ threshold: 1 }).join()).toContain('threshold 1');
    expect(check({ threshold: 3 }).join()).toContain('threshold 3');
  });

  test('a threshold above the voting members fails', () => {
    const f = check({ threshold: 2, members: [[A, PERMISSION.vote], [B, PERMISSION.initiate]] }, { ...expected, members: [A, B] });
    expect(f.join()).toContain('vote');
  });

  test('an extra member fails', () => {
    const D = address('4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T');
    expect(check({ members: [[A, 7], [B, 7], [C, 7], [D, 7]] }).join()).toContain(`unexpected member ${D}`);
  });

  test('a missing member fails', () => {
    expect(check({ members: [[A, 7], [B, 7]] }).join()).toContain(`missing member ${C}`);
  });

  test('a configured member without the vote permission fails', () => {
    expect(check({ members: [[A, 7], [B, 7], [C, PERMISSION.initiate | PERMISSION.execute]] }).join()).toContain(`${C} cannot vote`);
  });
});

describe('checkSquadsAccount', () => {
  const expected = { members: [A, B, C], threshold: 2, timeLockFloorSecs: 300 };
  test('passes for a Squads-owned multisig', () => {
    expect(checkSquadsAccount({ owner: SQUADS_V4_PROGRAM, data: multisigBytes({}) }, expected, 'admin')).toEqual([]);
  });
  test('refuses an account not owned by the Squads v4 program', () => {
    const f = checkSquadsAccount({ owner: A, data: multisigBytes({}) }, expected, 'admin');
    expect(f.join()).toContain('not owned by the Squads v4 program');
  });
  test('reports a missing account and undecodable data', () => {
    expect(checkSquadsAccount(null, expected, 'upgrade').join()).toContain('upgrade multisig not found');
    expect(checkSquadsAccount({ owner: SQUADS_V4_PROGRAM, data: new Uint8Array(10) }, expected, 'admin').join()).toContain('discriminator');
  });
  test('every failure names the multisig', () => {
    for (const f of checkSquadsAccount({ owner: SQUADS_V4_PROGRAM, data: multisigBytes({ threshold: 1, timeLock: 1 }) }, expected, 'upgrade')) {
      expect(f.startsWith('upgrade multisig:')).toBe(true);
    }
  });
});

describe('squadsVaultAddress', () => {
  test('is deterministic per multisig and index', async () => {
    const v0 = await squadsVaultAddress(A, 0);
    expect(await squadsVaultAddress(A, 0)).toBe(v0);
    expect(await squadsVaultAddress(A, 1)).not.toBe(v0);
    expect(await squadsVaultAddress(B, 0)).not.toBe(v0);
  });
});
