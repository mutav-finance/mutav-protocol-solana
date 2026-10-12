/**
 * On-chain reads for the route handlers, through the protocol client's
 * decoders and PDA helpers. Read-only: nothing here signs or sends.
 */
import {
  assertAccountExists,
  createDefaultRpcTransport,
  createSolanaRpc,
  createSolanaRpcFromTransport,
  fetchEncodedAccounts,
  getBase58Decoder,
  getBase58Encoder,
  getBase64Encoder,
  type Address,
  type ReadonlyUint8Array,
} from "@solana/kit";
import {
  CLAIM_FILING_DISCRIMINATOR,
  INCOME_RECEIPT_DISCRIMINATOR,
  fetchIncomeInbox,
  findIncomeReceiptPda,
  getIncomeReceiptDecoder,
  fetchAllMaybeDepositRequest,
  fetchAllMaybeRedeemRequest,
  GUARANTEE_DISCRIMINATOR,
  findGuaranteePda,
  getGuaranteeDecoder,
  fetchVaultConfig,
  decodeVaultState,
  findDepositRequestPda,
  findFeeReceiptPda,
  findRedeemRequestPda,
  findReserveAddresses,
  getClaimFilingDecoder,
  coverageFromAccounts,
  DEPOSITS_FULFILLED_EVENT_DISCRIMINATOR,
  REDEEMS_FULFILLED_EVENT_DISCRIMINATOR,
  getDepositsFulfilledEventDecoder,
  getRedeemsFulfilledEventDecoder,
} from "@mutav-finance/mutav-protocol-solana";
import { getAddressDecoder, type MaybeEncodedAccount } from "@solana/kit";
import type { CapitalEvent, Ledger, LedgerAccounts, LedgerHistory, PaymentsFacts, ReserveView, Row, TokenFacts } from "../view";
import { assertGenesis } from "../cluster";
import { serverEnv, type ServerEnv } from "./env";
import { cachedRead, HEAVY_TTL_MS } from "./read-cache";
import { isUpstreamError, retryingTransport, schedulerFor } from "./rpc-retry";

export class NotConfiguredError extends Error {
  override name = "NotConfiguredError";
}

/** One RPC client per URL per instance; every call retries on HTTP 429 (rpc-retry.ts). */
let cached: { url: string; rpc: ReturnType<typeof createSolanaRpc> } | null = null;
export function rpcFor(env: ServerEnv) {
  if (!cached || cached.url !== env.rpcUrl) {
    const transport = retryingTransport(createDefaultRpcTransport({ url: env.rpcUrl }), { scheduler: schedulerFor(env.rpcUrl) });
    cached = { url: env.rpcUrl, rpc: createSolanaRpcFromTransport(transport) as ReturnType<typeof createSolanaRpc> };
  }
  return cached.rpc;
}

/** One genesis check per RPC URL per server instance (A4); a failed check is retried on the next request. */
const genesisChecked = new Map<string, Promise<void>>();

export function assertClusterGenesis(env: ServerEnv, read = async () => String(await rpcFor(env).getGenesisHash().send())): Promise<void> {
  let p = genesisChecked.get(env.rpcUrl);
  if (!p) {
    p = read().then((hash) => assertGenesis(hash, env.cluster, env.rpcUrl));
    p.catch(() => genesisChecked.delete(env.rpcUrl));
    genesisChecked.set(env.rpcUrl, p);
  }
  return p;
}

/** The server env, after the RPC's genesis hash matched the cluster. Every route starts here. */
export async function guardedEnv(): Promise<ServerEnv> {
  const env = serverEnv();
  await assertClusterGenesis(env);
  return env;
}

/** Reads see a transaction as soon as it confirms (the RPC default is finalized, ~13 s behind). */
export const READ = { commitment: "confirmed" as const };

const b58 = getBase58Decoder();
const b64 = getBase64Encoder();
const b58enc = getBase58Encoder();

const CLOCK_SYSVAR = "SysvarC1ock11111111111111111111111111111111" as Address;

/**
 * Cluster time from the Clock sysvar (what the program's `Clock::get()` sees):
 * slot u64 at [0..8), unix_timestamp i64 at [32..40). Read in the reserve's
 * account batch, so it costs no extra RPC call; the wall clock if absent.
 */
export function clockFacts(a: MaybeEncodedAccount): { slot: bigint; now: bigint } {
  if (!a.exists || (a.data as Uint8Array).length < 40) return { slot: 0n, now: BigInt(Math.floor(Date.now() / 1000)) };
  const d = a.data as Uint8Array;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return { slot: dv.getBigUint64(0, true), now: dv.getBigInt64(32, true) };
}

