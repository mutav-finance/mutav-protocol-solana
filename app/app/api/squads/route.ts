import { address } from "@solana/kit";
import { guardedEnv, readReserve } from "@/lib/server/chain";
import { ComposeError } from "@/lib/server/compose";
import { errorResponse } from "@/lib/server/respond";
import { boundedBody } from "@/lib/server/relay";
import { composeProposalAction, readMultisig, vaultAddress, type ProposalAction } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";

/** The admin multisig and its recent proposals, or why there is none. */
export async function GET() {
  try {
    const env = await guardedEnv();
    const reserve = await readReserve(env);
    if (!env.squadsMultisig) {
      return jsonResponse({ configured: false, admin: reserve.config.admin, cluster: env.cluster });
    }
    const vault = vaultAddress(env.squadsMultisig);
    const ms = await readMultisig(env, reserve.now, reserve.config);
    return jsonResponse({ configured: true, adminIsVault: reserve.config.admin === vault, multisig: ms, now: reserve.now });
  } catch (e) {
    return errorResponse(e);
  }
}

const ACTIONS: readonly ProposalAction[] = ["approve", "reject", "cancel", "execute"];

/** Compose an unsigned approve, reject, cancel or execute transaction for a member's wallet. */
export async function POST(req: Request) {
  try {
    const body = decode<{ action: ProposalAction; index: bigint; member: string }>(await boundedBody(req));
    if (!ACTIONS.includes(body.action)) throw new ComposeError(`unknown action ${String(body.action)}`);
    if (typeof body.index !== "bigint" || body.index < 1n) throw new ComposeError("index must be a proposal index");
    const env = await guardedEnv();
    const member = address(body.member);
    // Execute re-reads the config for the stale-carry check (A3).
    const config = body.action === "execute" ? (await readReserve(env)).config : undefined;
    const tx = await composeProposalAction(env, member, body.index, body.action, config);
    return jsonResponse({ tx });
  } catch (e) {
    return errorResponse(e);
  }
}
