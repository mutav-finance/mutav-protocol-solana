"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getJson } from "./api";

export type Poll<T> = {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  /** Wall-clock time of the last successful read. */
  updatedAt: number | null;
  refresh: () => Promise<void>;
};

/**
 * Poll a read route. Pauses while the tab is hidden; `refresh()` reads now
 * (used right after a transaction confirms).
 */
export function usePoll<T>(url: string, intervalMs = 10_000): Poll<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const read = useCallback(async () => {
    try {
      const d = await getJson<T>(url);
      if (!alive.current) return;
      setData(d);
      setError(null);
      setUpdatedAt(Date.now());
    } catch (e) {
      if (alive.current) setError(e as Error);
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    alive.current = true;
    const tick = async () => {
      if (typeof document === "undefined" || document.visibilityState === "visible") await read();
      if (alive.current) timer.current = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [read, intervalMs]);

  return { data, error, loading, updatedAt, refresh: read };
}
