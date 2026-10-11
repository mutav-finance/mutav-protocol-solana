import { guardedEnv, readReserve } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, isFresh } from "@/lib/server/read-cache";

/** The reserve snapshot: VaultConfig, VaultState and the §4 quantities. */
export async function GET(req: Request) {
  try {
    const env = await guardedEnv();
    return readResponse(await cachedRead("reserve", () => readReserve(env), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
