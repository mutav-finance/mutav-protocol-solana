/**
 * `governance/expected-state.<cluster>.json`: what the governance watcher
 * expects to find on-chain. The repo is the source of truth; the watcher
 * keeps no state of its own. Parsing is strict: a malformed file is a run
 * error (exit 2), never a silent pass.
 */
import { address, type Address } from '@solana/kit';

export type ExpectedMember = { key: Address; permissions: number };

export type ExpectedMultisig = {
  address: Address;
  vaultIndex: number;
  vault: Address;
  members: ExpectedMember[];
  threshold: number;
  timeLockSecs: number;
  configAuthority: Address;
  /** The highest transaction index the repo has acknowledged (intent committed and outcome recorded). */
  lastKnownTransactionIndex: bigint;
};

export type ExpectedCaps = {
  maxTvl: bigint;
  maxCoverPerGuarantee: bigint;
  maxClaimPerCall: bigint;
  maxClaimPerPeriod: bigint;
  minRequest: bigint;
  maxRequest: bigint;
  maxNavMoveBps: number;
  stressBuffer: bigint;
  maxQueueWaitSecs: bigint;
  maxReinstateAge: bigint;
};

export type ExpectedState = {
  cluster: 'localnet' | 'devnet';
  multisigs: { admin: ExpectedMultisig; upgrade: ExpectedMultisig };
  program: { id: Address; upgradeAuthority: Address; executableHash: string };
  config: {
    address: Address;
    reserveMint: Address;
    admin: Address;
    operator: Address;
    pauser: Address;
    guardians: Address[];
    paymentsAccount: Address;
    treasuryAccount: Address;
    paused: boolean;
    coverageRatioBps: number;
    feeTakeBps: number;
    caps: ExpectedCaps;
  };
  reserve: { tokenAccount: Address; outflowAlertThreshold: bigint; outflowWindowSecs: number };
};

type Json = Record<string, unknown>;

