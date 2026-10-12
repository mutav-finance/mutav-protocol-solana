import { guardedEnv, readAccountsCached } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockLedger } from "@/lib/server/mock";
import type { LedgerAccounts } from "@/lib/view";

/**
 * The ledger's account reads: guarantees, claim filings and the queue's
 * requests. What /reserve's coverage, claims and queue panels and /capital
 * need, without the history read (/api/history) they never wait on.
 */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) {
      const { guarantees, filings, deposits, redeems } = (await mockLedger()).ledger;
      return jsonResponse({ guarantees, filings, deposits, redeems } satisfies LedgerAccounts);
    }
    return readResponse(await readAccountsCached(await guardedEnv(), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
