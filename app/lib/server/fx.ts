/**
 * The USD/BRL rate the investor screens use to show BRS amounts in dollars.
 * Display only: the reserve holds and accounts in BRS (spec §2, ADR 0018), and
 * nothing here feeds a transaction. BRS itself is valued at par to BRL.
 */
import { mockEnabled } from "./mock";

export type FxView = {
  /** BRL per 1 USD, scaled by FX_SCALE (1e6). */
  usdBrl: bigint;
  /** Where the rate comes from, shown next to converted figures. */
  source: string;
  /** Unix seconds of the rate. */
  at: bigint;
};

/**
 * What /api/fx answers (200). `fx: null` means no rate source is configured:
 * screens show BRS, and the client stops polling (the answer cannot change
 * without a redeploy).
 */
export type FxResponse = { fx: FxView | null };

/** Mock chain: a fixed, labelled rate (R$5.40 per US$1). */
const MOCK_USD_BRL = 5_400_000n;

export async function readFx(): Promise<FxView | null> {
  if (mockEnabled()) return { usdBrl: MOCK_USD_BRL, source: "mock rate", at: BigInt(Math.floor(Date.now() / 1000)) };
  // TODO(fx source): pick the USD/BRL feed (e.g. a Pyth FX.USD/BRL account read through the RPC). Until then fail closed: no rate, screens show BRS.
  return null;
}
