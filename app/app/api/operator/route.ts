import { guardedEnv, readReserveShared } from "@/lib/server/chain";
import { readOperatorHistory } from "@/lib/server/operator";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, HEAVY_TTL_MS, isFresh } from "@/lib/server/read-cache";

/** The operator key's recent MUTAV transactions and the last accept_role found in VaultConfig's history. */
export async function GET(req: Request) {
  try {
    const env = await guardedEnv();
    return readResponse(await cachedRead("operator", async () => readOperatorHistory(env, await readReserveShared(env, { fresh: isFresh(req) })), { fresh: isFresh(req), ttlMs: HEAVY_TTL_MS }));
  } catch (e) {
    return errorResponse(e);
  }
}
