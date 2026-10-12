import { isAddress } from "@solana/kit";

/**
 * The `?owner=` of an investor read, normalised: null when absent or blank,
 * the trimmed base58 address when valid, undefined when it is not an address
 * (the route answers 400 without touching the RPC or the cache).
 */
export function parseOwner(raw: string | null): string | null | undefined {
  const s = raw?.trim() ?? "";
  if (!s) return null;
  return isAddress(s) ? s : undefined;
}
