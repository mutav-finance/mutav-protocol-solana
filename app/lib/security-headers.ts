/**
 * Response headers (A6). Two layers:
 * - enforced now on every response: no framing (clickjacking of /admin
 *   Approve and Execute), no MIME sniffing, no referrer, no powerful
 *   browser features;
 * - a full Content-Security-Policy in REPORT-ONLY mode on pages (proxy.ts):
 *   a per-request nonce for the app's scripts plus the hashes of the static
 *   simulator's inline scripts. Enforce it after the demo, once the browser
 *   console shows no violations.
 * Pure helpers: shared by next.config.ts, proxy.ts and the tests.
 */
import { createHash } from "node:crypto";

export const SAFE_HEADERS: { key: string; value: string }[] = [
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** `'sha256-…'` sources for every inline <script> body in an HTML page (no src attribute). */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    out.push(`'sha256-${createHash("sha256").update(m[1] ?? "", "utf8").digest("base64")}'`);
  }
  return out;
}
