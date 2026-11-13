/**
 * Per-request CSP nonce, ENFORCED (A6; A-R3-1, audit #2). The full CSP
 * (lib/csp.ts) goes out as Content-Security-Policy on every page response.
 *
 * Next reads the nonce from the REQUEST's `content-security-policy` header
 * (falling back to `-report-only` only when that is absent) and puts it on
 * every script it renders; the root layout renders per request so it can.
 * So the full CSP is set on the request too, overwriting any
 * `content-security-policy` already there: a nonce-less one (a client's, or
 * the static `frame-ancestors` one from next.config.ts) would make Next drop
 * the nonce from every script. That is why next.config.ts sends its static
 * CSP only on the paths this proxy does not run on (UNPROXIED_SOURCES); keep
 * the two lists in step (headers.test.ts checks it).
 *
 * Wallet extensions (Phantom, Solflare) inject their own content scripts;
 * CSP does not apply to those, by design.
 */
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy } from "./lib/csp";

export const CSP_HEADER = "Content-Security-Policy";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy({
    nonce,
    scriptHashes: (process.env.MUTAV_CSP_SCRIPT_HASHES ?? "").split(" ").filter(Boolean),
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(CSP_HEADER, csp);
  requestHeaders.delete("Content-Security-Policy-Report-Only");
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
