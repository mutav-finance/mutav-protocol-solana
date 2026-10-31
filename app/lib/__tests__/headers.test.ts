import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { config as proxyConfig, CSP_HEADER, proxy } from "../../proxy";
import { contentSecurityPolicy } from "../csp";
import { inlineScriptHashes, PREFETCH_REQUESTS, SAFE_HEADERS, STATIC_CSP, UNPROXIED_SOURCES } from "../security-headers";
import { READ_CACHE } from "../server/respond";
import { vi } from "vitest";

vi.mock("../server/chain", () => ({ NotConfiguredError: class extends Error {} }));

describe("A6 headers", () => {
  it("forbids framing, sniffing and referrers on every response", () => {
    const h = Object.fromEntries(SAFE_HEADERS.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    // The CSP is not in the every-path set: one per path, see below.
    expect(h["Content-Security-Policy"]).toBeUndefined();
    expect(STATIC_CSP.value).toBe("frame-ancestors 'none'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\)/);
  });
  it("builds a nonce CSP with the simulator's script hashes, no unsafe-inline scripts", () => {
    const csp = contentSecurityPolicy({ nonce: "abc", scriptHashes: ["'sha256-x'"] });
    expect(csp).toMatch(/script-src 'self' 'nonce-abc' 'strict-dynamic' 'sha256-x'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(contentSecurityPolicy({ nonce: "n", dev: true })).toMatch(/unsafe-eval/);
  });
  it("sends the full CSP ENFORCED, with the same nonce on the request Next reads (A-R3-1)", () => {
    // A nonce-less client CSP must not win: Next prefers the request's content-security-policy.
    const req = new NextRequest("http://localhost/reserve", {
      headers: { "content-security-policy": "frame-ancestors 'none'", "content-security-policy-report-only": "default-src 'self'" },
    });
    const res = proxy(req);
    expect(CSP_HEADER).toBe("Content-Security-Policy");
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(res.headers.get("content-security-policy-report-only")).toBeNull();
    const nonce = csp.match(/'nonce-([A-Za-z0-9+/=]+)'/)?.[1];
    expect(nonce).toBeTruthy();
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/connect-src 'self';/);
    // Request-header overrides travel as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
    expect(res.headers.get("x-middleware-request-content-security-policy-report-only")).toBeNull();
    // A fresh nonce per request.
    expect(proxy(new NextRequest("http://localhost/reserve")).headers.get("content-security-policy")).not.toBe(csp);
  });
  it("sends the static CSP on exactly the paths the proxy skips", () => {
    const source = proxyConfig.matcher[0]!.source;
    const skipped = source.match(/\(\?!([^)]*)\)/)?.[1]?.split("|") ?? [];
    expect(skipped.length).toBeGreaterThan(0);
    const prefixes = UNPROXIED_SOURCES.map((s) => s.replace(/^\//, "").replace(/\/:path\*$/, ""));
    expect(prefixes.sort()).toEqual([...skipped].sort());
    // The prefetch requests it skips get the static CSP too.
    expect(PREFETCH_REQUESTS).toEqual(proxyConfig.matcher[0]!.missing);
  });
  it("hashes inline scripts only", () => {
    const hashes = inlineScriptHashes(`<script>alert(1)</script><script src="/x.js"></script><script id="calc">var a</script>`);
    expect(hashes).toHaveLength(2);
    // sha256("alert(1)"), base64
    expect(hashes[0]).toBe("'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='");
  });
});

describe("A2 read caching", () => {
  it("caches read routes briefly at the CDN", () => {
    expect(READ_CACHE).toBe("public, s-maxage=3, stale-while-revalidate=10");
  });
});
