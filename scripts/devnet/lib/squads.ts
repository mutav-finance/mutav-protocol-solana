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

export async function squadsVaultAddress(multisig: Address, vaultIndex = 0): Promise<Address> {
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

/**
 * Launch checks on the multisig (spec §14.5 step 8, plan Task 12):
 * autonomous (`config_authority == default`), `time_lock ≥ floor`, and a
 * threshold that at least 1 and no more than the voting members.
 * Returns the failures; empty means the multisig passes.
 */
export function checkSquadsMultisig(m: SquadsMultisig, timeLockFloorSecs: number): string[] {
  const out: string[] = [];
  if (m.configAuthority !== DEFAULT_PUBKEY) {
    out.push(`config_authority is ${m.configAuthority}; must be Pubkey::default() (an autonomous multisig)`);
  }
  if (m.timeLock < timeLockFloorSecs) out.push(`time_lock ${m.timeLock}s is below the floor ${timeLockFloorSecs}s`);
  const voters = m.members.filter((x) => x.permissions & PERMISSION.vote).length;
  if (m.threshold < 1 || m.threshold > voters) out.push(`threshold ${m.threshold} with ${voters} voting member(s)`);
  return out;
}
