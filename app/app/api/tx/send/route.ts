import { rpcFor } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { assertRelayable, boundedBody, RelayRefusedError } from "@/lib/server/relay";
import { errorResponse } from "@/lib/server/respond";
import { SQUADS_PROGRAM } from "@/lib/server/squads";
import { decode, jsonResponse } from "@/lib/serde";

/**
 * Relay a wallet-signed transaction: LOCALNET ONLY. On devnet the wallet sends
 * it itself (`solana:signAndSendTransaction`), so this route refuses (A1).
 */
export async function POST(req: Request) {
  try {
    const env = serverEnv();
    if (env.cluster !== "localnet") throw new RelayRefusedError("the relay is localnet-only: on devnet the wallet sends the transaction itself");
    const { tx } = decode<{ tx: string }>(await boundedBody(req));
    if (typeof tx !== "string") throw new RelayRefusedError("body must be { tx: base64 }");
    assertRelayable(tx, { mutav: env.programId, squadsProgram: SQUADS_PROGRAM, squadsMultisig: env.squadsMultisig });
    const signature = await rpcFor(env)
      .sendTransaction(tx as never, { encoding: "base64", preflightCommitment: "confirmed" })
      .send();
    return jsonResponse({ signature });
  } catch (e) {
    return errorResponse(e);
  }
}
