/**
 * Deploy configuration (one JSON file per reserve and cluster). See
 * `devnet.example.json`. Values marked `<FILL: …>` are founder inputs; the
 * loader refuses any left unfilled.
 *
 * Bounds mirror the program's (`instructions/admin/mod.rs`) so a bad file
 * fails here, before a proposal is built; the program checks them again.
 */
import { readFileSync } from 'node:fs';
import { address, type Address } from '@solana/kit';
import type { CapsInputArgs } from '../../../clients/js/src';

export type DeployConfig = {
  cluster: 'localnet' | 'devnet';
  programId: Address;
  reserveMint: Address;
  reserveTokenProgram: Address;
  /** Squads v4 multisig whose vault is `admin`. */
  squads: { multisig: Address; vaultIndex: number; timeLockFloorSecs: number };
  /** `VaultConfig.admin`: the Squads vault. */
  admin: Address;
  /** Program upgrade authority: the same vault, or the upgrade multisig's (spec §12 Q15). */
  upgradeAuthority: Address;
  operator: Address;
  pauser: Address;
  mutavCapitalWallet: Address;
  treasuryAccount: Address;
  paymentsAccount: Address;
  coverageRatioBps: number;
  feeTakeBps: number;
  caps: CapsInputArgs & {
    maxTvl: bigint;
    maxCoverPerGuarantee: bigint;
    maxClaimPerCall: bigint;
    /** Per 31-day window (ADR 0019). */
    maxClaimPerPeriod: bigint;
    minRequest: bigint;
    maxRequest: bigint;
    maxNavMoveBps: number;
  };
  /** Owners allowlisted for `request_deposit` / `request_redeem`. */
  allowlist: Address[];
};

const FILL = /^<FILL/;

function walkPlaceholders(v: unknown, path: string, out: string[]) {
  if (typeof v === 'string' && FILL.test(v)) out.push(`${path}: ${v}`);
  else if (Array.isArray(v)) v.forEach((x, i) => walkPlaceholders(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) if (!k.startsWith('_')) walkPlaceholders(x, path ? `${path}.${k}` : k, out);
  }
}

const big = (v: unknown, path: string) => {
  if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return BigInt(v);
  throw new Error(`${path} must be an integer (use a string above 2^53)`);
};
const int = (v: unknown, path: string, max: number) => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) {
    throw new Error(`${path} must be an integer in [0, ${max}]`);
  }
  return v;
};
const addr = (v: unknown, path: string) => {
  if (typeof v !== 'string') throw new Error(`${path} must be an address`);
  try {
    return address(v);
  } catch {
    throw new Error(`${path} is not a valid address: ${v}`);
  }
};

/** Parse and validate a config object. Throws listing every unfilled placeholder. */
export function parseConfig(raw: any): DeployConfig {
  const missing: string[] = [];
  walkPlaceholders(raw, '', missing);
  if (missing.length) throw new Error(`config has unfilled founder inputs:\n  ${missing.join('\n  ')}`);

  if (raw.cluster !== 'localnet' && raw.cluster !== 'devnet') throw new Error('cluster must be localnet or devnet');
  const bps = (v: unknown, p: string) => int(v, p, 10_000);
  const c: DeployConfig = {
    cluster: raw.cluster,
    programId: addr(raw.programId, 'programId'),
    reserveMint: addr(raw.reserveMint, 'reserveMint'),
    reserveTokenProgram: addr(raw.reserveTokenProgram, 'reserveTokenProgram'),
    squads: {
      multisig: addr(raw.squads?.multisig, 'squads.multisig'),
      vaultIndex: int(raw.squads?.vaultIndex, 'squads.vaultIndex', 255),
      timeLockFloorSecs: int(raw.squads?.timeLockFloorSecs, 'squads.timeLockFloorSecs', 2 ** 32 - 1),
    },
    admin: addr(raw.admin, 'admin'),
    upgradeAuthority: addr(raw.upgradeAuthority, 'upgradeAuthority'),
    operator: addr(raw.operator, 'operator'),
    pauser: addr(raw.pauser, 'pauser'),
    mutavCapitalWallet: addr(raw.mutavCapitalWallet, 'mutavCapitalWallet'),
    treasuryAccount: addr(raw.treasuryAccount, 'treasuryAccount'),
    paymentsAccount: addr(raw.paymentsAccount, 'paymentsAccount'),
    coverageRatioBps: int(raw.coverageRatioBps, 'coverageRatioBps', 65_535),
    feeTakeBps: int(raw.feeTakeBps, 'feeTakeBps', 65_535),
    caps: {
      maxTvl: big(raw.caps?.maxTvl, 'caps.maxTvl'),
      maxCoverPerGuarantee: big(raw.caps?.maxCoverPerGuarantee, 'caps.maxCoverPerGuarantee'),
      maxClaimPerCall: big(raw.caps?.maxClaimPerCall, 'caps.maxClaimPerCall'),
      maxClaimPerPeriod: big(raw.caps?.maxClaimPerPeriod, 'caps.maxClaimPerPeriod'),
      minRequest: big(raw.caps?.minRequest, 'caps.minRequest'),
      maxRequest: big(raw.caps?.maxRequest, 'caps.maxRequest'),
      maxNavMoveBps: bps(raw.caps?.maxNavMoveBps, 'caps.maxNavMoveBps'),
    },
    allowlist: (raw.allowlist ?? []).map((a: unknown, i: number) => addr(a, `allowlist[${i}]`)),
  };

  // Program bounds (validate_params, validate_roles).
  if (c.feeTakeBps > 3_000) throw new Error('feeTakeBps must be <= 3000 (program maximum, 30%)');
  if (c.coverageRatioBps < 1_000) throw new Error('coverageRatioBps must be >= 1000 (program minimum, c = 0.10; ADR 0016)');
  if (c.caps.minRequest > c.caps.maxRequest) throw new Error('caps.minRequest must be <= caps.maxRequest');
  const roles = [c.admin, c.operator, c.pauser];
  if (new Set(roles).size !== 3) throw new Error('admin, operator and pauser must be distinct');
  if (c.treasuryAccount === c.paymentsAccount) throw new Error('treasuryAccount and paymentsAccount must differ');
  if (c.allowlist.length === 0) throw new Error('allowlist is empty (a zero root allowlists nobody)');
  return c;
}

export function loadConfig(path: string): DeployConfig {
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')));
}
