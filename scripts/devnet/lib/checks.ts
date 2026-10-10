/**
 * Post-deploy checks (plan Task 12): read-only, pure over decoded data, so
 * they run the same against a local validator, a fork or devnet.
 */
import { getAddressDecoder, type Address } from '@solana/kit';
import type { VaultConfig, VaultState } from '../../../clients/js/src';

/**
 * Upgrade authority from a BPF Loader Upgradeable `ProgramData` account:
 * `u32 tag (3) | u64 slot | Option<Pubkey>`. `null` means immutable.
 */
export function programDataUpgradeAuthority(data: Uint8Array): Address | null {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.length < 45 || dv.getUint32(0, true) !== 3) throw new Error('not a ProgramData account');
  const tag = data[12];
  if (tag === 0) return null;
  if (tag !== 1) throw new Error('bad Option tag in ProgramData');
  return getAddressDecoder().decode(data.subarray(13, 45));
}

/** Every cap is sized for BRS base units (6 dp); a 9-dp mint would shrink them 1000x. */
export const RESERVE_DECIMALS = 6;

/**
 * The reserve mint as read from the chain: owned by the configured token
 * program, an initialised mint, with 6 decimals. Returns the failures.
 */
export function checkReserveMint(
  account: { owner: Address; data: Uint8Array } | null,
  cfg: { reserveMint: Address; reserveTokenProgram: Address },
): string[] {
  if (!account) return [`reserve mint ${cfg.reserveMint} not found`];
  const out: string[] = [];
  if (account.owner !== cfg.reserveTokenProgram) {
    out.push(`reserve mint ${cfg.reserveMint} is owned by ${account.owner}, not reserveTokenProgram ${cfg.reserveTokenProgram}`);
  }
  // SPL Token / Token-2022 base Mint layout: decimals at 44, is_initialized at 45.
  if (account.data.length < 82) return [...out, `reserve mint ${cfg.reserveMint} is not a mint (${account.data.length} bytes)`];
  if (account.data[45] !== 1) out.push(`reserve mint ${cfg.reserveMint} is not initialised`);
  const decimals = account.data[44]!;
  if (decimals !== RESERVE_DECIMALS) out.push(`reserve mint ${cfg.reserveMint} has decimals ${decimals}, expected ${RESERVE_DECIMALS}`);
  return out;
}

export type Expected = {
  upgradeAuthority: Address;
  admin: Address;
  operator?: Address;
  pauser?: Address;
  allowlistRoot?: Uint8Array;
};

/** Returns the failed checks; empty means all pass. */
export function postDeployChecks(
  programData: Uint8Array,
  config: VaultConfig,
  state: VaultState,
  e: Expected,
): string[] {
  const out: string[] = [];
  const ua = programDataUpgradeAuthority(programData);
  if (ua !== e.upgradeAuthority) out.push(`upgrade authority is ${ua ?? 'none (immutable)'}, expected ${e.upgradeAuthority}`);
  if (config.featureFlags !== 0n) out.push(`feature_flags is ${config.featureFlags}, expected 0`);
  if (config.admin !== e.admin) out.push(`admin is ${config.admin}, expected ${e.admin}`);
  if (e.operator && config.operator !== e.operator) out.push(`operator is ${config.operator}, expected ${e.operator}`);
  if (e.pauser && config.pauser !== e.pauser) out.push(`pauser is ${config.pauser}, expected ${e.pauser}`);
  if (e.allowlistRoot) {
    const got = Buffer.from(config.investorAllowlistRoot as Uint8Array).toString('hex');
    const want = Buffer.from(e.allowlistRoot).toString('hex');
    if (got !== want) out.push(`allowlist root is ${got}, expected ${want}`);
  }
  if (config.paused) out.push('reserve is paused');
  return out;
}
