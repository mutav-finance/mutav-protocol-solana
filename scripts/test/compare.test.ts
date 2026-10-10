import { describe, expect, test } from 'bun:test';
import { getAddressEncoder, type Address } from '@solana/kit';
import type { VaultConfig } from '../../clients/js/src';
import { blankConfig } from '../../clients/js/test/fakes';
import { checkDevnetLocked, checkMoneyAccounts, compareConfig, CONFIG_FIELDS, DEVNET_LOCKED } from '../devnet/lib/compare';
import { parseConfig, type DeployConfig } from '../devnet/lib/config';
import { filled, testAddress } from './fixtures';

const BRL = 1_000_000n;

/** The on-chain VaultConfig a correct initialize from `cfg` would leave. */
function onChainFrom(cfg: DeployConfig): VaultConfig {
  const { minSettlementBps, ...caps } = cfg.caps;
  const b = blankConfig();
  return {
    ...b,
    admin: cfg.admin,
    operator: cfg.operator,
    pauser: cfg.pauser,
    reserveMint: cfg.reserveMint,
    reserveTokenProgram: cfg.reserveTokenProgram,
    reserveDecimals: 6,
    coverageRatioBps: cfg.coverageRatioBps,
    feeTakeBps: cfg.feeTakeBps,
    paymentsAccount: cfg.paymentsAccount,
    treasuryAccount: cfg.treasuryAccount,
    payoutSlaSecs: cfg.payoutSlaSecs,
    mutavCapitalWallet: cfg.mutavCapitalWallet,
    incomeTakeBps: 0,
    caps: { ...b.caps, ...caps, maxAllocatedBps: 10_000 - minSettlementBps },
    price: { ...b.price, ...cfg.price },
  };
}

const devnetCfg = () => parseConfig(filled());

