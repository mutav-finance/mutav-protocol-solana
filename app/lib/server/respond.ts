import { jsonResponse } from "../serde";
import { MainnetRefusedError } from "../cluster";
import { NotConfiguredError } from "./chain";
import { RelayRefusedError } from "./relay";
import { ComposeError } from "./compose";

/** Map an error to a JSON response; never leaks a stack. */
export function errorResponse(e: unknown): Response {
  const message = e instanceof Error ? e.message : String(e);
  const logs = (e as { context?: { logs?: string[] } })?.context?.logs ?? (e as { logs?: string[] })?.logs;
  if (e instanceof NotConfiguredError) return jsonResponse({ error: message, notConfigured: true }, { status: 503 });
  if (e instanceof MainnetRefusedError || e instanceof RelayRefusedError) return jsonResponse({ error: message }, { status: 403 });
  if (e instanceof ComposeError) return jsonResponse({ error: message }, { status: 400 });
  return jsonResponse({ error: message, logs: logs ?? null }, { status: 502 });
}
