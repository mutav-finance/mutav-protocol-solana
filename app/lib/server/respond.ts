import { jsonResponse } from "../serde";
import { MainnetRefusedError, redactUrls } from "../cluster";
import { NotConfiguredError } from "./chain";
import { RelayRefusedError } from "./relay";
import { ComposeError } from "./compose";
import { StaleCarryError } from "./squads";

/**
 * A2: public read routes are cached at the CDN for 3 s and served stale for
 * 10 s more while one request refreshes, so a polling loop cannot exhaust
 * the public devnet RPC. Errors and transaction routes stay no-store.
 */
export const READ_CACHE = "public, s-maxage=3, stale-while-revalidate=10";

export const readResponse = (value: unknown) => jsonResponse(value, { headers: { "cache-control": READ_CACHE } });

/**
 * Map an error to a JSON response; never leaks a stack, and every URL in the
 * message or logs is cut to its host (A5: an RPC URL may carry an API key).
 */
export function errorResponse(e: unknown): Response {
  const message = redactUrls(e instanceof Error ? e.message : String(e));
  const rawLogs = (e as { context?: { logs?: string[] } })?.context?.logs ?? (e as { logs?: string[] })?.logs;
  const logs = Array.isArray(rawLogs) ? rawLogs.map((l) => redactUrls(String(l))) : rawLogs;
  if (e instanceof NotConfiguredError) return jsonResponse({ error: message, notConfigured: true }, { status: 503 });
  if (e instanceof MainnetRefusedError || e instanceof RelayRefusedError) return jsonResponse({ error: message }, { status: 403 });
  if (e instanceof ComposeError) return jsonResponse({ error: message }, { status: 400 });
  if (e instanceof StaleCarryError) return jsonResponse({ error: message }, { status: 409 });
  return jsonResponse({ error: message, logs: logs ?? null }, { status: 502 });
}
