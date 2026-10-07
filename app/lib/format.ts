/**
 * Display formatting. Every amount arrives as a `bigint` in base units from
 * the chain; nothing here rounds in a way that changes what is shown beyond
 * the stated precision.
 */
import { NAV_SCALE, BPS_DENOMINATOR } from "@mutav-finance/mutav-protocol-solana";

/** BRS and reserve shares both use 6 decimals (SHARE_DECIMALS = 6; BRS mint = 6). */
export const BRS_DECIMALS = 6;
export const SHARE_DECIMALS = 6;

const group = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** `base` units with `decimals` places, shown with `places` places (truncated, never rounded up). */
export function fmtUnits(base: bigint, decimals: number, places = 2): string {
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0").slice(0, places);
  const body = places > 0 ? `${group(whole.toString())}.${frac}` : group(whole.toString());
  return neg ? `-${body}` : body;
}

/** BRS amount as reais: `R$ 12,345.67`. */
export const fmtBrs = (base: bigint, places = 2) => `R$ ${fmtUnits(base, BRS_DECIMALS, places)}`;

/** Reserve shares: `12,345.678901`. */
export const fmtShares = (base: bigint) => fmtUnits(base, SHARE_DECIMALS, 6);

/** NAV per share (`NAV_SCALE` = 1.0) with 6 places. `0` (no shares) shows as an em dash. */
export function fmtNav(nav: bigint): string {
  if (nav === 0n) return "—";
  return fmtUnits(nav, Number(NAV_SCALE.toString().length - 1), 6);
}

/** Basis points as a percentage: `2000` → `20.00%`. */
export function fmtBps(bps: number | bigint, places = 2): string {
  const b = BigInt(bps);
  const scaled = (b * 10n ** BigInt(places) * 100n) / BPS_DENOMINATOR;
  const s = scaled.toString().padStart(places + 1, "0");
  return `${s.slice(0, -places) || "0"}.${s.slice(-places)}%`;
}

/** Unix seconds (i64) as UTC: `2026-10-06 23:19:04 UTC`. `0` means unset. */
export function fmtTime(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** A duration in seconds: `2d 03h`, `4h 12m`, `38s`. */
export function fmtDuration(secs: bigint): string {
  const s = secs < 0n ? 0n : secs;
  const d = s / 86_400n;
  const h = (s % 86_400n) / 3_600n;
  const m = (s % 3_600n) / 60n;
  if (d > 0n) return `${d}d ${h.toString().padStart(2, "0")}h`;
  if (h > 0n) return `${h}h ${m.toString().padStart(2, "0")}m`;
  if (m > 0n) return `${m}m ${(s % 60n).toString().padStart(2, "0")}s`;
  return `${s}s`;
}

/** `8scC…Qqv9`. */
export const shortAddr = (a: string, n = 4) => (a.length <= n * 2 + 1 ? a : `${a.slice(0, n)}…${a.slice(-n)}`);

/** First bytes of a 32-byte id or hash as hex: `a1b2c3d4…`. */
export function shortHex(b: Uint8Array, n = 4): string {
  const hex = Array.from(b.slice(0, n), (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex}…`;
}

export const isZeroBytes = (b: Uint8Array) => b.every((x) => x === 0);

/**
 * Parse a user-entered BRS amount (`"1,234.5"`) into base units, exactly, with
 * no float. Returns null for empty, invalid, zero or over-precise input.
 */
export function parseBrs(input: string, decimals = BRS_DECIMALS): bigint | null {
  const t = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [w = "", f = ""] = t.split(".");
  if (f.length > decimals) return null;
  const v = BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
  return v > 0n ? v : null;
}

/** Ratio `a / b` as a percentage with one decimal; `—` when `b` is 0. */
export function fmtRatio(a: bigint, b: bigint): string {
  if (b === 0n) return "—";
  const tenths = (a * 1000n) / b;
  return `${group((tenths / 10n).toString())}.${(tenths % 10n).toString()}%`;
}
