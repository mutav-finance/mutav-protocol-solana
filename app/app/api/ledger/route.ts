import { guardedEnv, readLedger, readReserveShared } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, HEAVY_TTL_MS, isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockLedger } from "@/lib/server/mock";

/** Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues. */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) return jsonResponse(await mockLedger());
    const env = await guardedEnv();
    return readResponse(
      await cachedRead("ledger", async () => {
        const reserve = await readReserveShared(env, { fresh: isFresh(req) });
        return { reserve, ledger: await readLedger(env, reserve) };
      }, { fresh: isFresh(req), ttlMs: HEAVY_TTL_MS }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
