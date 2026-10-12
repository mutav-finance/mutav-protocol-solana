"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getRead } from "./api";

export type Poll<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  /** Wall-clock time of the chain read behind `data` (the server's read time when stale). */
  updatedAt: number | null;
  /** `data` is the last good value, served while the RPC is busy. */
  stale: boolean;
  /** The RPC is rate limiting (stale data or a 503): the poll is backing off and retrying. */
  busy: boolean;
  refresh: () => Promise<void>;
};

/** Longest wait between polls while the RPC is busy. */
export const MAX_BACKOFF_MS = 60_000;

/**
 * The wait before the next poll: the interval when healthy; after `failures`
 * consecutive busy/failed reads, exponential backoff from the larger of the
 * interval and the server's Retry-After, with jitter, capped at MAX_BACKOFF_MS.
 */
export function nextDelay(intervalMs: number, failures: number, retryAfterS: number | null = null, random = Math.random): number {
  if (failures <= 0) return intervalMs;
  const base = Math.max(intervalMs, (retryAfterS ?? 0) * 1000);
  const exp = Math.min(MAX_BACKOFF_MS, base * 2 ** (failures - 1));
  return Math.round(exp * (0.8 + 0.4 * random()));
}

/**
 * Whether this tick reads: the first read always does (a link opened in a
 * background tab, a screenshot or automation tool must not sit on
 * skeletons); later polls pause while the tab is hidden.
 */
export function shouldRead(first: boolean, visibility: DocumentVisibilityState | undefined = typeof document === "undefined" ? undefined : document.visibilityState): boolean {
  return first || visibility === undefined || visibility === "visible";
}

/**
 * Poll a read route. Reads once at mount, then pauses while the tab is hidden; `refresh()` reads now
 * (used right after a transaction confirms) and skips the CDN's 3 s read
 * cache with a fresh query parameter, so "how the numbers moved" is current.
 * Never two reads of one poll at once; while the server says the chain is
 * busy, the poll keeps its last data and backs off.
 * `until(data)` true stops the polling after that read (an answer that cannot
 * change, e.g. /api/fx with no rate source); `refresh()` still reads.
 */
export function usePoll<T>(url: string, intervalMs = 10_000, until?: (data: T) => boolean): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  // Loading until the first read of the current URL settles (a new URL, e.g. a
  // newly connected wallet, is loading again until its own read lands or fails).
  const [settledUrl, setSettledUrl] = useState<string | null>(null);
  const loading = settledUrl !== url;
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [stale, setStale] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const inflight = useRef<Promise<T | null> | null>(null);
  const failures = useRef(0);
  const retryAfter = useRef<number | null>(null);
  const stop = useRef(until);
  useEffect(() => {
    stop.current = until;
  });

  const read = useCallback(
    (fresh = false): Promise<T | null> => {
      const run = async (): Promise<T | null> => {
        try {
          const r = await getRead<T>(fresh ? `${url}${url.includes("?") ? "&" : "?"}fresh=${Date.now()}` : url);
          if (!alive.current) return null;
          setData(r.data);
          setError(null);
          setStale(r.stale);
          setUpdatedAt(r.stale ? (r.readAt ?? Date.now()) : Date.now());
          failures.current = r.stale ? failures.current + 1 : 0;
          retryAfter.current = null;
          return r.data;
        } catch (e) {
          if (!alive.current) return null;
          setError(e as Error);
          failures.current += 1;
          retryAfter.current = e instanceof ApiError ? e.retryAfter : null;
          return null;
        } finally {
          if (alive.current) setSettledUrl(url);
        }
      };
      // One read at a time: a refresh during a poll runs right after it.
      const prev = inflight.current;
      if (prev && !fresh) return prev;
      const p: Promise<T | null> = (prev ? prev.then(run) : run()).finally(() => {
        if (inflight.current === p) inflight.current = null;
      });
      inflight.current = p;
      return p;
    },
    [url],
  );

  useEffect(() => {
    alive.current = true;
    failures.current = 0;
    let first = true;
    const tick = async () => {
      if (shouldRead(first)) {
        first = false;
        const d = await read();
        if (d !== null && stop.current?.(d)) return;
      }
      if (alive.current) timer.current = setTimeout(tick, nextDelay(intervalMs, failures.current, retryAfter.current));
    };
    void tick();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [read, intervalMs]);

  const refresh = useCallback(async () => {
    await read(true);
  }, [read]);
  const busy = stale || (error instanceof ApiError && error.busy);
  return { data, error, loading, updatedAt, stale, busy, refresh };
}
