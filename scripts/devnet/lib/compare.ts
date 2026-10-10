/**
 * verify.ts: the on-chain `VaultConfig` against the deploy config, field by
 * field, and on devnet against the locked devnet values. Table-driven so
 * fields can be added or removed with the program's layout (PRs 1–2 add
 * `stress_buffer`, the unsolicited dust threshold and guardians, and remove
 * the per-agency cap and the payout SLA). Pure over decoded data.
 */
import { getAddressDecoder, type Address } from '@solana/kit';
import { minSettlementBps, type VaultConfig } from '../../../clients/js/src';
import { RESERVE_DECIMALS } from './checks';
import type { DeployConfig } from './config';

type Value = bigint | string;
const v = (x: number | bigint | string): Value => (typeof x === 'string' ? x : BigInt(x));

export type FieldCheck = {
  /** Program field name, as FAIL messages print it. */
  field: string;
  onChain: (c: VaultConfig) => Value;
  expected: (cfg: DeployConfig) => Value;
};

/** Every config field `initialize` / `set_config` writes, plus the immutable ones. */
export const CONFIG_FIELDS: FieldCheck[] = [
  { field: 'coverage_ratio_bps', onChain: (c) => v(c.coverageRatioBps), expected: (f) => v(f.coverageRatioBps) },
  { field: 'fee_take_bps', onChain: (c) => v(c.feeTakeBps), expected: (f) => v(f.feeTakeBps) },
  // TODO(PR 1): the payout SLA is removed from the program; drop this row.
  { field: 'payout_sla_secs', onChain: (c) => v(c.payoutSlaSecs), expected: (f) => v(f.payoutSlaSecs) },
  { field: 'caps.max_tvl', onChain: (c) => v(c.caps.maxTvl), expected: (f) => v(f.caps.maxTvl) },
  { field: 'caps.max_cover_per_guarantee', onChain: (c) => v(c.caps.maxCoverPerGuarantee), expected: (f) => v(f.caps.maxCoverPerGuarantee) },
  // TODO(PR 1): the per-agency cap is removed from the program; drop this row.
  { field: 'caps.max_cover_per_agency', onChain: (c) => v(c.caps.maxCoverPerAgency), expected: (f) => v(f.caps.maxCoverPerAgency) },
  { field: 'caps.max_claim_per_call', onChain: (c) => v(c.caps.maxClaimPerCall), expected: (f) => v(f.caps.maxClaimPerCall) },
  { field: 'caps.max_claim_per_period', onChain: (c) => v(c.caps.maxClaimPerPeriod), expected: (f) => v(f.caps.maxClaimPerPeriod) },
  { field: 'caps.claim_period_secs', onChain: (c) => v(c.caps.claimPeriodSecs), expected: (f) => v(f.caps.claimPeriodSecs) },
  // Stored as its complement `max_allocated_bps` (ADR 0018); compared as the floor.
  { field: 'caps.min_settlement_bps', onChain: (c) => v(minSettlementBps(c)), expected: (f) => v(f.caps.minSettlementBps) },
  { field: 'caps.min_request', onChain: (c) => v(c.caps.minRequest), expected: (f) => v(f.caps.minRequest) },
  { field: 'caps.max_request', onChain: (c) => v(c.caps.maxRequest), expected: (f) => v(f.caps.maxRequest) },
  { field: 'caps.min_fill_assets', onChain: (c) => v(c.caps.minFillAssets), expected: (f) => v(f.caps.minFillAssets) },
  { field: 'price.tesouro_price_account', onChain: (c) => c.price.tesouroPriceAccount, expected: (f) => f.price.tesouroPriceAccount },
  { field: 'price.p0', onChain: (c) => v(c.price.p0), expected: (f) => v(f.price.p0) },
  { field: 'price.t0', onChain: (c) => v(c.price.t0), expected: (f) => v(f.price.t0) },
  { field: 'price.y_max_bps', onChain: (c) => v(c.price.yMaxBps), expected: (f) => v(f.price.yMaxBps) },
  { field: 'price.max_staleness_secs', onChain: (c) => v(c.price.maxStalenessSecs), expected: (f) => v(f.price.maxStalenessSecs) },
  { field: 'price.max_deviation_bps', onChain: (c) => v(c.price.maxDeviationBps), expected: (f) => v(f.price.maxDeviationBps) },
  { field: 'price.max_nav_move_bps', onChain: (c) => v(c.price.maxNavMoveBps), expected: (f) => v(f.price.maxNavMoveBps) },
  // Never set from the file (ADR 0017, spec §12 Q47 stays 0).
  { field: 'income_take_bps', onChain: (c) => v(c.incomeTakeBps), expected: () => 0n },
  { field: 'reserve_decimals', onChain: (c) => v(c.reserveDecimals), expected: () => v(RESERVE_DECIMALS) },
  { field: 'reserve_mint', onChain: (c) => c.reserveMint, expected: (f) => f.reserveMint },
  { field: 'reserve_token_program', onChain: (c) => c.reserveTokenProgram, expected: (f) => f.reserveTokenProgram },
  { field: 'treasury_account', onChain: (c) => c.treasuryAccount, expected: (f) => f.treasuryAccount },
  { field: 'payments_account', onChain: (c) => c.paymentsAccount, expected: (f) => f.paymentsAccount },
  { field: 'mutav_capital_wallet', onChain: (c) => c.mutavCapitalWallet, expected: (f) => f.mutavCapitalWallet },
];

