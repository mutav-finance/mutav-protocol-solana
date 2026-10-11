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

/** A Squads v4 multisig as the deploy expects to find it on-chain. */
export type MultisigConfig = {
  multisig: Address;
  vaultIndex: number;
  /** Exactly these members, each with the vote permission. */
  members: Address[];
  /** Exactly this threshold. */
  threshold: number;
  /** The multisig's `time_lock` must be at least this. */
  timeLockFloorSecs: number;
};

/** Devnet time-lock floors (governance decision: admin 5 min, upgrade 1 h). */
export const DEVNET_TIME_LOCK_FLOORS = { admin: 300, upgrade: 3_600 } as const;

export type DeployConfig = {
  cluster: 'localnet' | 'devnet';
  programId: Address;
  reserveMint: Address;
  reserveTokenProgram: Address;
  /** Admin multisig: its vault is `VaultConfig.admin` (short time lock). */
  squads: MultisigConfig;
  /** Upgrade multisig: its vault is the program upgrade authority (long time lock; spec §12 Q15). */
  upgradeSquads: MultisigConfig;
  /** `VaultConfig.admin`: the admin multisig's vault. */
  admin: Address;
  /** Program upgrade authority: the upgrade multisig's vault. */
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

function multisigConfig(raw: any, path: string): MultisigConfig {
  const multisig = addr(raw?.multisig, `${path}.multisig`);
  if (!Array.isArray(raw?.members) || raw.members.length === 0) throw new Error(`${path}.members must list the multisig's members`);
  const members = raw.members.map((m: unknown, i: number) => addr(m, `${path}.members[${i}]`));
  if (new Set(members).size !== members.length) throw new Error(`${path}.members must be distinct`);
  const threshold = int(raw?.threshold, `${path}.threshold`, 65_535);
  if (threshold < 1 || threshold > members.length) throw new Error(`${path}.threshold must be in [1, ${members.length}] (the member count)`);
  return {
    multisig,
    vaultIndex: int(raw?.vaultIndex, `${path}.vaultIndex`, 255),
    members,
    threshold,
    timeLockFloorSecs: int(raw?.timeLockFloorSecs, `${path}.timeLockFloorSecs`, 2 ** 32 - 1),
  };
}

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
    squads: multisigConfig(raw.squads, 'squads'),
    upgradeSquads: multisigConfig(raw.upgradeSquads, 'upgradeSquads'),
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

  // Governance (two multisigs, devnet time-lock floors). The localnet dry run
  // stands one throwaway key in for both.
  if (c.cluster === 'devnet') {
    if (c.squads.multisig === c.upgradeSquads.multisig) throw new Error('squads and upgradeSquads must be different multisigs (admin and upgrade)');
    if (c.admin === c.upgradeAuthority) throw new Error('admin and upgradeAuthority must be different vaults');
    if (c.squads.timeLockFloorSecs < DEVNET_TIME_LOCK_FLOORS.admin) {
      throw new Error(`squads.timeLockFloorSecs must be >= ${DEVNET_TIME_LOCK_FLOORS.admin} on devnet`);
    }
    if (c.upgradeSquads.timeLockFloorSecs < DEVNET_TIME_LOCK_FLOORS.upgrade) {
      throw new Error(`upgradeSquads.timeLockFloorSecs must be >= ${DEVNET_TIME_LOCK_FLOORS.upgrade} on devnet`);
    }
    for (const k of ['squads', 'upgradeSquads'] as const) {
      if (c[k].threshold < 2) throw new Error(`${k}.threshold must be >= 2 on devnet`);
    }
  }
  return c;
}

export function loadConfig(path: string): DeployConfig {
  return parseConfig(JSON.parse(readFileSync(path, 'utf8')));
}
