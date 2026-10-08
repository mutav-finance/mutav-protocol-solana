import { readLedger, readReserve } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockLedger } from "@/lib/server/mock";

/** Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues. */
export async function GET() {
  try {
    if (mockEnabled()) return jsonResponse(await mockLedger());
    const env = serverEnv();
    const reserve = await readReserve(env);
    const ledger = await readLedger(env, reserve);
    return jsonResponse({ reserve, ledger });
  } catch (e) {
    return errorResponse(e);
  }
}
