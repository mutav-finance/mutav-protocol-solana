import { describe, expect, test } from 'bun:test';
import { address, type Address } from '@solana/kit';
import { programData } from './fixtures';
import { checkProgramHash, postDeployChecks, programDataUpgradeAuthority } from '../devnet/lib/checks';
import { executableHash, programDataHash } from '../devnet/lib/hash';
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
  test('any pending handover fails, live or expired', () => {
    for (const [field, label] of [
      ['pendingOperator', 'pending operator'],
      ['pendingPauser', 'pending pauser'],
      ['pendingAdmin', 'pending admin'],
    ] as const) {
      const f = postDeployChecks(programData(VAULT), { ...config(), [field]: OTHER }, blankState(), { upgradeAuthority: VAULT, admin: VAULT });
      expect(f).toEqual([`${label} handover to ${OTHER}: accept or cancel_pending it first`]);
    }
  });
});

describe('checkProgramHash', () => {
  const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 0, 2]);
  /** ProgramData holding `program`, zero-padded like a deploy with headroom. */
  const deployed = (program: Uint8Array) => {
    const b = programData(VAULT);
    const out = new Uint8Array(45 + program.length + 32);
    out.set(b.subarray(0, 45));
    out.set(program, 45);
    return out;
  };

  test('executableHash is sha256 of the bytes with trailing zeros trimmed', () => {
    const abc = new Uint8Array([0x61, 0x62, 0x63, 0, 0, 0]);
    expect(executableHash(abc)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('header stripped and trailing zeros trimmed, like solana-verify get-program-hash', () => {
    expect(programDataHash(deployed(ELF))).toBe(executableHash(ELF));
    expect(checkProgramHash(deployed(ELF), executableHash(ELF))).toEqual([]);
  });

  test('other bytecode fails', () => {
    const other = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 0, 3]);
    expect(checkProgramHash(deployed(other), executableHash(ELF))[0]).toContain('program hash is');
  });

  test('refuses an account that is not ProgramData', () => {
    const b = deployed(ELF);
    b[0] = 1;
    expect(() => checkProgramHash(b, executableHash(ELF))).toThrow('ProgramData');
  });
});
