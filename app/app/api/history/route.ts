import { guardedEnv, readHistoryCached } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockLedger } from "@/lib/server/mock";
import type { LedgerHistory } from "@/lib/view";

/**
 * The ledger's history: fee and income receipts and the capital queue's
 * fills. The heavy read (signature lists, transactions, block times): only
 * the history charts, activity feeds and receipt lists wait on it.
 */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) {
      const { fees, income, capitalEvents } = (await mockLedger()).ledger;
      return jsonResponse({ fees, income, capitalEvents } satisfies LedgerHistory);
    }
    return readResponse(await readHistoryCached(await guardedEnv(), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
