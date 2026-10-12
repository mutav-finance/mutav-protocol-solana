import { describe, expect, it } from "vitest";
import { cspReportOnly } from "../csp";
import { inlineScriptHashes, SAFE_HEADERS } from "../security-headers";
import { READ_CACHE } from "../server/respond";
import { vi } from "vitest";

vi.mock("../server/chain", () => ({ NotConfiguredError: class extends Error {} }));

describe("A6 headers", () => {
  it("forbids framing, sniffing and referrers on every response", () => {
    const h = Object.fromEntries(SAFE_HEADERS.map((x) => [x.key, x.value]));
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["Permissions-Policy"]).toMatch(/camera=\(\)/);
  });
  it("builds a nonce CSP with the simulator's script hashes, no unsafe-inline scripts", () => {
    const csp = cspReportOnly({ nonce: "abc", scriptHashes: ["'sha256-x'"] });
    expect(csp).toMatch(/script-src 'self' 'nonce-abc' 'strict-dynamic' 'sha256-x'/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(cspReportOnly({ nonce: "n", dev: true })).toMatch(/unsafe-eval/);
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
