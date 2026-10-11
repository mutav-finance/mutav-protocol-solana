import { guardedEnv, readLedger, readReserve } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, isFresh } from "@/lib/server/read-cache";

/** Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues. */
export async function GET(req: Request) {
  try {
    const env = await guardedEnv();
    return readResponse(
      await cachedRead("ledger", async () => {
        const reserve = await readReserve(env);
        return { reserve, ledger: await readLedger(env, reserve) };
      }, { fresh: isFresh(req) }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
