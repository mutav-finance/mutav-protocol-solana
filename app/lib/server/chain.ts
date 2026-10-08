/**
 * On-chain reads for the route handlers, through the protocol client's
 * decoders and PDA helpers. Read-only: nothing here signs or sends.
 */
import {
  createSolanaRpc,
  getBase58Decoder,
  getBase58Encoder,
  getBase64Encoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  AGENCY_EXPOSURE_DISCRIMINATOR,
  CLAIM_FILING_DISCRIMINATOR,
  FEE_RECEIPT_DISCRIMINATOR,
  INCOME_RECEIPT_DISCRIMINATOR,
  PAYOUT_DISCRIMINATOR,
  fetchIncomeInbox,
  findIncomeReceiptPda,
  getIncomeReceiptDecoder,
  fetchAllMaybeDepositRequest,
  fetchAllMaybeRedeemRequest,
  GUARANTEE_DISCRIMINATOR,
  findGuaranteePda,
  getGuaranteeDecoder,
  fetchVaultConfig,
  fetchVaultState,
  findAgencyExposurePda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findRedeemRequestPda,
  findReserveAddresses,
  getAgencyExposureDecoder,
  getClaimFilingDecoder,
  getFeeReceiptDecoder,
  getPayoutDecoder,
  solvencyFromAccounts,
  DEPOSITS_FULFILLED_EVENT_DISCRIMINATOR,
  REDEEMS_FULFILLED_EVENT_DISCRIMINATOR,
  getDepositsFulfilledEventDecoder,
  getRedeemsFulfilledEventDecoder,
} from "@mutav-finance/mutav-protocol-solana";
import { fetchEncodedAccount, getAddressDecoder } from "@solana/kit";
import type { CapitalEvent, Ledger, ReserveView, Row, TokenFacts } from "../view";
import { serverEnv, type ServerEnv } from "./env";

export class NotConfiguredError extends Error {
  override name = "NotConfiguredError";
}

let cached: { url: string; rpc: ReturnType<typeof createSolanaRpc> } | null = null;
export function rpcFor(env: ServerEnv) {
  if (!cached || cached.url !== env.rpcUrl) cached = { url: env.rpcUrl, rpc: createSolanaRpc(env.rpcUrl) };
  return cached.rpc;
}

/** Reads see a transaction as soon as it confirms (the RPC default is finalized, ~13 s behind). */
export const READ = { commitment: "confirmed" as const };

const b58 = getBase58Decoder();
const b64 = getBase64Encoder();
const b58enc = getBase58Encoder();

/** Cluster time: block time of the current slot, falling back to the wall clock. */
async function clusterNow(env: ServerEnv): Promise<{ slot: bigint; now: bigint }> {
  const rpc = rpcFor(env);
  const slot = await rpc.getSlot(READ).send();
  let t: bigint | null = null;
  try {
    t = (await rpc.getBlockTime(slot).send()) as unknown as bigint | null;
  } catch {
    t = null;
  }
  return { slot, now: t !== null ? BigInt(t) : BigInt(Math.floor(Date.now() / 1000)) };
}

export async function readReserve(env = serverEnv()): Promise<ReserveView> {
  if (!env.configAddress) throw new NotConfiguredError("CONFIG_ADDRESS is not set");
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = await fetchVaultConfig(rpc, env.configAddress, READ);
  const addresses = await findReserveAddresses(config.data.reserveMint, o);
  if (addresses.config !== env.configAddress) {
    throw new Error(`CONFIG_ADDRESS ${env.configAddress} is not the config PDA of its reserve mint under ${env.programId}`);
  }
  const [state, clock, token, inbox] = await Promise.all([
    fetchVaultState(rpc, addresses.state, READ),
    clusterNow(env),
    readTokenFacts(env, config.data.reserveMint, addresses.reserve),
    // ADR 0017: issuer income paid and not swept yet (never in NAV).
    fetchIncomeInbox(rpc, {
      vaultAuthority: addresses.vaultAuthority,
      reserveMint: config.data.reserveMint,
      tokenProgram: config.data.reserveTokenProgram,
    }),
  ]);
  return {
    cluster: env.cluster,
    programId: env.programId,
    explorerRpc: env.explorerRpc,
    addresses,
    config: config.data,
    state: state.data,
    solvency: solvencyFromAccounts(config.data, state.data),
    now: clock.now,
    slot: clock.slot,
    token,
    incomeInbox: { address: inbox.address, exists: inbox.exists, amount: inbox.amount },
  };
}

/**
 * SPL Token facts the disclosures need, decoded from the raw accounts:
 * Mint: [0..4) mint-authority option, [4..36) authority, [36..44) supply,
 * [44] decimals, [45] initialized, [46..50) freeze-authority option, [50..82) freeze authority.
 * Token account: [108] state (1 = initialized, 2 = frozen).
 */
