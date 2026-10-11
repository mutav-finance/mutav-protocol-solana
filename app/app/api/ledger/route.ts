import { guardedEnv, readLedger, readReserve } from "@/lib/server/chain";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

/** Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues. */
export async function GET() {
  try {
    const env = await guardedEnv();
    const reserve = await readReserve(env);
    const ledger = await readLedger(env, reserve);
    return jsonResponse({ reserve, ledger });
  } catch (e) {
    return errorResponse(e);
  }
}
