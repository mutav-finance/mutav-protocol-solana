/**
 * The USD/BRL rate behind the small "≈ US$" hints next to BRS figures.
 * Display only: the reserve holds and accounts in BRS (spec §2, ADR 0018), and
 * nothing here feeds a transaction. Figures stay in BRS; the hint is extra.
 *
 * Source: the Banco Central do Brasil PTAX selling rate (Olinda OData),
 * fetched server-side only (so the browser's CSP `connect-src 'self'` holds).
 * BRS is pegged 1:1 to BRL, so a BRS amount converts at the BRL rate.
 */
import { toScaledRate } from "../format";
import { mockEnabled } from "./mock";

export type FxView = {
  /** BRL (= BRS, pegged 1:1) per 1 USD, scaled by FX_SCALE (1e6). */
  rate: bigint;
  /** "PTAX/BCB", or "mock rate" on the mock chain. */
  source: string;
  /** When the rate was published, ISO 8601 in Brasília time (`2026-10-09T13:07:30-03:00`). */
  asOf: string;
};

/**
 * What /api/fx answers (always 200). `fx: null` means no rate (the source
 * failed or published nothing): screens show BRS without hints, and the
 * client stops polling.
 */
export type FxResponse = { fx: FxView | null };

export const PTAX_SOURCE = "PTAX/BCB";

/** Mock chain: a fixed, labelled rate (R$5.40 per US$1). */
const MOCK_RATE = 5_400_000n;

const PTAX_URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)";
/** Weekends and holidays publish nothing: walk back up to this many days. */
const LOOKBACK_DAYS = 7;
const TIMEOUT_MS = 5_000;
const TTL_MS = 60 * 60 * 1000;
/** A failed read is retried sooner than a good one is refreshed. */
const FAIL_TTL_MS = 5 * 60 * 1000;
/** Brasília is UTC−3 all year (no daylight saving since 2019). */
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000;

type PtaxRow = { cotacaoCompra?: unknown; cotacaoVenda?: unknown; dataHoraCotacao?: unknown };

/** `MM-DD-YYYY` for the Olinda `@dataCotacao` parameter. */
const odataDate = (d: Date) => `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}-${d.getUTCFullYear()}`;

export const ptaxUrl = (day: Date) => `${PTAX_URL}?@dataCotacao='${odataDate(day)}'&$format=json`;

/** One PTAX row as an FxView, or null if it is not a usable rate. */
export function parsePtaxRow(row: PtaxRow): FxView | null {
  const venda = row.cotacaoVenda;
  const at = row.dataHoraCotacao;
  const rate = toScaledRate(venda);
  if (rate === null) return null;
  // "2026-10-09 13:07:30.746597", Brasília time.
  const m = typeof at === "string" ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(at) : null;
  if (!m) return null;
  return { rate, source: PTAX_SOURCE, asOf: `${m[1]}T${m[2]}-03:00` };
}

/**
 * The latest published PTAX rate: today's (Brasília date), else the day
 * before, up to LOOKBACK_DAYS back. Null on any failure; never throws.
 */
export async function fetchPtax(fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<FxView | null> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const today = new Date(now.getTime() + BRT_OFFSET_MS);
    for (let i = 0; i <= LOOKBACK_DAYS; i++) {
      const day = new Date(today.getTime() - i * 86_400_000);
      const res = await fetchFn(ptaxUrl(day), { signal, cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) return null;
      const body = (await res.json()) as { value?: PtaxRow[] };
      if (!Array.isArray(body.value)) return null;
      const last = body.value.at(-1);
      if (last) return parsePtaxRow(last);
    }
    return null;
  } catch {
    return null;
  }
}

let cached: { fx: FxView | null; until: number } | null = null;
let inflight: Promise<FxView | null> | null = null;

/** Test hook: forget the cached rate. */
export const resetFxCache = () => {
  cached = null;
  inflight = null;
};

/** The display rate, cached in memory for about an hour (a failure for five minutes). */
export async function readFx(fetchFn: typeof fetch = fetch, now: Date = new Date()): Promise<FxView | null> {
  if (mockEnabled()) return { rate: MOCK_RATE, source: "mock rate", asOf: new Date(now.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 19) + "-03:00" };
  if (cached && now.getTime() < cached.until) return cached.fx;
  inflight ??= fetchPtax(fetchFn, now).then((fx) => {
    cached = { fx, until: now.getTime() + (fx ? TTL_MS : FAIL_TTL_MS) };
    inflight = null;
    return fx;
  });
  return inflight;
}