async function readTokenFacts(env: ServerEnv, mint: Address, reserve: Address): Promise<TokenFacts> {
  const rpc = rpcFor(env);
  const [m, r] = await Promise.all([fetchEncodedAccount(rpc, mint, READ), fetchEncodedAccount(rpc, reserve, READ)]);
  const ad = getAddressDecoder();
  let freezeAuthority: string | null = null;
  let supply: bigint | null = null;
  if (m.exists && m.data.length >= 82) {
    const d = m.data as Uint8Array;
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    supply = dv.getBigUint64(36, true);
    if (dv.getUint32(46, true) === 1) freezeAuthority = ad.decode(d.subarray(50, 82));
  }
  const reserveFrozen = r.exists && (r.data as Uint8Array).length > 108 ? (r.data as Uint8Array)[108] === 2 : false;
  return { mint, mintOwner: m.exists ? m.programAddress : null, freezeAuthority, supply, reserveFrozen };
}

/** Every program account of one type (by discriminator), decoded. */
async function scan<T>(env: ServerEnv, discriminator: ReadonlyUint8Array, decode: (b: Uint8Array) => T): Promise<Row<T>[]> {
  const rows = (await rpcFor(env)
    .getProgramAccounts(env.programId, {
      ...READ,
      encoding: "base64",
      filters: [{ memcmp: { offset: 0n, bytes: b58.decode(discriminator), encoding: "base58" } }],
    } as never)
    .send()) as unknown as { pubkey: Address; account: { data: [string, string] } }[];
  return rows.map(({ pubkey, account }) => ({ address: pubkey, data: decode(b64.encode(account.data[0]) as Uint8Array) }));
}

/** Most queue seqs read per side; the pilot queue is far shorter. */
const MAX_SEQS = 256n;

const seqRange = (next: bigint) => {
  const from = next > MAX_SEQS ? next - MAX_SEQS : 0n;
  return Array.from({ length: Number(next - from) }, (_, i) => from + BigInt(i));
};

export async function readLedger(env = serverEnv(), reserve?: ReserveView): Promise<Ledger> {
  const r = reserve ?? (await readReserve(env));
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = r.addresses.config as Address;

  const [guaranteesAll, filingsAll, payoutsAll, exposuresAll, feesAll, incomeAll] = await Promise.all([
    scan(env, GUARANTEE_DISCRIMINATOR, (b) => getGuaranteeDecoder().decode(b)),
    scan(env, CLAIM_FILING_DISCRIMINATOR, (b) => getClaimFilingDecoder().decode(b)),
    scan(env, PAYOUT_DISCRIMINATOR, (b) => getPayoutDecoder().decode(b)),
    scan(env, AGENCY_EXPOSURE_DISCRIMINATOR, (b) => getAgencyExposureDecoder().decode(b)),
    scan(env, FEE_RECEIPT_DISCRIMINATOR, (b) => getFeeReceiptDecoder().decode(b)),
    scan(env, INCOME_RECEIPT_DISCRIMINATOR, (b) => getIncomeReceiptDecoder().decode(b)),
  ]);

  // Keep only accounts of this reserve: filings and payouts by guarantee, the
  // rest by re-deriving their PDA under this config.
  const guaranteeOk = await Promise.all(guaranteesAll.map(async (g) => (await findGuaranteePda({ config, id: g.data.id }, o))[0] === g.address));
  const guarantees = guaranteesAll.filter((_, i) => guaranteeOk[i]);
  const mine = new Set(guarantees.map((g) => g.address as string));
  const filings = filingsAll.filter((f) => mine.has(f.data.guarantee));
  const payouts = payoutsAll.filter((p) => mine.has(p.data.guarantee));
  const exposureOk = await Promise.all(
    exposuresAll.map(async (e) => (await findAgencyExposurePda({ config, agencyId: e.data.agencyId }, o))[0] === e.address),
  );
  const feeOk = await Promise.all(
    feesAll.map(async (f) => (await findFeeReceiptPda({ config, invoiceRefHash: f.data.invoiceRefHash }, o))[0] === f.address),
  );
  const incomeOk = await Promise.all(
    incomeAll.map(async (i) => (await findIncomeReceiptPda({ config, incomeRefHash: i.data.incomeRefHash }, o))[0] === i.address),
  );
  const exposures = exposuresAll.filter((_, i) => exposureOk[i]);
  const blockTimeOf = async (slot: bigint): Promise<bigint | null> => {
    try {
      const t = await rpc.getBlockTime(slot).send();
      return t === null ? null : BigInt(t as unknown as number);
    } catch {
      return null;
    }
  };
  const fees = await Promise.all(feesAll.filter((_, i) => feeOk[i]).map(async (f) => ({ ...f, blockTime: await blockTimeOf(f.data.slot) })));
  const income = await Promise.all(incomeAll.filter((_, i) => incomeOk[i]).map(async (r) => ({ ...r, blockTime: await blockTimeOf(r.data.slot) })));

  const depSeqs = seqRange(r.state.nextDepositSeq);
  const redSeqs = seqRange(r.state.nextRedeemSeq);
  const [depAddrs, redAddrs] = await Promise.all([
    Promise.all(depSeqs.map(async (seq) => (await findDepositRequestPda({ config, seq }, o))[0])),
    Promise.all(redSeqs.map(async (seq) => (await findRedeemRequestPda({ config, seq }, o))[0])),
  ]);
  const [depAccs, redAccs] = await Promise.all([
    depAddrs.length ? fetchAllMaybeDepositRequest(rpc, depAddrs, READ) : Promise.resolve([]),
    redAddrs.length ? fetchAllMaybeRedeemRequest(rpc, redAddrs, READ) : Promise.resolve([]),
  ]);

  const capitalEvents = await readCapitalEvents(env, r);

  return {
    capitalEvents,
    guarantees: guarantees.map((g) => ({ address: g.address, data: g.data })),
    filings,
    payouts,
    exposures,
    fees,
    income,
    deposits: depAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
    redeems: redAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
  };
}

