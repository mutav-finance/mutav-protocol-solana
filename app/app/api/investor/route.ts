import { readReserve } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { readInvestor } from "@/lib/server/investor";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";
import { mockEnabled, mockInvestor } from "@/lib/server/mock";

/** `?owner=<wallet>`: that wallet's allowlist status, balances and HolderState. Without it, the allowlist facts only. */
export async function GET(req: Request) {
  try {
    const env = serverEnv();
    const owner = new URL(req.url).searchParams.get("owner");
    if (mockEnabled()) return jsonResponse(await mockInvestor(owner && owner.trim() ? owner.trim() : null));
    const reserve = await readReserve(env);
    return jsonResponse(await readInvestor(env, reserve, owner && owner.trim() ? owner.trim() : null));
  } catch (e) {
    return errorResponse(e);
  }
}
