import { guardedEnv, readReserve } from "@/lib/server/chain";
import { readOperatorHistory } from "@/lib/server/operator";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockOperator } from "@/lib/server/mock";

/** The operator key's recent MUTAV transactions and the last accept_role found in VaultConfig's history. */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) return jsonResponse(await mockOperator());
    const env = await guardedEnv();
    return readResponse(await cachedRead("operator", async () => readOperatorHistory(env, await readReserve(env)), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
