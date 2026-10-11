import { guardedEnv, readReserve } from "@/lib/server/chain";
import { readInvestor } from "@/lib/server/investor";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedRead, isFresh } from "@/lib/server/read-cache";

/** `?owner=<wallet>`: that wallet's allowlist status, and balances. Without it, the allowlist facts only. */
export async function GET(req: Request) {
  try {
    const env = await guardedEnv();
    const raw = new URL(req.url).searchParams.get("owner");
    const owner = raw && raw.trim() ? raw.trim() : null;
    return readResponse(await cachedRead(`investor:${owner ?? ""}`, async () => readInvestor(env, await readReserve(env), owner), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