describe('compareConfig (on-chain vs the deploy config)', () => {
  test('a reserve initialised from the config matches it', () => {
    const cfg = devnetCfg();
    expect(compareConfig(onChainFrom(cfg), cfg)).toEqual([]);
  });

  test.each<[string, (c: VaultConfig) => void]>([
    ['coverage_ratio_bps', (c) => (c.coverageRatioBps = 2_000)],
    ['fee_take_bps', (c) => (c.feeTakeBps = 1_000)],
    ['caps.max_tvl', (c) => (c.caps.maxTvl += 1n)],
    ['caps.max_cover_per_guarantee', (c) => (c.caps.maxCoverPerGuarantee += 1n)],
    ['caps.max_claim_per_call', (c) => (c.caps.maxClaimPerCall += 1n)],
    ['caps.max_claim_per_period', (c) => (c.caps.maxClaimPerPeriod += 1n)],
    ['caps.claim_period_secs', (c) => (c.caps.claimPeriodSecs += 1n)],
    ['caps.min_settlement_bps', (c) => (c.caps.maxAllocatedBps = 500)],
    ['caps.min_request', (c) => (c.caps.minRequest += 1n)],
    ['caps.max_request', (c) => (c.caps.maxRequest += 1n)],
    ['caps.min_fill_assets', (c) => (c.caps.minFillAssets += 1n)],
    ['price.max_nav_move_bps', (c) => (c.price.maxNavMoveBps = 100)],
    ['price.max_staleness_secs', (c) => (c.price.maxStalenessSecs = 1n)],
    ['income_take_bps', (c) => (c.incomeTakeBps = 100)],
    ['reserve_decimals', (c) => (c.reserveDecimals = 9)],
    ['reserve_mint', (c) => (c.reserveMint = testAddress(50))],
    ['reserve_token_program', (c) => (c.reserveTokenProgram = testAddress(51))],
    ['treasury_account', (c) => (c.treasuryAccount = testAddress(52))],
    ['payments_account', (c) => (c.paymentsAccount = testAddress(53))],
    ['mutav_capital_wallet', (c) => (c.mutavCapitalWallet = testAddress(54))],
  ])('a different %s fails and is named', (field, mutate) => {
    const cfg = devnetCfg();
    const c = onChainFrom(cfg);
    mutate(c);
    const f = compareConfig(c, cfg);
    expect(f).toHaveLength(1);
    expect(f[0]!.startsWith(`${field}:`)).toBe(true);
  });

  test('the field table has unique names', () => {
    const names = CONFIG_FIELDS.map((f) => f.field);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('checkDevnetLocked', () => {
  test('the example config, deployed, holds every locked devnet value', () => {
    expect(checkDevnetLocked(onChainFrom(devnetCfg()))).toEqual([]);
  });

  test('the locked values (spec decisions)', () => {
    const v = Object.fromEntries(DEVNET_LOCKED.map((l) => [l.field, l.value]));
    expect(v).toEqual({
      coverage_ratio_bps: 1_000n,
      fee_take_bps: 2_000n,
      'caps.max_tvl': 300_000n * BRL,
      'caps.max_cover_per_guarantee': 40_000n * BRL,
      'caps.max_claim_per_call': 10_000n * BRL,
      'caps.max_claim_per_period': 20_000n * BRL,
      'caps.claim_period_secs': 2_592_000n,
      'caps.min_request': 1_000n * BRL,
      'caps.max_request': 100_000n * BRL,
      'caps.min_settlement_bps': 10_000n,
      'price.max_nav_move_bps': 10_000n,
      income_take_bps: 0n,
      reserve_decimals: 6n,
    });
  });

  test('a drifted value fails, naming the field', () => {
    const c = onChainFrom(devnetCfg());
    c.caps.maxTvl = 500_000n * BRL;
    c.caps.maxAllocatedBps = 1;
    const f = checkDevnetLocked(c);
    expect(f).toHaveLength(2);
    expect(f[0]).toStartWith('caps.max_tvl:');
    expect(f[1]).toStartWith('caps.min_settlement_bps:');
  });

  test('a raised claim cap per period says it must be lowered after the large payment', () => {
    const c = onChainFrom(devnetCfg());
    c.caps.maxClaimPerPeriod = 60_000n * BRL;
    const f = checkDevnetLocked(c).join('\n');
    expect(f).toContain('caps.max_claim_per_period');
    expect(f).toContain('raised');
    expect(f).toContain('lower it');
  });

  test('a claim cap per period below the locked value is a plain mismatch', () => {
    const c = onChainFrom(devnetCfg());
    c.caps.maxClaimPerPeriod = 5_000n * BRL;
    expect(checkDevnetLocked(c).join('\n')).not.toContain('raised');
  });
});

describe('checkMoneyAccounts', () => {
  const cfg = devnetCfg();
  /** SPL token account: mint (32) | owner (32) | amount … */
  const tokenAccount = (mint: Address, owner: Address) => {
    const b = new Uint8Array(165);
    b.set(getAddressEncoder().encode(mint), 0);
    b.set(getAddressEncoder().encode(owner), 32);
    return { owner: cfg.reserveTokenProgram, data: b };
  };
  const ok = () => ({
    treasury: tokenAccount(cfg.reserveMint, testAddress(60)),
    payments: tokenAccount(cfg.reserveMint, testAddress(61)),
  });

  test('BRS accounts owned by others pass', () => {
    expect(checkMoneyAccounts(ok(), cfg, cfg.operator)).toEqual([]);
  });
  test('an account owned by the operator fails', () => {
    const a = ok();
    a.payments = tokenAccount(cfg.reserveMint, cfg.operator);
    expect(checkMoneyAccounts(a, cfg, cfg.operator).join()).toContain('payments_account is owned by the operator');
  });
  test('a wrong mint, a wrong program or a missing account fails', () => {
    const a = ok();
    a.treasury = tokenAccount(testAddress(62), testAddress(60));
    expect(checkMoneyAccounts(a, cfg, cfg.operator).join()).toContain('treasury_account holds mint');
    expect(checkMoneyAccounts({ ...ok(), treasury: { ...ok().treasury, owner: testAddress(63) } }, cfg, cfg.operator).join()).toContain('treasury_account is owned by program');
    expect(checkMoneyAccounts({ ...ok(), payments: null }, cfg, cfg.operator).join()).toContain('payments_account not found');
  });
});
