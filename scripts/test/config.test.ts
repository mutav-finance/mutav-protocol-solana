import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConfig } from '../devnet/lib/config';
import { assertOutsideRepo, guardCluster, REPO_ROOT } from '../devnet/lib/cli';

const example = () => JSON.parse(readFileSync(join(import.meta.dir, '..', 'devnet', 'devnet.example.json'), 'utf8'));

/** The example with every founder input filled by a distinct test address. */
function filled() {
  const keys = [
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    '2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz',
    '7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2',
    '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T',
    '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR',
    'GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR',
    '3Kz9wqPfaLTJQ1uCqNTTVGGu6jKG5TpKqJK3w1fzYG1k',
    '5ZWj7a1f8tWkjBESHKgrLmXshuXxqeY9SYcfbshpAqPG',
  ];
  const numbers: Record<string, number> = { timeLockFloorSecs: 86_400, feeTakeBps: 2_000 };
  let i = 0;
  const fill = (v: any, key = ''): any => {
    if (typeof v === 'string' && v.startsWith('<FILL')) return numbers[key] ?? keys[i++ % keys.length];
    if (Array.isArray(v)) return v.map((x) => fill(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, k)]));
    return v;
  };
  return fill(example());
}

describe('devnet.example.json', () => {
  test('lists every founder input and refuses to load unfilled', () => {
    let msg = '';
    try {
      parseConfig(example());
    } catch (e) {
      msg = (e as Error).message;
    }
    for (const field of ['squads.multisig', 'admin', 'upgradeAuthority', 'operator', 'pauser', 'treasuryAccount', 'paymentsAccount', 'mutavCapitalWallet', 'allowlist[0]', 'feeTakeBps', 'squads.timeLockFloorSecs']) {
      expect(msg).toContain(field);
    }
  });

  test('loads once filled; the NAV-move bound is high for the demo', () => {
    const c = parseConfig(filled());
    expect(c.cluster).toBe('devnet');
    expect(c.reserveMint as string).toBe('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4');
    expect(c.price.maxNavMoveBps).toBe(10_000);
    expect(c.caps.maxTesouroShareBps).toBe(0);
  });
});

describe('parseConfig bounds mirror the program', () => {
  const bad = (f: (c: any) => void, msg: string) => {
    const c = filled();
    f(c);
    expect(() => parseConfig(c)).toThrow(msg);
  };
  test('take rate', () => bad((c) => (c.feeTakeBps = 3_001), 'feeTakeBps'));
  test('coverage floor', () => bad((c) => (c.coverageRatioBps = 9_999), 'coverageRatioBps'));
  test('bps fields', () => bad((c) => (c.price.maxNavMoveBps = 10_001), 'price.maxNavMoveBps'));
  test('request bounds', () => bad((c) => (c.caps.minRequest = '999999999999999'), 'minRequest'));
  test('claim period', () => bad((c) => (c.caps.claimPeriodSecs = 0), 'claimPeriodSecs'));
  test('distinct roles', () => bad((c) => (c.pauser = c.operator), 'distinct'));
  test('distinct money accounts', () => bad((c) => (c.paymentsAccount = c.treasuryAccount), 'differ'));
  test('addresses', () => bad((c) => (c.operator = 'not-an-address'), 'operator'));
  test('empty allowlist', () => bad((c) => (c.allowlist = []), 'allowlist'));
});

describe('cluster guard', () => {
  test('local passes; devnet needs confirmation; mainnet is refused', () => {
    expect(guardCluster('http://127.0.0.1:8899', undefined)).toBe('local');
    expect(guardCluster('http://localhost:18899/', undefined)).toBe('local');
    expect(() => guardCluster('https://api.devnet.solana.com', undefined)).toThrow('--confirm-cluster devnet');
    expect(guardCluster('https://api.devnet.solana.com', 'devnet')).toBe('devnet');
    expect(() => guardCluster('https://api.mainnet-beta.solana.com', 'devnet')).toThrow('mainnet');
  });

  test('keypair paths must be outside the repo (target/deploy excepted)', () => {
    expect(() => assertOutsideRepo(join(REPO_ROOT, 'keys', 'id.json'), 'payer')).toThrow('inside the repository');
    expect(assertOutsideRepo(join(REPO_ROOT, 'target', 'deploy', 'mutav-keypair.json'), 'program')).toContain('target');
    expect(assertOutsideRepo('/tmp/x.json', 'payer')).toBe('/tmp/x.json');
  });
});
