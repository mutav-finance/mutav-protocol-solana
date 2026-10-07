import { rpcFor } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { assertRelayable } from "@/lib/server/relay";
import { errorResponse } from "@/lib/server/respond";
import { SQUADS_PROGRAM } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";

/** Relay a wallet-signed transaction to the configured cluster (never mainnet). */
export async function POST(req: Request) {
  try {
    const { tx } = decode<{ tx: string }>(await req.text());
    const env = serverEnv();
    assertRelayable(tx, [env.programId, SQUADS_PROGRAM]);
    const signature = await rpcFor(env)
      .sendTransaction(tx as never, { encoding: "base64", preflightCommitment: "confirmed" })
      .send();
    return jsonResponse({ signature });
  } catch (e) {
    return errorResponse(e);
  }
}
