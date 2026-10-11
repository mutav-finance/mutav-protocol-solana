/**
 * In-process cache for the read routes (A2). The CDN caches each URL for 3 s,
 * but any query string (usePoll's `?fresh=`, or `?x=N` from a loop) misses it;
 * this cache keeps such requests from reaching the RPC more than once per
 * TTL per server instance. A `fresh` read (right after a transaction) accepts
 * a 1 s old result instead of 3 s. Failures are never cached.
 *
 * Two stores: the fixed route keys ('reserve', 'ledger', 'operator',
 * 'squads'), and a bounded LRU of per-owner investor reads. Many distinct
 * owners evict only other owners' entries, never the fixed keys.
 */
export const READ_TTL_MS = 3_000;
export const FRESH_TTL_MS = 1_000;
/** Bound on the fixed store (a handful of route keys). */
const MAX_FIXED_KEYS = 32;
/** Bound on per-owner investor entries: the least recently used is evicted past it. */
export const MAX_INVESTOR_KEYS = 256;

type Entry = { at: number; value: Promise<unknown> };
type Opts = { fresh?: boolean; now?: () => number };

function lruRead<T>(entries: Map<string, Entry>, max: number, key: string, read: () => Promise<T>, opts: Opts): Promise<T> {
  const now = (opts.now ?? Date.now)();
  const ttl = opts.fresh ? FRESH_TTL_MS : READ_TTL_MS;
  const hit = entries.get(key);
  if (hit) {
    // Re-insert: Map order is the recency order.
    entries.delete(key);
    entries.set(key, hit);
    if (now - hit.at < ttl) return hit.value as Promise<T>;
  }
  entries.delete(key);
  while (entries.size >= max) entries.delete(entries.keys().next().value!);
  const value = read();
  entries.set(key, { at: now, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

const fixed = new Map<string, Entry>();
const investors = new Map<string, Entry>();

/** One of the fixed route keys ('reserve', 'ledger', 'operator', 'squads'). */
export function cachedRead<T>(key: string, read: () => Promise<T>, opts: Opts = {}): Promise<T> {
  return lruRead(fixed, MAX_FIXED_KEYS, key, read, opts);
}

/**
 * One investor's read, keyed by its owner (already validated as an address by
 * the caller; null = no wallet). Kept apart from the fixed keys.
 */
export function cachedInvestorRead<T>(owner: string | null, read: () => Promise<T>, opts: Opts = {}): Promise<T> {
  return lruRead(investors, MAX_INVESTOR_KEYS, owner ?? "", read, opts);
}

/** Whether the request asked for a fresh read (`?fresh=`). */
export const isFresh = (req: Request) => new URL(req.url).searchParams.has("fresh");

export const clearReadCache = () => {
  fixed.clear();
  investors.clear();
};
