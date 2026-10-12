"use client";
import { decode, encode } from "../serde";

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    message: string,
    readonly status: number,
    readonly logs: string[] | null = null,
    readonly notConfigured = false,
    /** The RPC is rate limiting (503 busy): retry after `retryAfter` seconds. */
    readonly busy = false,
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? decode<T & { error?: string; logs?: string[]; notConfigured?: boolean; busy?: boolean }>(text) : ({} as never);
  if (!res.ok) {
    const after = Number(res.headers.get("retry-after"));
    throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.logs ?? null, !!body.notConfigured, !!body.busy || res.status === 429, Number.isFinite(after) && after > 0 ? after : null);
  }
  return body;
}

export const getJson = async <T>(url: string): Promise<T> => parse<T>(await fetch(url, { cache: "no-store" }));

/** A read route's answer, and whether it is the last good value served while the RPC is busy. */
export async function getRead<T>(url: string): Promise<{ data: T; stale: boolean; readAt: number | null }> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await parse<T>(res);
  const at = Number(res.headers.get("x-chain-read-at"));
  return { data, stale: res.headers.get("x-chain-stale") === "true", readAt: Number.isFinite(at) && at > 0 ? at : null };
}

export const postJson = async <T>(url: string, body: unknown): Promise<T> =>
  parse<T>(await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: encode(body) }));
