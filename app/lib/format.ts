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

/**
 * Non-breaking space between a currency sign and its amount, so `R$` never
 * wraps apart from the figure in a narrow cell or a sentence.
 */
const NBSP = "\u00a0";

/** BRS amount as reais: `R$ 12,345.67` (the space is non-breaking). */
export const fmtBrs = (base: bigint, places = 2) => `R$${NBSP}${fmtUnits(base, BRS_DECIMALS, places)}`;

/** Scale of an FX rate: BRL per 1 USD × 1e6 (`5_400_000n` = R$5.40 per US$1). */
export const FX_SCALE = 1_000_000n;

/** BRS base units (at par to BRL) as USD base units (6 decimals), truncated: never shown above its value. */
export const brsToUsd = (base: bigint, usdBrl: bigint) => (base * FX_SCALE) / usdBrl;

/** A BRS amount in US dollars at `usdBrl`: `US$ 2,285.18` (non-breaking space). Display only; the chain holds BRS. */
export const fmtUsd = (base: bigint, usdBrl: bigint, places = 2) => `US$${NBSP}${fmtUnits(brsToUsd(base, usdBrl), BRS_DECIMALS, places)}`;

/**
 * A rate as BRL per US$1 × FX_SCALE, always a bigint: a scaled bigint passes
 * through; a plain number or decimal string (`4.9892`) is scaled by 1e6 and
 * rounded. Null for anything unusable (non-finite, ≤ 0), so a hint is never
 * computed from a bad rate and bigint math never meets a `number`.
 */
export function toScaledRate(rate: unknown): bigint | null {
  if (typeof rate === "bigint") return rate > 0n ? rate : null;
  const n = typeof rate === "number" ? rate : typeof rate === "string" ? Number(rate) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = BigInt(Math.round(n * Number(FX_SCALE)));
  return scaled > 0n ? scaled : null;
}

/** The small hint after a BRS figure: `≈ US$ 2,285.18`, or `≈ −US$ 4.00` with a sign. Empty without a usable rate. Display only. */
export function fmtUsdHint(base: bigint, rate: unknown, sign = ""): string {
  const r = toScaledRate(rate);
  if (r === null || typeof base !== "bigint") return "";
  return `≈ ${sign || (base < 0n ? "−" : "")}${fmtUsd(base < 0n ? -base : base, r)}`;
}

/** An FX `asOf` (ISO, `2026-10-09T13:07:30-03:00`) as the quote's own date, ISO: `2026-10-09`. */
export function fmtFxDate(asOf: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(asOf);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : asOf;
}

/** The one source line wherever US$ hints show. */
export function fxSourceLine(fx: { source: string; asOf: string }): string {
  const src = fx.source === "PTAX/BCB" ? "PTAX (Banco Central do Brasil)" : fx.source;
  return `US$ at ${src}, ${fmtFxDate(fx.asOf)}. Display only; the reserve holds BRS.`;
}

/** `base` rounded half up (away from zero) to `places` of its `decimals`, still in base units. */
function roundHalfUp(base: bigint, decimals: number, places: number): bigint {
  if (places >= decimals) return base;
  const step = 10n ** BigInt(decimals - places);
  const neg = base < 0n;
  const abs = neg ? -base : base;
  const r = ((abs + step / 2n) / step) * step;
  return neg ? -r : r;
}

/** Reserve shares, 2 places, rounded half up: `35,833.33`. Display only; inputs keep full precision. */
export const fmtShares = (base: bigint) => fmtUnits(roundHalfUp(base, SHARE_DECIMALS, 2), SHARE_DECIMALS, 2);

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

// ── Percentages: one formatter family, one decimal, rounded half up ─────────

/** `num / den` in tenths of a percent, rounded half up (away from zero). `den` must be > 0. */
function tenthsOfPct(num: bigint, den: bigint): bigint {
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const t = (n * 2_000n + d) / (2n * d);
  return neg ? -t : t;
}

const tenthsText = (t: bigint, trim: boolean) => {
  const neg = t < 0n;
  const a = neg ? -t : t;
  const body = trim && a % 10n === 0n ? group((a / 10n).toString()) : `${group((a / 10n).toString())}.${a % 10n}`;
  return `${neg ? "-" : ""}${body}%`;
};

/**
 * `part` as a share of `whole`, one decimal, rounded half up: `18.2%`,
 * `122.2%`. An em dash when `whole` is 0. The one formatter for measured
 * shares and ratios on screen.
 */
export function fmtPctOf(part: bigint, whole: bigint): string {
  if (whole === 0n) return "—";
  return tenthsText(tenthsOfPct(part, whole), false);
}

/** Basis points as a percentage, one decimal, rounded half up: `2000` → `20.0%`, `5` → `0.1%`. For measured values. */
export const fmtBps = (bps: number | bigint) => fmtPctOf(BigInt(bps), BPS_DENOMINATOR);

/** A configured rate in basis points, one decimal at most (rounded half up), no trailing `.0`: 2_500 → "25%", 250 → "2.5%". */
export const fmtPct = (bps: number | bigint) => tenthsText(tenthsOfPct(BigInt(bps), BPS_DENOMINATOR), true);

/** Unix seconds (i64) as UTC: `2026-10-06 23:19:04 UTC`. `0` means unset. */
export function fmtTime(ts: bigint): string {
  if (ts === 0n) return "—";
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

/** Unix seconds as `2026-10-06 23:19:04`: UTC without the suffix, for table cells under a "UTC" heading. */
export const fmtStamp = (ts: bigint) => fmtTime(ts).replace(/ UTC$/, "");

/** Seconds from `from` to `to`, or null while `to` is unset. */
export const elapsed = (from: bigint, to: bigint | null): bigint | null => (to === null ? null : to - from);

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

/** Ratio `a / b` as a percentage (the coverage multiple: `122.2%`); `—` when `b` is 0. Same as {@link fmtPctOf}. */
export const fmtRatio = fmtPctOf;

// ── The /reserve header's read line ───────────────────────────────────────

/** Below this age the on-chain figures count as fresh, and the header reads "Live". */
export const LIVE_FRESH_SECS = 600n;

/**
 * The header's read line. Fresh (refreshed on-chain under ~10 minutes ago):
 * "Live · read every 10 s", with the pulse. Older: says the page still reads
 * every 10 s but the on-chain refresh is old, with no pulse.
 */
export function liveLine(now: bigint, published: bigint): { fresh: boolean; text: string } {
  if (published === 0n) return { fresh: false, text: "Read every 10 s · not yet refreshed on-chain" };
  const age = now - published;
  if (age < LIVE_FRESH_SECS) return { fresh: true, text: "Live · read every 10 s" };
  return { fresh: false, text: `Read every 10 s · last on-chain refresh ${fmtAgeShort(age)} ago` };
}

/** An age in its largest unit: "45m", "13h", "2d". */
export function fmtAgeShort(secs: bigint): string {
  if (secs >= 86_400n) return `${secs / 86_400n}d`;
  if (secs >= 3_600n) return `${secs / 3_600n}h`;
  return `${secs / 60n}m`;
}
