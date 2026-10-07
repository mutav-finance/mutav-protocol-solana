import { signature as toSignature } from "@solana/kit";
import { rpcFor } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

export async function GET(req: Request) {
  try {
    const sig = new URL(req.url).searchParams.get("sig") ?? "";
    const env = serverEnv();
    const { value } = await rpcFor(env).getSignatureStatuses([toSignature(sig)], { searchTransactionHistory: true }).send();
    const s = value[0];
    if (!s) return jsonResponse({ status: "pending" });
    if (s.err) return jsonResponse({ status: "failed", err: s.err, slot: s.slot });
    return jsonResponse({ status: s.confirmationStatus ?? "processed", slot: s.slot });
  } catch (e) {
    return errorResponse(e);
  }
}
