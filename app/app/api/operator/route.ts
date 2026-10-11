import { guardedEnv, readReserve } from "@/lib/server/chain";
import { readOperatorHistory } from "@/lib/server/operator";
import { errorResponse, readResponse } from "@/lib/server/respond";

/** The operator key's recent MUTAV transactions and the last accept_role found in VaultConfig's history. */
export async function GET() {
  try {
    const env = await guardedEnv();
    const reserve = await readReserve(env);
    return readResponse(await readOperatorHistory(env, reserve));
  } catch (e) {
    return errorResponse(e);
  }
}
