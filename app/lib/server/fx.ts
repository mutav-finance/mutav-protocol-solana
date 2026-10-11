/**
 * The USD/BRL rate the investor screens use to show BRS amounts in dollars.
 * Display only: the reserve holds and accounts in BRS (spec §2, ADR 0018), and
 * nothing here feeds a transaction. BRS itself is valued at par to BRL.
 */
import { NotConfiguredError } from "./chain";
import { mockEnabled } from "./mock";

export type FxView = {
  /** BRL per 1 USD, scaled by FX_SCALE (1e6). */
  usdBrl: bigint;
  /** Where the rate comes from, shown next to converted figures. */
  source: string;
  /** Unix seconds of the rate. */
  at: bigint;
};

/** Mock chain: a fixed, labelled rate (R$5.40 per US$1). */
const MOCK_USD_BRL = 5_400_000n;

export async function readFx(): Promise<FxView> {
  if (mockEnabled()) return { usdBrl: MOCK_USD_BRL, source: "mock rate", at: BigInt(Math.floor(Date.now() / 1000)) };
  // TODO(fx source): pick the USD/BRL feed (e.g. a Pyth FX.USD/BRL account read through the RPC). Until then fail closed: screens show BRS.
  throw new NotConfiguredError("No USD/BRL rate source configured; amounts are shown in BRS");
}
