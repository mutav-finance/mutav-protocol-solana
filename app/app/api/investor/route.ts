import { guardedEnv, readReserveShared } from "@/lib/server/chain";
import { readInvestor } from "@/lib/server/investor";
import { errorResponse, readResponse } from "@/lib/server/respond";
import { cachedInvestorRead, isFresh } from "@/lib/server/read-cache";
import { jsonResponse } from "@/lib/serde";
import { parseOwner } from "@/lib/server/owner";

/** `?owner=<wallet>`: that wallet's allowlist status, and balances. Without it, the allowlist facts only. */
export async function GET(req: Request) {
  try {
    // Validate before any RPC call or cache write (A2): junk owners cost nothing.
    const owner = parseOwner(new URL(req.url).searchParams.get("owner"));
    if (owner === undefined) return jsonResponse({ error: "owner must be a wallet address" }, { status: 400 });
    const env = await guardedEnv();
    return readResponse(await cachedInvestorRead(owner, async () => readInvestor(env, await readReserveShared(env, { fresh: isFresh(req) }), owner), { fresh: isFresh(req) }));
  } catch (e) {
    return errorResponse(e);
  }
}
