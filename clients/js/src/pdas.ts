/**
 * PDA helpers (spec §3). The generated `find*Pda` functions cover the PDAs
 * whose seeds the IDL describes; this file adds the ones it cannot (seeded by
 * a queue `seq`), the income inbox (an associated token
 * account, ADR 0017) and one call for every reserve-level address.
 */
import {
  getAddressEncoder,
  getProgramDerivedAddress,
  getU64Encoder,
  getUtf8Encoder,
  type Address,
  type ProgramDerivedAddress,
  type ReadonlyUint8Array,
} from '@solana/kit';
import { findConfigPda } from './generated/pdas/config';
import { MUTAV_PROGRAM_ADDRESS } from './generated/programs/mutav';
import { U64_MAX } from './math';

type ProgramOpt = { programAddress?: Address };

const utf8 = getUtf8Encoder();
const addr = getAddressEncoder();

function pda(seeds: (string | ReadonlyUint8Array)[], o: ProgramOpt = {}): Promise<ProgramDerivedAddress> {
  return getProgramDerivedAddress({
    programAddress: o.programAddress ?? MUTAV_PROGRAM_ADDRESS,
    seeds: seeds.map((s) => (typeof s === 'string' ? utf8.encode(s) : s)),
  });
}

function seqBytes(seq: bigint): ReadonlyUint8Array {
  if (typeof seq !== 'bigint' || seq < 0n || seq > U64_MAX) throw new RangeError('seq must be a u64 bigint');
  return getU64Encoder().encode(seq);
}

/** Every address of one reserve, keyed by its BRS mint. */
export type ReserveAddresses = {
  config: Address;
  state: Address;
  vaultAuthority: Address;
  shareMint: Address;
  reserve: Address;
  pendingDeposits: Address;
  pendingRedemptions: Address;
  claims: Address;
  /** Anchor's `emit_cpi!` authority. */
  eventAuthority: Address;
};

export async function findReserveAddresses(reserveMint: Address, o: ProgramOpt = {}): Promise<ReserveAddresses> {
  const [config] = await findConfigPda({ reserveMint }, o);
  const c = addr.encode(config);
  const one = async (seed: string) => (await pda([seed, c], o))[0];
  const [state, vaultAuthority, shareMint, reserve, pendingDeposits, pendingRedemptions, claims] = await Promise.all(
    ['state', 'authority', 'share_mint', 'reserve', 'pending_deposits', 'pending_redemptions', 'claims'].map(one),
  );
  const [eventAuthority] = await pda(['__event_authority'], o);
  return {
    config,
    state: state!,
    vaultAuthority: vaultAuthority!,
    shareMint: shareMint!,
    reserve: reserve!,
    pendingDeposits: pendingDeposits!,
    pendingRedemptions: pendingRedemptions!,
    claims: claims!,
    eventAuthority,
  };
}

/** `DepositRequest`: `["deposit", config, seq (u64 LE)]`. */
export const findDepositRequestPda = (s: { config: Address; seq: bigint }, o: ProgramOpt = {}) =>
  Promise.resolve().then(() => pda(['deposit', addr.encode(s.config), seqBytes(s.seq)], o));

/** `RedeemRequest`: `["redeem", config, seq (u64 LE)]`. */
export const findRedeemRequestPda = (s: { config: Address; seq: bigint }, o: ProgramOpt = {}) =>
  Promise.resolve().then(() => pda(['redeem', addr.encode(s.config), seqBytes(s.seq)], o));

/** The classic SPL Token program (BRS is a classic SPL mint). */
export const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as Address;
/** The associated token account program. */
export const ASSOCIATED_TOKEN_PROGRAM_ADDRESS = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL' as Address;

/**
 * The income inbox (spec §3.3, ADR 0017): the vault authority's associated
 * token account for the reserve mint, under the reserve's token program.
 * `tokenProgram` is required (pass `config.reserveTokenProgram`): a
 * Token-2022 reserve's inbox is a different address, and a default would
 * silently derive the wrong one (#29). Nora pays
 * the monthly revenue share here; `sweep_income` moves a statement's amount
 * into the reserve. Its balance never counts toward NAV.
 */
export async function findIncomeInboxAddress(s: {
  vaultAuthority: Address;
  reserveMint: Address;
  tokenProgram: Address;
}): Promise<Address> {
  const [inbox] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    seeds: [
      addr.encode(s.vaultAuthority),
      addr.encode(s.tokenProgram),
      addr.encode(s.reserveMint),
    ],
  });
  return inbox;
}
