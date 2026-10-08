import { address } from "@solana/kit";
import { readReserve } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/respond";
import { composeProposalApprove, composeProposalExecute, readMultisig, vaultAddress } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";

/** The admin multisig and its recent proposals, or why there is none. */
export async function GET() {
  try {
    const env = serverEnv();
    const reserve = await readReserve(env);
    if (!env.squadsMultisig) {
      return jsonResponse({ configured: false, admin: reserve.config.admin, cluster: env.cluster });
    }
    const vault = vaultAddress(env.squadsMultisig);
    const ms = await readMultisig(env, reserve.now, 10, reserve.config);
    return jsonResponse({ configured: true, adminIsVault: reserve.config.admin === vault, multisig: ms, now: reserve.now });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Compose an unsigned approve or execute transaction for a member's wallet. */
export async function POST(req: Request) {
  try {
    const body = decode<{ action: "approve" | "execute"; index: bigint; member: string }>(await req.text());
    const env = serverEnv();
    const member = address(body.member);
    const tx =
      body.action === "approve"
        ? await composeProposalApprove(env, member, body.index)
        : await composeProposalExecute(env, member, body.index);
    return jsonResponse({ tx });
  } catch (e) {
    return errorResponse(e);
  }
}
