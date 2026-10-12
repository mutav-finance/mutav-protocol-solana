import { guardedEnv, readReserve } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockReserve } from "@/lib/server/mock";

/** The reserve snapshot: VaultConfig, VaultState and the §4 quantities. */
export async function GET(req: Request) {
  try {
    if (mockEnabled()) return jsonResponse(await mockReserve());
    const env = await guardedEnv();
    return readResponse(await cachedRead("reserve", () => readReserve(env), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
