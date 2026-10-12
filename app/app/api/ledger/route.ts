import { guardedEnv, readAccountsCached, readHistoryCached, readReserveShared } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, HEAVY_TTL_MS, isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockLedger } from "@/lib/server/mock";

/**
 * Reserve snapshot plus guarantees, claims, payouts, exposures, fees and queues
 * (the operator, admin and demo consoles). Composed from the same cached reads
 * as /api/reserve, /api/accounts and /api/history, so a page polling those
 * and a console polling this share one read of each.
 */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) return jsonResponse(await mockLedger());
    const env = await guardedEnv();
    const fresh = isFresh(req);
    return readResponse(
      await cachedRead("ledger", async () => {
        const [reserve, accounts, history] = await Promise.all([
          readReserveShared(env, { fresh }),
          readAccountsCached(env, { fresh, allowStale: false }),
          readHistoryCached(env, { fresh, allowStale: false }),
        ]);
        return { reserve, ledger: { ...accounts.value, ...history.value } };
      }, { fresh, ttlMs: HEAVY_TTL_MS }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