function obj(v: unknown, at: string): Json {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${at} must be an object`);
  return v as Json;
}

function addr(v: unknown, at: string): Address {
  if (typeof v !== 'string') throw new Error(`${at} must be a base58 address`);
  try {
    return address(v);
  } catch {
    throw new Error(`${at} is not a valid address: ${v}`);
  }
}

function int(v: unknown, at: string, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > max) throw new Error(`${at} must be an integer in [0, ${max}]`);
  return v;
}

/** u64 values (and the i64 caps, which are `>= 0` by spec) are strings (JSON numbers lose precision past 2^53); small integers are accepted too. */
function u64(v: unknown, at: string): bigint {
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v !== 'string' || !/^\d{1,20}$/.test(v)) throw new Error(`${at} must be a decimal u64 string`);
  const b = BigInt(v);
  if (b > 0xffff_ffff_ffff_ffffn) throw new Error(`${at} exceeds u64`);
  return b;
}

function bool(v: unknown, at: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`${at} must be true or false`);
  return v;
}

function multisig(v: unknown, at: string): ExpectedMultisig {
  const m = obj(v, at);
  if (!Array.isArray(m.members) || m.members.length === 0) throw new Error(`${at}.members must be a non-empty array`);
  return {
    address: addr(m.address, `${at}.address`),
    vaultIndex: int(m.vaultIndex, `${at}.vaultIndex`, 255),
    vault: addr(m.vault, `${at}.vault`),
    members: m.members.map((x, i) => {
      const e = obj(x, `${at}.members[${i}]`);
      return { key: addr(e.key, `${at}.members[${i}].key`), permissions: int(e.permissions, `${at}.members[${i}].permissions`, 7) };
    }),
    threshold: int(m.threshold, `${at}.threshold`, 0xffff),
    timeLockSecs: int(m.timeLockSecs, `${at}.timeLockSecs`, 0xffff_ffff),
    configAuthority: addr(m.configAuthority, `${at}.configAuthority`),
    lastKnownTransactionIndex: u64(m.lastKnownTransactionIndex, `${at}.lastKnownTransactionIndex`),
  };
}

export function parseExpectedState(raw: unknown): ExpectedState {
  const r = obj(raw, 'expected state');
  if (r.cluster !== 'devnet' && r.cluster !== 'localnet') throw new Error('cluster must be "devnet" or "localnet" (mainnet is refused)');
  const ms = obj(r.multisigs, 'multisigs');
  const p = obj(r.program, 'program');
  const c = obj(r.config, 'config');
  const caps = obj(c.caps, 'config.caps');
  const res = obj(r.reserve, 'reserve');
  const hash = typeof p.executableHash === 'string' ? p.executableHash.toLowerCase() : '';
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error('program.executableHash must be 64 hex characters');
  if (!Array.isArray(c.guardians)) throw new Error('config.guardians must be an array');
  return {
    cluster: r.cluster,
    multisigs: { admin: multisig(ms.admin, 'multisigs.admin'), upgrade: multisig(ms.upgrade, 'multisigs.upgrade') },
    program: { id: addr(p.id, 'program.id'), upgradeAuthority: addr(p.upgradeAuthority, 'program.upgradeAuthority'), executableHash: hash },
    config: {
      address: addr(c.address, 'config.address'),
      reserveMint: addr(c.reserveMint, 'config.reserveMint'),
      admin: addr(c.admin, 'config.admin'),
      operator: addr(c.operator, 'config.operator'),
      pauser: addr(c.pauser, 'config.pauser'),
      guardians: c.guardians.map((g, i) => addr(g, `config.guardians[${i}]`)),
      paymentsAccount: addr(c.paymentsAccount, 'config.paymentsAccount'),
      treasuryAccount: addr(c.treasuryAccount, 'config.treasuryAccount'),
      paused: bool(c.paused, 'config.paused'),
      coverageRatioBps: int(c.coverageRatioBps, 'config.coverageRatioBps', 0xffff),
      feeTakeBps: int(c.feeTakeBps, 'config.feeTakeBps', 0xffff),
      caps: {
        maxTvl: u64(caps.maxTvl, 'config.caps.maxTvl'),
        maxCoverPerGuarantee: u64(caps.maxCoverPerGuarantee, 'config.caps.maxCoverPerGuarantee'),
        maxClaimPerCall: u64(caps.maxClaimPerCall, 'config.caps.maxClaimPerCall'),
        maxClaimPerPeriod: u64(caps.maxClaimPerPeriod, 'config.caps.maxClaimPerPeriod'),
        minRequest: u64(caps.minRequest, 'config.caps.minRequest'),
        maxRequest: u64(caps.maxRequest, 'config.caps.maxRequest'),
        maxNavMoveBps: int(caps.maxNavMoveBps, 'config.caps.maxNavMoveBps', 0xffff),
        stressBuffer: u64(caps.stressBuffer, 'config.caps.stressBuffer'),
        maxQueueWaitSecs: u64(caps.maxQueueWaitSecs, 'config.caps.maxQueueWaitSecs'),
        maxReinstateAge: u64(caps.maxReinstateAge, 'config.caps.maxReinstateAge'),
      },
    },
    reserve: {
      tokenAccount: addr(res.tokenAccount, 'reserve.tokenAccount'),
      outflowAlertThreshold: u64(res.outflowAlertThreshold, 'reserve.outflowAlertThreshold'),
      outflowWindowSecs: int(res.outflowWindowSecs, 'reserve.outflowWindowSecs'),
    },
  };
}

/**
 * The intent path the signing ceremony prescribes (docs/security/signing-ceremony.md):
 * `governance/intents/<cluster>/<first 8 chars of the multisig>/<index>.json`.
 * Same convention as `intentPath` in scripts/release/lib/intent.ts (PR #114);
 * deduplicate once that lands on main.
 */
export const intentPath = (cluster: string, multisig: Address, index: bigint) =>
  `governance/intents/${cluster}/${multisig.slice(0, 8)}/${index}.json`;
