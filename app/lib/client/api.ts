"use client";
import { decode, encode } from "../serde";

export class ApiError extends Error {
  override name = "ApiError";
  constructor(message: string, readonly status: number, readonly logs: string[] | null = null, readonly notConfigured = false) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? decode<T & { error?: string; logs?: string[]; notConfigured?: boolean }>(text) : ({} as never);
  if (!res.ok) throw new ApiError(body.error ?? `HTTP ${res.status}`, res.status, body.logs ?? null, !!body.notConfigured);
  return body;
}

export const getJson = async <T>(url: string): Promise<T> => parse<T>(await fetch(url, { cache: "no-store" }));

export const postJson = async <T>(url: string, body: unknown): Promise<T> =>
  parse<T>(await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: encode(body) }));
