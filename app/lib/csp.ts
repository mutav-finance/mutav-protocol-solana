/**
 * The enforced Content-Security-Policy on pages (A6, A-R3-1), built per
 * request in proxy.ts. No Node imports: proxy code stays runtime-neutral.
 */
export function contentSecurityPolicy({ nonce, scriptHashes = [], dev = false }: { nonce: string; scriptHashes?: string[]; dev?: boolean }): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic': scripts the nonced ones load are trusted; hashes cover the static simulator.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${scriptHashes.join(" ")}${dev ? " 'unsafe-eval'" : ""}`.replace(/\s+/g, " ").trim(),
    // Product components style with inline style attributes (see app/CLAUDE.md).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    // The browser only talks to this app's /api routes; wallets send through their own RPC.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
