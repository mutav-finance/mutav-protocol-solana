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

/** Scale of an FX rate: BRL per 1 USD × 1e6 (`5_400_000n` = R$5.40 per US$1). */
export const FX_SCALE = 1_000_000n;

/** BRS base units (at par to BRL) as USD base units (6 decimals), truncated: never shown above its value. */
export const brsToUsd = (base: bigint, usdBrl: bigint) => (base * FX_SCALE) / usdBrl;

/** A BRS amount shown in dollars at `usdBrl`: `$ 2,285.18`. Display only; the chain holds BRS. */
export const fmtUsd = (base: bigint, usdBrl: bigint, places = 2) => `$ ${fmtUnits(brsToUsd(base, usdBrl), BRS_DECIMALS, places)}`;

/** Reserve shares: `12,345.678901`. */
export const fmtShares = (base: bigint) => fmtUnits(base, SHARE_DECIMALS, 6);

/** NAV per share (`NAV_SCALE` = 1.0) with 6 places. `0` (no shares) shows as an em dash. */
export function fmtNav(nav: bigint): string {
  if (nav === 0n) return "—";
  return fmtUnits(nav, Number(NAV_SCALE.toString().length - 1), 6);
}

/** Share price for investor screens: NAV per share with 4 places and its unit, `1.3240 BRS`. `0` (no shares) shows as an em dash. */
export function fmtSharePrice(nav: bigint): string {
  if (nav === 0n) return "—";
  return `${fmtUnits(nav, Number(NAV_SCALE.toString().length - 1), 4)} BRS`;
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

/**
 * A cover multiple ("3", "1.15") as hundredths, exactly, with no float (A8:
 * `Number("1.15") * 100` is 114.999…). Null for invalid or over-precise input.
 */
export function parseHundredths(input: string): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [w = "0", f = ""] = t.split(".");
  return BigInt(w) * 100n + BigInt(f.padEnd(2, "0"));
}

/** Base units as an exact input string (`"1234.5"`): no grouping, trailing zeros trimmed; parseBrs reads it back. */
export function toInput(base: bigint, decimals = BRS_DECIMALS): string {
  const scale = 10n ** BigInt(decimals);
  const f = (base % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return f ? `${base / scale}.${f}` : `${base / scale}`;
}

/** Like parseBrs, but "0" is a valid amount (price limits: 0 = none). */
export function parseUnitsOrZero(input: string, decimals = BRS_DECIMALS): bigint | null {
  const t = input.trim().replace(/,/g, "");
  if (/^0*\.?0*$/.test(t) && t !== "" && t !== ".") return 0n;
  return parseBrs(input, decimals);
}

/** Ratio `a / b` as a percentage with one decimal; `—` when `b` is 0. */
export function fmtRatio(a: bigint, b: bigint): string {
  if (b === 0n) return "—";
  const tenths = (a * 1000n) / b;
  return `${group((tenths / 10n).toString())}.${(tenths % 10n).toString()}%`;
}

/** Basis points as a percentage with at most two decimals and no trailing zeros: 10_000 → "100%", 2_550 → "25.5%". */
export const fmtPct = (bps: number | bigint) => `${Number(bps) / 100}%`;