// ── Capital events (deposit / redemption fills) ─────────────────────────────
//
// `claim_shares` and `claim_assets` close their request accounts, so fills are
// read from the program's events: Anchor `emit_cpi!` self-invocations, found
// in the inner instructions of the transactions that touched the escrows.

/** Anchor's EVENT_IX_TAG (`sha256("anchor:event")[..8]`, little-endian u64). */
const EVENT_IX_TAG = new Uint8Array([0xe4, 0x45, 0xa5, 0x2e, 0x51, 0xcb, 0x9a, 0x1d]);
const startsWith = (b: Uint8Array, p: ArrayLike<number>, at = 0) => Array.from(p).every((x, i) => b[at + i] === x);

/** Confirmed transactions never change: decode each signature once per server process. */
const eventCache = new Map<string, CapitalEvent[]>();

type JsonTx = {
  blockTime: bigint | null;
  transaction: { message: { accountKeys: string[] } };
  meta: { err: unknown; loadedAddresses?: { writable: string[]; readonly: string[] }; innerInstructions?: { instructions: { programIdIndex: number; data: string }[] }[] } | null;
};

async function eventsOf(env: ServerEnv, signature: string, config: string): Promise<CapitalEvent[]> {
  const hit = eventCache.get(signature);
  if (hit) return hit;
  const tx = (await rpcFor(env)
    .getTransaction(signature as never, { ...READ, encoding: "json", maxSupportedTransactionVersion: 0 } as never)
    .send()) as unknown as JsonTx | null;
  if (!tx) return [];
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
  const out: CapitalEvent[] = [];
  for (const group of tx.meta?.innerInstructions ?? []) {
    for (const ix of group.instructions) {
      if (keys[ix.programIdIndex] !== env.programId) continue;
      const data = b58enc.encode(ix.data) as Uint8Array;
      if (!startsWith(data, EVENT_IX_TAG)) continue;
      const ev = data.subarray(8);
      if (startsWith(ev, DEPOSITS_FULFILLED_EVENT_DISCRIMINATOR)) {
        const e = getDepositsFulfilledEventDecoder().decode(ev);
        if (e.config === config) out.push({ side: "deposit", signature, ts: e.ts, fromSeq: e.fromSeq, toSeq: e.toSeq, assets: e.assets, shares: e.shares, nav: e.nav });
      } else if (startsWith(ev, REDEEMS_FULFILLED_EVENT_DISCRIMINATOR)) {
        const e = getRedeemsFulfilledEventDecoder().decode(ev);
        if (e.config === config) out.push({ side: "redemption", signature, ts: e.ts, fromSeq: e.fromSeq, toSeq: e.toSeq, assets: e.assets, shares: e.shares, nav: e.nav });
      }
    }
  }
  if (tx.meta && !tx.meta.err) eventCache.set(signature, out);
  return out;
}

/** Fills from the last 100 transactions on each escrow. */
export async function readCapitalEvents(env: ServerEnv, r: ReserveView): Promise<CapitalEvent[]> {
  const rpc = rpcFor(env);
  const sigs = new Set<string>();
  for (const a of [r.addresses.pendingDeposits, r.addresses.pendingRedemptions]) {
    const rows = await rpc.getSignaturesForAddress(a as Address, { ...READ, limit: 100 }).send();
    for (const row of rows) if (!row.err) sigs.add(row.signature);
  }
  const all = (await Promise.all([...sigs].map((s) => eventsOf(env, s, r.addresses.config)))).flat();
  return all.sort((a, b) => Number(b.ts - a.ts));
}
