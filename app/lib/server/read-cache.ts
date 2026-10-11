/**
 * In-process cache for the read routes (A2). The CDN caches each URL for 3 s,
 * but any query string (usePoll's `?fresh=`, or `?x=N` from a loop) misses it;
 * this cache keeps such requests from reaching the RPC more than once per
 * TTL per server instance. A `fresh` read (right after a transaction) accepts
 * a 1 s old result instead of 3 s. Failures are never cached.
 */
export const READ_TTL_MS = 3_000;
export const FRESH_TTL_MS = 1_000;
/** Bound on keys (one per investor owner): the map is cleared past it. */
const MAX_KEYS = 512;

const entries = new Map<string, { at: number; value: Promise<unknown> }>();

export function cachedRead<T>(key: string, read: () => Promise<T>, opts: { fresh?: boolean; now?: () => number } = {}): Promise<T> {
  const now = (opts.now ?? Date.now)();
  const ttl = opts.fresh ? FRESH_TTL_MS : READ_TTL_MS;
  const hit = entries.get(key);
  if (hit && now - hit.at < ttl) return hit.value as Promise<T>;
  if (entries.size >= MAX_KEYS) entries.clear();
  const value = read();
  entries.set(key, { at: now, value });
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  return value;
}

/** Whether the request asked for a fresh read (`?fresh=`). */
export const isFresh = (req: Request) => new URL(req.url).searchParams.has("fresh");

export const clearReadCache = () => entries.clear();