/** Each failure starts with the field name. */
export function compareConfig(onChain: VaultConfig, cfg: DeployConfig): string[] {
  const out: string[] = [];
  for (const f of CONFIG_FIELDS) {
    const got = f.onChain(onChain);
    const want = f.expected(cfg);
    if (got !== want) out.push(`${f.field}: on-chain ${got}, config ${want}`);
  }
  return out;
}

const BRL = 1_000_000n;

export type LockedValue = {
  field: string;
  onChain: (c: VaultConfig) => Value;
  value: Value;
  /** Printed when the on-chain value is above the locked one. */
  whenRaised?: string;
};

/**
 * The locked devnet values (handoff "Devnet values"). A devnet deploy must
 * hold every one of them.
 * TODO(PR 1): `max_cover_per_agency` and `payout_sla_secs` are removed, so
 * they are not locked here. TODO(PR 2): add `stress_buffer` (R$19k) and the
 * unsolicited dust threshold (R$10) once `VaultConfig` carries them.
 */
export const DEVNET_LOCKED: LockedValue[] = [
  { field: 'coverage_ratio_bps', onChain: (c) => v(c.coverageRatioBps), value: 1_000n },
  { field: 'fee_take_bps', onChain: (c) => v(c.feeTakeBps), value: 2_000n },
  { field: 'caps.max_tvl', onChain: (c) => v(c.caps.maxTvl), value: 300_000n * BRL },
  { field: 'caps.max_cover_per_guarantee', onChain: (c) => v(c.caps.maxCoverPerGuarantee), value: 40_000n * BRL },
  { field: 'caps.max_claim_per_call', onChain: (c) => v(c.caps.maxClaimPerCall), value: 10_000n * BRL },
  {
    field: 'caps.max_claim_per_period',
    onChain: (c) => v(c.caps.maxClaimPerPeriod),
    value: 20_000n * BRL,
    whenRaised: 'the cap is raised (e.g. for a large claim payment); lower it back to the locked value with set_config once that payment is made',
  },
  { field: 'caps.claim_period_secs', onChain: (c) => v(c.caps.claimPeriodSecs), value: 2_592_000n },
  { field: 'caps.min_request', onChain: (c) => v(c.caps.minRequest), value: 1_000n * BRL },
  { field: 'caps.max_request', onChain: (c) => v(c.caps.maxRequest), value: 100_000n * BRL },
  { field: 'caps.min_settlement_bps', onChain: (c) => v(minSettlementBps(c)), value: 10_000n },
  { field: 'price.max_nav_move_bps', onChain: (c) => v(c.price.maxNavMoveBps), value: 10_000n },
  { field: 'income_take_bps', onChain: (c) => v(c.incomeTakeBps), value: 0n },
  { field: 'reserve_decimals', onChain: (c) => v(c.reserveDecimals), value: v(RESERVE_DECIMALS) },
];

export function checkDevnetLocked(onChain: VaultConfig): string[] {
  const out: string[] = [];
  for (const l of DEVNET_LOCKED) {
    const got = l.onChain(onChain);
    if (got === l.value) continue;
    const raised = l.whenRaised && typeof got === 'bigint' && typeof l.value === 'bigint' && got > l.value;
    out.push(`${l.field}: on-chain ${got}, locked devnet value ${l.value}${raised ? `; ${l.whenRaised}` : ''}`);
  }
  return out;
}

type TokenAccount = { owner: Address; data: Uint8Array } | null;

/**
 * The treasury and payments accounts: token accounts of the reserve mint
 * under the reserve token program, and not owned by the operator (AV-3).
 */
export function checkMoneyAccounts(
  a: { treasury: TokenAccount; payments: TokenAccount },
  cfg: Pick<DeployConfig, 'reserveMint' | 'reserveTokenProgram'>,
  operator: Address,
): string[] {
  const out: string[] = [];
  const dec = getAddressDecoder();
  for (const [field, acc] of [
    ['treasury_account', a.treasury],
    ['payments_account', a.payments],
  ] as const) {
    if (!acc) {
      out.push(`${field} not found`);
      continue;
    }
    if (acc.owner !== cfg.reserveTokenProgram) out.push(`${field} is owned by program ${acc.owner}, not ${cfg.reserveTokenProgram}`);
    if (acc.data.length < 165) {
      out.push(`${field} is not a token account`);
      continue;
    }
    const mint = dec.decode(acc.data.subarray(0, 32));
    const owner = dec.decode(acc.data.subarray(32, 64));
    if (mint !== cfg.reserveMint) out.push(`${field} holds mint ${mint}, not ${cfg.reserveMint}`);
    if (owner === operator) out.push(`${field} is owned by the operator ${operator}; money accounts must not be`);
  }
  return out;
}
