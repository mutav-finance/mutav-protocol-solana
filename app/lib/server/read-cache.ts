/**
 * In-process cache for the read routes (A2). The CDN caches each URL for 3 s,
 * but any query string (usePoll's `?fresh=`, or `?x=N` from a loop) misses it;
 * this cache keeps such requests from reaching the RPC more than once per
 * TTL per server instance:
 *
 * - Identical concurrent reads share one in-flight read (coalescing).
 * - A result is reused for READ_TTL_MS after it lands; a `fresh` read (right
 *   after a transaction) only accepts a read that STARTED under 1 s ago, so
 *   it never gets numbers from before the transaction.
 * - When the RPC is busy (429 after retries, 5xx, network), the last good
 *   value is served, marked stale, for up to STALE_MAX_MS; for COOLDOWN_MS
 *   after such a failure the stale value is served without asking again.
 *   Any other failure (a refusal, a decode error) is never masked.
 *
 * This is a short-lived read cache, not a mirror: nothing is persisted, and
 * a stale answer always says so (`stale`, `at`). Transaction routes never
 * read through it.
 *
 * Two stores: the fixed route keys ('reserve', 'ledger', 'operator',
 * 'squads'), and a bounded LRU of per-owner investor reads. Many distinct
 * owners evict only other owners' entries, never the fixed keys.
 */
import { isUpstreamError } from "./rpc-retry";

export const READ_TTL_MS = 5_000;
/** TTL of the heavy reads: the public devnet allows 10 program-account scans / signature lists per 10 s. */
export const HEAVY_TTL_MS = 10_000;
export const FRESH_TTL_MS = 1_000;
/** Oldest last-good value served when the RPC is busy. */
export const STALE_MAX_MS = 10 * 60_000;
/** After an upstream failure, serve the stale value this long before asking the RPC again. */
export const COOLDOWN_MS = 3_000;
/** An in-flight read older than this is not joined (a hung request must not pin the key). */
const INFLIGHT_MAX_MS = 30_000;
/** Bound on the fixed store (a handful of route keys). */
const MAX_FIXED_KEYS = 32;
/** Bound on per-owner investor entries: the least recently used is evicted past it. */
export const MAX_INVESTOR_KEYS = 256;

/** A read result: `stale` when the RPC was busy and this is the last good value, read at `at` (ms). */
export type Cached<T> = { value: T; stale: boolean; at: number };

type Good = { startedAt: number; at: number; value: unknown };
type Entry = { good?: Good; inflight?: { startedAt: number; p: Promise<unknown> }; failedAt?: number };
type Opts = {
  fresh?: boolean;
  now?: () => number;
  /** false: never answer with a stale value (a read composed into another read). Default true. */
  allowStale?: boolean;
  /** Overrides READ_TTL_MS for a heavy read (the ledger's program-account scans, the operator's history). */
  ttlMs?: number;
};

function entryOf(entries: Map<string, Entry>, max: number, key: string): Entry {
  const hit = entries.get(key);
  // Re-insert: Map order is the recency order.
  if (hit) entries.delete(key);
  while (entries.size >= max) entries.delete(entries.keys().next().value!);
  const e = hit ?? {};
  entries.set(key, e);
  return e;
}

async function lruRead<T>(entries: Map<string, Entry>, max: number, key: string, read: () => Promise<T>, opts: Opts): Promise<Cached<T>> {
  const clock = opts.now ?? Date.now;
  const now = clock();
  const e = entryOf(entries, max, key);
  const good = e.good;
  const usable = (g: Good | undefined, t: number): g is Good => !!g && (opts.fresh ? t - g.startedAt < FRESH_TTL_MS : t - g.at < (opts.ttlMs ?? READ_TTL_MS));
  if (usable(good, now)) return { value: good.value as T, stale: false, at: good.at };

  const staleOf = (t: number): Cached<T> | null =>
    opts.allowStale !== false && e.good && t - e.good.at < STALE_MAX_MS ? { value: e.good.value as T, stale: true, at: e.good.at } : null;
  if (!opts.fresh && e.failedAt !== undefined && now - e.failedAt < COOLDOWN_MS) {
    const s = staleOf(now);
    if (s) return s;
  }

  const join = e.inflight && now - e.inflight.startedAt < (opts.fresh ? FRESH_TTL_MS : INFLIGHT_MAX_MS);
  let p: Promise<unknown>;
  if (join) {
    p = e.inflight!.p;
  } else {
    const startedAt = now;
    p = read().then(
      (value) => {
        // A slower, older read never overwrites a newer result.
        if (!e.good || e.good.startedAt <= startedAt) e.good = { startedAt, at: clock(), value };
        e.failedAt = undefined;
        return value;
      },
      (err) => {
        if (isUpstreamError(err)) e.failedAt = clock();
        throw err;
      },
    );
    const mine = p;
    e.inflight = { startedAt, p: mine };
    mine.then(
      () => e.inflight?.p === mine && (e.inflight = undefined),
      () => e.inflight?.p === mine && (e.inflight = undefined),
    );
  }
  try {
    const value = (await p) as T;
    return { value, stale: false, at: e.good?.value === value ? e.good.at : clock() };
  } catch (err) {
    const s = isUpstreamError(err) ? staleOf(clock()) : null;
    if (s) return s;
    throw err;
  }
}

const fixed = new Map<string, Entry>();
const investors = new Map<string, Entry>();

/** One of the fixed route keys ('reserve', 'ledger', 'operator', 'squads'). */
export function cachedRead<T>(key: string, read: () => Promise<T>, opts: Opts = {}): Promise<Cached<T>> {
  return lruRead(fixed, MAX_FIXED_KEYS, key, read, opts);
}

/**
 * One investor's read, keyed by its owner (already validated as an address by
 * the caller; null = no wallet). Kept apart from the fixed keys.
 */
export function cachedInvestorRead<T>(owner: string | null, read: () => Promise<T>, opts: Opts = {}): Promise<Cached<T>> {
  return lruRead(investors, MAX_INVESTOR_KEYS, owner ?? "", read, opts);
}

/** Whether the request asked for a fresh read (`?fresh=`). */
export const isFresh = (req: Request) => new URL(req.url).searchParams.has("fresh");

export const clearReadCache = () => {
  fixed.clear();
  investors.clear();
};
