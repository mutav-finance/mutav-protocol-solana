import { describe, expect, test } from 'bun:test';
import { address, type Address } from '@solana/kit';
import { programData } from './fixtures';
import { postDeployChecks, programDataUpgradeAuthority } from '../devnet/lib/checks';
import { blankConfig, blankState } from '../../clients/js/test/fakes';

const VAULT: Address = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const OTHER: Address = address('2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz');

describe('programDataUpgradeAuthority', () => {
  test('reads the authority, or null when immutable', () => {
    expect(programDataUpgradeAuthority(programData(VAULT))).toBe(VAULT);
    expect(programDataUpgradeAuthority(programData(null))).toBeNull();
  });
  test('refuses other loader states', () => {
    const b = programData(VAULT);
    b[0] = 2; // Program, not ProgramData
    expect(() => programDataUpgradeAuthority(b)).toThrow('ProgramData');
  });
});

describe('postDeployChecks', () => {
  const config = () => ({ ...blankConfig(), admin: VAULT });
  test('a fresh reserve under the vault passes', () => {
    expect(postDeployChecks(programData(VAULT), config(), blankState(), { upgradeAuthority: VAULT, admin: VAULT })).toEqual([]);
  });
  test('each failure is reported', () => {
    const f = postDeployChecks(
      programData(OTHER),
      { ...config(), featureFlags: 1n, paused: true },
      blankState(),
      { upgradeAuthority: VAULT, admin: VAULT, allowlistRoot: new Uint8Array(32).fill(1) },
    ).join('\n');
    for (const s of ['upgrade authority', 'feature_flags', 'allowlist root', 'paused']) expect(f).toContain(s);
  });
});
