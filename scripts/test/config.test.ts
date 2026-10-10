import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { example, filled } from './fixtures';
import { parseConfig } from '../devnet/lib/config';
import { assertOutsideRepo, REPO_ROOT } from '../devnet/lib/cli';


describe('devnet.example.json', () => {
  test('lists every founder input and refuses to load unfilled', () => {
    let msg = '';
    try {
      parseConfig(example());
    } catch (e) {
      msg = (e as Error).message;
    }
    for (const field of [
      'squads.multisig',
      'squads.members[0]',
      'squads.members[1]',
      'upgradeSquads.multisig',
      'upgradeSquads.members[0]',
      'upgradeSquads.members[1]',
      'admin',
      'upgradeAuthority',
      'operator',
      'pauser',
      'treasuryAccount',
      'paymentsAccount',
      'mutavCapitalWallet',
      'allowlist[0]',
    ]) {
      expect(msg).toContain(field);
    }
  });

  test('two 2-of-2 multisigs with the devnet time-lock floors (admin 5 min, upgrade 1 h)', () => {
    const c = parseConfig(filled());
    expect([c.squads.threshold, c.squads.members.length, c.squads.timeLockFloorSecs]).toEqual([2, 2, 300]);
    expect([c.upgradeSquads.threshold, c.upgradeSquads.members.length, c.upgradeSquads.timeLockFloorSecs]).toEqual([2, 2, 3_600]);
    expect(c.squads.multisig).not.toBe(c.upgradeSquads.multisig);
    expect(c.feeTakeBps).toBe(2_000);
  });

  test('loads once filled; the NAV-move bound is high for the demo', () => {
    const c = parseConfig(filled());
    expect(c.cluster).toBe('devnet');
    expect(c.reserveMint as string).toBe('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4');
    expect(c.caps.maxNavMoveBps).toBe(10_000);
  });

  test('starts at c = 0.10 with caps sized for it (ADR 0016)', () => {
    const c = parseConfig(filled());
    const BRL = 1_000_000n;
    expect(c.coverageRatioBps).toBe(1_000);
    expect(c.caps.maxTvl).toBe(300_000n * BRL);
    expect(c.caps.maxCoverPerGuarantee).toBe(40_000n * BRL);
    expect([c.caps.maxClaimPerCall, c.caps.maxClaimPerPeriod]).toEqual([10_000n * BRL, 20_000n * BRL]);
    expect([c.caps.minRequest, c.caps.maxRequest]).toEqual([1_000n * BRL, 100_000n * BRL]);
  });
});

describe('parseConfig bounds mirror the program', () => {
  const bad = (f: (c: any) => void, msg: string) => {
    const c = filled();
    f(c);
    expect(() => parseConfig(c)).toThrow(msg);
  };
  test('take rate', () => bad((c) => (c.feeTakeBps = 3_001), 'feeTakeBps'));
  test('coverage floor', () => bad((c) => (c.coverageRatioBps = 999), 'coverageRatioBps'));
  test('coverage floor accepts 0.10', () => {
    const c = filled();
    c.coverageRatioBps = 1_000;
    expect(parseConfig(c).coverageRatioBps).toBe(1_000);
  });
  test('bps fields', () => bad((c) => (c.caps.maxNavMoveBps = 10_001), 'caps.maxNavMoveBps'));
  test('request bounds', () => bad((c) => (c.caps.minRequest = '999999999999999'), 'minRequest'));
  test('distinct roles', () => bad((c) => (c.pauser = c.operator), 'distinct'));
  test('distinct money accounts', () => bad((c) => (c.paymentsAccount = c.treasuryAccount), 'differ'));
  test('addresses', () => bad((c) => (c.operator = 'not-an-address'), 'operator'));
  test('empty allowlist', () => bad((c) => (c.allowlist = []), 'allowlist'));
});

describe('parseConfig multisigs', () => {
  const bad = (f: (c: any) => void, msg: string) => {
    const c = filled();
    f(c);
    expect(() => parseConfig(c)).toThrow(msg);
  };
  test('both multisigs are required', () => {
    bad((c) => delete c.upgradeSquads, 'upgradeSquads.multisig');
    bad((c) => delete c.squads.members, 'squads.members');
  });
  test('threshold in [1, members]', () => {
    bad((c) => (c.squads.threshold = 0), 'squads.threshold');
    bad((c) => (c.upgradeSquads.threshold = 3), 'upgradeSquads.threshold');
  });
  test('members are distinct addresses', () => {
    bad((c) => (c.squads.members = [c.squads.members[0], c.squads.members[0]]), 'squads.members');
    bad((c) => (c.upgradeSquads.members = ['nope', c.upgradeSquads.members[0]]), 'upgradeSquads.members[0]');
  });
  test('devnet floors: admin >= 300 s, upgrade >= 3600 s', () => {
    bad((c) => (c.squads.timeLockFloorSecs = 299), 'squads.timeLockFloorSecs');
    bad((c) => (c.upgradeSquads.timeLockFloorSecs = 3_599), 'upgradeSquads.timeLockFloorSecs');
  });
  test('devnet needs two different multisigs, each at least 2-of-N', () => {
    bad((c) => (c.upgradeSquads.multisig = c.squads.multisig), 'different multisigs');
    bad((c) => (c.upgradeAuthority = c.admin), 'different');
    bad((c) => (c.squads.threshold = 1), 'squads.threshold');
  });
  test('localnet (the dry run) may use one stand-in for both, with any floor', () => {
    const c = filled();
    c.cluster = 'localnet';
    c.upgradeSquads = { ...c.squads, timeLockFloorSecs: 0 };
    c.squads.timeLockFloorSecs = 0;
    c.squads.threshold = 1;
    c.upgradeSquads.threshold = 1;
    c.upgradeAuthority = c.admin;
    expect(parseConfig(c).upgradeSquads.multisig).toBe(parseConfig(c).squads.multisig);
  });
});

describe('keypair paths', () => {
  test('must be outside the repo (target/deploy excepted)', () => {
    expect(() => assertOutsideRepo(join(REPO_ROOT, 'keys', 'id.json'), 'payer')).toThrow('inside the repository');
    expect(assertOutsideRepo(join(REPO_ROOT, 'target', 'deploy', 'mutav-keypair.json'), 'program')).toContain('target');
    expect(assertOutsideRepo('/tmp/x.json', 'payer')).toBe('/tmp/x.json');
  });
});
