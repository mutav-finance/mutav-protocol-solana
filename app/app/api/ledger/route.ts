import { guardedEnv, readLedger, readReserve } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";

/** Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues. */
export async function GET() {
  try {
    const env = await guardedEnv();
    const reserve = await readReserve(env);
    const ledger = await readLedger(env, reserve);
    return readResponse({ reserve, ledger });
  } catch (e) {
    return errorResponse(e);
  }
}
