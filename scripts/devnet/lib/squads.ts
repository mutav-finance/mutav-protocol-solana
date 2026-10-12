/**
 * Squads v4 reads: the vault PDA and the `Multisig` account, decoded by hand
 * so this repo does not depend on the Squads SDK. Layout (squads-protocol/v4,
 * `programs/squads_multisig_program/src/state/multisig.rs`):
 *
 *   discriminator            [u8; 8]  = sha256("account:Multisig")[..8]
 *   create_key               Pubkey
 *   config_authority         Pubkey   default() = autonomous
 *   threshold                u16
 *   time_lock                u32      seconds, counted from approval
 *   transaction_index        u64
 *   stale_transaction_index  u64
 *   rent_collector           Option<Pubkey>
 *   bump                     u8
 *   members                  Vec<{ key: Pubkey, permissions: u8 }>
 */
import { createHash } from 'node:crypto';
import {
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
  getUtf8Encoder,
  type Address,
} from '@solana/kit';

export const SQUADS_V4_PROGRAM = address('SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf');
export const MULTISIG_DISCRIMINATOR = createHash('sha256').update('account:Multisig').digest().subarray(0, 8);
export const DEFAULT_PUBKEY = address('11111111111111111111111111111111');

export type SquadsMultisig = {
  createKey: Address;
  configAuthority: Address;
  threshold: number;
  timeLock: number;
  transactionIndex: bigint;
  staleTransactionIndex: bigint;
  rentCollector: Address | null;
  bump: number;
  members: { key: Address; permissions: number }[];
};

/** A vault index from the command line: a decimal integer in [0, 255]; absent means 0. */
export function parseVaultIndex(v: string | undefined): number {
  if (v === undefined) return 0;
  if (!/^\d{1,3}$/.test(v) || Number(v) > 255) throw new Error(`vault index must be an integer in [0, 255], got "${v}"`);
  return Number(v);
}

export async function squadsVaultAddress(multisig: Address, vaultIndex = 0): Promise<Address> {
  // The seed is one byte: 256 or NaN would silently wrap to another vault.
  if (!Number.isInteger(vaultIndex) || vaultIndex < 0 || vaultIndex > 255) {
    throw new Error(`vault index must be an integer in [0, 255], got ${vaultIndex}`);
  }
  const utf8 = getUtf8Encoder();
  const [vault] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(multisig), utf8.encode('vault'), new Uint8Array([vaultIndex])],
  });
  return vault;
}

export function decodeSquadsMultisig(data: Uint8Array): SquadsMultisig {
  if (data.length < 8 || !MULTISIG_DISCRIMINATOR.equals(Buffer.from(data.subarray(0, 8)))) {
    throw new Error('not a Squads v4 Multisig account (discriminator mismatch)');
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const pk = getAddressDecoder();
  let o = 8;
  const key = () => {
    const k = pk.decode(data.subarray(o, o + 32));
    o += 32;
    return k;
  };
  const createKey = key();
  const configAuthority = key();
  const threshold = dv.getUint16(o, true);
  o += 2;
  const timeLock = dv.getUint32(o, true);
  o += 4;
  const transactionIndex = dv.getBigUint64(o, true);
  o += 8;
  const staleTransactionIndex = dv.getBigUint64(o, true);
  o += 8;
  const hasCollector = data[o++];
  if (hasCollector !== 0 && hasCollector !== 1) throw new Error('bad Option tag for rent_collector');
  const rentCollector = hasCollector ? key() : null;
  const bump = data[o++]!;
  const n = dv.getUint32(o, true);
  o += 4;
  if (o + n * 33 > data.length) throw new Error('members run past the account data');
  const members = Array.from({ length: n }, () => {
    const k = key();
    return { key: k, permissions: data[o++]! };
  });
  return { createKey, configAuthority, threshold, timeLock, transactionIndex, staleTransactionIndex, rentCollector, bump, members };
}

/** Squads `Permission` bits. */
export const PERMISSION = { initiate: 1, vote: 2, execute: 4 } as const;

/** What a multisig must look like (from the deploy config). */
export type ExpectedMultisig = { members: Address[]; threshold: number; timeLockFloorSecs: number };

/**
 * Launch checks on the multisig (spec §14.5 step 8): autonomous
 * (`config_authority == default`), `time_lock ≥` the floor, exactly the
 * configured members, each able to vote, and exactly the configured
 * threshold. Returns the failures; empty means the multisig passes.
 */
export function checkSquadsMultisig(m: SquadsMultisig, e: ExpectedMultisig): string[] {
  const out: string[] = [];
  if (m.configAuthority !== DEFAULT_PUBKEY) {
    out.push(`config_authority is ${m.configAuthority}; must be Pubkey::default() (an autonomous multisig)`);
  }
  if (m.timeLock < e.timeLockFloorSecs) out.push(`time_lock ${m.timeLock}s is below the floor ${e.timeLockFloorSecs}s`);
  const want = new Set<string>(e.members);
  const got = new Map<string, number>(m.members.map((x) => [x.key, x.permissions]));
  for (const k of want) {
    const p = got.get(k);
    if (p === undefined) out.push(`missing member ${k}`);
    else if (!(p & PERMISSION.vote)) out.push(`member ${k} cannot vote (permissions ${p})`);
  }
  for (const k of got.keys()) if (!want.has(k)) out.push(`unexpected member ${k}`);
  if (m.threshold !== e.threshold) out.push(`threshold ${m.threshold}, expected ${e.threshold}`);
  const voters = m.members.filter((x) => x.permissions & PERMISSION.vote).length;
  if (m.threshold < 1 || m.threshold > voters) out.push(`threshold ${m.threshold} with ${voters} voting member(s)`);
  return out;
}

/**
 * The multisig account as read from the chain: owned by the Squads v4
 * program, decodable, and passing `checkSquadsMultisig`. Each failure is
 * prefixed with `<label> multisig:`.
 */
export function checkSquadsAccount(
  account: { owner: Address; data: Uint8Array } | null,
  e: ExpectedMultisig,
  label: string,
): string[] {
  const tag = (f: string) => `${label} multisig: ${f}`;
  if (!account) return [`${label} multisig not found`];
  if (account.owner !== SQUADS_V4_PROGRAM) return [tag(`account owner is ${account.owner}, not owned by the Squads v4 program ${SQUADS_V4_PROGRAM}`)];
  try {
    return checkSquadsMultisig(decodeSquadsMultisig(account.data), e).map(tag);
  } catch (err) {
    return [tag((err as Error).message)];
  }
}
