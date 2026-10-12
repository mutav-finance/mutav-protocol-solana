/**
 * Per-request CSP nonce, REPORT-ONLY for now (A6, decision 2026-10-10): the
 * browser reports violations in the console and blocks nothing. Next applies
 * the nonce to its own scripts on dynamically rendered pages (the root layout
 * opts in). Enforce after the demo by renaming the header to
 * Content-Security-Policy. The always-on safe headers live in next.config.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cspReportOnly } from "./lib/csp";

const HEADER = "Content-Security-Policy-Report-Only";

export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = cspReportOnly({
    nonce,
    scriptHashes: (process.env.MUTAV_CSP_SCRIPT_HASHES ?? "").split(" ").filter(Boolean),
    dev: process.env.NODE_ENV === "development",
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(HEADER, csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(HEADER, csp);
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
