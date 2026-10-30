/**
 * Response headers (A6). Two layers, both enforced:
 * - on every response (next.config.ts): no framing (clickjacking of /admin
 *   Approve and Execute), no MIME sniffing, no referrer, no powerful
 *   browser features;
 * - a Content-Security-Policy on every response, exactly one per path:
 *   - pages and public files (proxy.ts): the full CSP (lib/csp.ts), a
 *     per-request nonce for the app's scripts plus the hashes of the static
 *     simulator's inline scripts (A-R3-1, audit #2);
 *   - the paths the proxy skips (UNPROXIED_SOURCES): `frame-ancestors 'none'`.
 *   Never send the static one on a proxied path: Next takes the nonce from
 *   the request's `content-security-policy`, and a nonce-less one there
 *   strips the nonce from every script.
 * Pure helpers: shared by next.config.ts, proxy.ts and the tests.
 */
import { createHash } from "node:crypto";

export const SAFE_HEADERS: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

/** The CSP on the paths proxy.ts's matcher excludes (API routes, build assets, brand files). */
export const STATIC_CSP = { key: "Content-Security-Policy", value: "frame-ancestors 'none'" };

/** next.config.ts `headers()` sources for the paths proxy.ts's matcher excludes. Keep in step with it. */
export const UNPROXIED_SOURCES = ["/api/:path*", "/_next/static/:path*", "/_next/image/:path*", "/favicon.ico", "/brand/:path*"];

/** `'sha256-…'` sources for every inline <script> body in an HTML page (no src attribute). */
export function inlineScriptHashes(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    out.push(`'sha256-${createHash("sha256").update(m[1] ?? "", "utf8").digest("base64")}'`);
  }
  return out;
}