/**
 * The reserve snapshot for the READ routes, shared by all of them through the
 * read cache (one read per TTL per instance, concurrent callers coalesced).
 * Never stale: a composed read fails rather than build on an old snapshot,
 * and the route then answers with its own last good value. Transaction
 * routes call `readReserve` directly, never this.
 */
export async function readReserveShared(env: ServerEnv, opts: { fresh?: boolean } = {}): Promise<ReserveView> {
  return (await cachedRead("reserve", () => readReserve(env), { ...opts, allowStale: false })).value;
}

/** Block time per slot (immutable once confirmed), bounded. */
const blockTimes = new Map<bigint, bigint>();
const MAX_BLOCK_TIMES = 4096;

/** Concurrent RPC calls per fan-out (per-receipt block times, per-signature transactions). */
const FANOUT = 8;

/** `Promise.all(xs.map(fn))` with at most `limit` calls in flight; order kept. */
export async function mapLimit<A, B>(xs: readonly A[], fn: (x: A) => Promise<B>, limit = FANOUT): Promise<B[]> {
  const out = new Array<B>(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
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
  const [[stateAcc, mintAcc, reserveAcc, paymentsAcc, clockAcc], inbox] = await Promise.all([
    // One getMultipleAccounts for the state, the mint, the reserve, the payments account and the clock.
    fetchEncodedAccounts(rpc, [addresses.state, config.data.reserveMint, addresses.reserve, config.data.paymentsAccount, CLOCK_SYSVAR], READ),
    // ADR 0017: issuer income paid and not swept yet (never in NAV).
    fetchIncomeInbox(rpc, { vaultAuthority: addresses.vaultAuthority, config: config.data }),
  ]);
  assertAccountExists(stateAcc!);
  const state = decodeVaultState(stateAcc!);
  const token = tokenFacts(config.data.reserveMint, mintAcc!, reserveAcc!);
  const payments = paymentsFacts(env, paymentsAcc!);
  const clock = clockFacts(clockAcc!);
  return {
    cluster: env.cluster,
    programId: env.programId,
    explorerRpc: env.explorerRpc,
    addresses,
    config: config.data,
    state: state.data,
    coverage: coverageFromAccounts(config.data, state.data),
    now: clock.now,
    slot: clock.slot,
    token,
    incomeInbox: { address: inbox.address, exists: inbox.exists, amount: inbox.amount },
    payments,
  };
}

/**
 * The payments token account's SPL facts (account layout: mint [0..32),
 * owner [32..64), delegate option [72..76) + key [76..108), state [108],
 * close-authority option [129..133) + key [133..165)).
 */
function paymentsFacts(env: ServerEnv, a: MaybeEncodedAccount): PaymentsFacts {
  const expectedOwner = env.paymentsOwner;
  if (!a.exists || (a.data as Uint8Array).length < 165) return { exists: false, owner: null, mint: null, delegate: null, closeAuthority: null, frozen: false, expectedOwner };
  const d = a.data as Uint8Array;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const ad = getAddressDecoder();
  return {
    exists: true,
    mint: ad.decode(d.subarray(0, 32)),
    owner: ad.decode(d.subarray(32, 64)),
    delegate: dv.getUint32(72, true) === 1 ? ad.decode(d.subarray(76, 108)) : null,
    frozen: d[108] === 2,
    closeAuthority: dv.getUint32(129, true) === 1 ? ad.decode(d.subarray(133, 165)) : null,
    expectedOwner,
  };
}

/**
 * SPL Token facts the disclosures need, decoded from the raw accounts:
 * Mint: [0..4) mint-authority option, [4..36) authority, [36..44) supply,
 * [44] decimals, [45] initialized, [46..50) freeze-authority option, [50..82) freeze authority.
 * Token account: [108] state (1 = initialized, 2 = frozen).
 */
function tokenFacts(mint: Address, m: MaybeEncodedAccount, r: MaybeEncodedAccount): TokenFacts {
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

/** Accounts per getMultipleAccounts call (the RPC limit is 100). */
const ACCOUNT_BATCH = 100;

/** The deposit seqs still in the queue, head first: [depositHead, nextDepositSeq), at most min(max, MAX_SEQS). */
export function depositQueueSeqs(state: Pick<ReserveView["state"], "depositHead" | "nextDepositSeq">, max = Number(MAX_SEQS)): bigint[] {
  const { depositHead: head, nextDepositSeq: next } = state;
  const cap = BigInt(Math.max(0, Math.min(Math.floor(max), Number(MAX_SEQS))));
  const end = next - head > cap ? head + cap : next;
  const out: bigint[] = [];
  for (let s = head; s < end; s++) out.push(s);
  return out;
}

/**
 * The pending deposit requests a fill may include, and nothing else: only the
 * DepositRequest PDAs from the head to the next seq (no program-account scans,
 * no capital events), at most `count` (the fill's), for `fulfil_deposits`.
 */
export async function readDepositQueue(env: ServerEnv, reserve: ReserveView, count = Number(MAX_SEQS)): Promise<Ledger["deposits"]> {
  const config = reserve.addresses.config as Address;
  const o = { programAddress: env.programId };
  const addrs = await Promise.all(depositQueueSeqs(reserve.state, count).map(async (seq) => (await findDepositRequestPda({ config, seq }, o))[0]));
  const out: Ledger["deposits"] = [];
  for (let k = 0; k < addrs.length; k += ACCOUNT_BATCH) {
    const accs = await fetchAllMaybeDepositRequest(rpcFor(env), addrs.slice(k, k + ACCOUNT_BATCH), READ);
    for (const a of accs) if (a.exists) out.push({ address: a.address, data: a.data });
  }
  return out;
}

/**
 * The ledger's account reads: guarantees and claim filings (two program-account
 * scans) and the queue's request PDAs (getMultipleAccounts). What the coverage,
 * claims and queue views need; no transactions, no block times.
 */
export async function readLedgerAccounts(env = serverEnv(), reserve?: ReserveView): Promise<LedgerAccounts> {
  const r = reserve ?? (await readReserve(env));
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = r.addresses.config as Address;

  const [guaranteesAll, filingsAll] = await Promise.all([
    scan(env, GUARANTEE_DISCRIMINATOR, (b) => getGuaranteeDecoder().decode(b)),
    scan(env, CLAIM_FILING_DISCRIMINATOR, (b) => getClaimFilingDecoder().decode(b)),
  ]);
  // Keep only accounts of this reserve: filings by guarantee, guarantees by
  // re-deriving their PDA under this config.
  const guaranteeOk = await Promise.all(guaranteesAll.map(async (g) => (await findGuaranteePda({ config, id: g.data.id }, o))[0] === g.address));
  const guarantees = guaranteesAll.filter((_, i) => guaranteeOk[i]);
  const mine = new Set(guarantees.map((g) => g.address as string));
  const filings = filingsAll.filter((f) => mine.has(f.data.guarantee));

  const depSeqs = seqRange(r.state.nextDepositSeq);
  const redSeqs = seqRange(r.state.nextRedeemSeq);
  const [depAddrs, redAddrs] = await Promise.all([
    Promise.all(depSeqs.map(async (seq) => (await findDepositRequestPda({ config, seq }, o))[0])),
    Promise.all(redSeqs.map(async (seq) => (await findRedeemRequestPda({ config, seq }, o))[0])),
  ]);
  // getMultipleAccounts takes at most ACCOUNT_BATCH addresses per call.
  const chunks = <A>(xs: A[]) => Array.from({ length: Math.ceil(xs.length / ACCOUNT_BATCH) }, (_, k) => xs.slice(k * ACCOUNT_BATCH, (k + 1) * ACCOUNT_BATCH));
  const [depAccs, redAccs] = await Promise.all([
    Promise.all(chunks(depAddrs).map((c) => fetchAllMaybeDepositRequest(rpc, c, READ))).then((x) => x.flat()),
    Promise.all(chunks(redAddrs).map((c) => fetchAllMaybeRedeemRequest(rpc, c, READ))).then((x) => x.flat()),
  ]);

  return {
    guarantees: guarantees.map((g) => ({ address: g.address, data: g.data })),
    filings,
    deposits: depAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
    redeems: redAccs.flatMap((a) => (a.exists ? [{ address: a.address, data: a.data }] : [])),
  };
}

/**
 * The ledger's history: fee and income receipts with their block times (one
 * scan plus a getBlockTime per new slot) and the capital queue's fills (two
 * signature lists plus a getTransaction per new signature). The heavy read:
 * only the history charts, activity feeds and receipt lists wait on it.
 */
export async function readLedgerHistory(env = serverEnv(), reserve?: ReserveView): Promise<LedgerHistory> {
  const r = reserve ?? (await readReserve(env));
  const rpc = rpcFor(env);
  const o = { programAddress: env.programId };
  const config = r.addresses.config as Address;

  const receiptsAll = await scan(env, INCOME_RECEIPT_DISCRIMINATOR, (b) => getIncomeReceiptDecoder().decode(b));
  // Guarantee fees and issuer income share one receipt type, told apart by
  // `kind` (ADR 0019): 1 = FEE under the "fee" seed, 0 = ISSUER_STATEMENT.
  const feesAll = receiptsAll.filter((r) => r.data.kind === 1);
  const incomeAll = receiptsAll.filter((r) => r.data.kind === 0);
  // Keep only receipts of this reserve, by re-deriving their PDA under this config.
  const feeOk = await Promise.all(
    feesAll.map(async (f) => (await findFeeReceiptPda({ config, invoiceRefHash: f.data.refHash }, o))[0] === f.address),
  );
  const incomeOk = await Promise.all(
    incomeAll.map(async (i) => (await findIncomeReceiptPda({ config, incomeRefHash: i.data.refHash }, o))[0] === i.address),
  );
  const blockTimeOf = async (slot: bigint): Promise<bigint | null> => {
    const hit = blockTimes.get(slot);
    if (hit !== undefined) return hit;
    try {
      const t = await rpc.getBlockTime(slot).send();
      if (t === null) return null;
      // A confirmed slot's block time never changes: ask once per instance.
      if (blockTimes.size >= MAX_BLOCK_TIMES) blockTimes.clear();
      blockTimes.set(slot, BigInt(t as unknown as number));
      return BigInt(t as unknown as number);
    } catch {
      return null;
    }
  };
  const fees = await mapLimit(feesAll.filter((_, i) => feeOk[i]), async (f) => ({ ...f, blockTime: await blockTimeOf(f.data.slot) }));
  const income = await mapLimit(incomeAll.filter((_, i) => incomeOk[i]), async (r) => ({ ...r, blockTime: await blockTimeOf(r.data.slot) }));

  const fills = await readCapitalEvents(env, r);
  return fills.missing > 0 ? { capitalEvents: fills.events, fees, income, fillsMissing: fills.missing } : { capitalEvents: fills.events, fees, income };
}

/** The whole ledger: its account reads and its history (the operator, admin and demo consoles). */
export async function readLedger(env = serverEnv(), reserve?: ReserveView): Promise<Ledger> {
  const r = reserve ?? (await readReserve(env));
  const [accounts, history] = await Promise.all([readLedgerAccounts(env, r), readLedgerHistory(env, r)]);
  return { ...accounts, ...history };
}

/**
 * The two halves of the ledger through the read cache ('accounts' and
 * 'history', each a heavy read with its own TTL), so /api/ledger and the
 * split routes share one read of each. `allowStale` false when composed into
 * /api/ledger, which then answers with its own last good value.
 */
export function readAccountsCached(env: ServerEnv, opts: { fresh?: boolean; allowStale?: boolean } = {}) {
  return cachedRead("accounts", async () => readLedgerAccounts(env, await readReserveShared(env, { fresh: opts.fresh })), { ...opts, ttlMs: HEAVY_TTL_MS });
}
export function readHistoryCached(env: ServerEnv, opts: { fresh?: boolean; allowStale?: boolean } = {}) {
  return cachedRead("history", async () => readLedgerHistory(env, await readReserveShared(env, { fresh: opts.fresh })), { ...opts, ttlMs: HEAVY_TTL_MS });
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

/** Time a history read spends decoding uncached transactions before it answers with what it has. */
export const FILLS_BUDGET_MS = 5_000;

/**
 * Fills from the last 100 transactions on each escrow. The public devnet
 * allows 10 getTransaction calls per 10 s, so a cold instance cannot decode
 * 200 transactions in one request: past FILLS_BUDGET_MS, or when the RPC is
 * busy, the rest are left for the next read (decoded transactions are
 * cached) and counted in `missing`. Any other failure is not masked.
 */
export async function readCapitalEvents(env: ServerEnv, r: ReserveView, opts: { budgetMs?: number; now?: () => number } = {}): Promise<{ events: CapitalEvent[]; missing: number }> {
  const rpc = rpcFor(env);
  const now = opts.now ?? Date.now;
  const sigs = new Set<string>();
  for (const a of [r.addresses.pendingDeposits, r.addresses.pendingRedemptions]) {
    const rows = await rpc.getSignaturesForAddress(a as Address, { ...READ, limit: 100 }).send();
    for (const row of rows) if (!row.err) sigs.add(row.signature);
  }
  const deadline = now() + (opts.budgetMs ?? FILLS_BUDGET_MS);
  let missing = 0;
  // A cold instance decodes up to 200 transactions: a few at a time, not one burst.
  const all = (
    await mapLimit([...sigs], async (s) => {
      if (!eventCache.has(s) && now() > deadline) {
        missing++;
        return [];
      }
      try {
        return await eventsOf(env, s, r.addresses.config);
      } catch (e) {
        if (!isUpstreamError(e)) throw e;
        missing++;
        return [];
      }
    })
  ).flat();
  return { events: all.sort((a, b) => Number(b.ts - a.ts)), missing };
}
