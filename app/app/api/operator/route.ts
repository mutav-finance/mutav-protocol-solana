import { readReserve } from "@/lib/server/chain";
import { serverEnv } from "@/lib/server/env";
import { readOperatorHistory } from "@/lib/server/operator";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

/** The operator key's recent MUTAV transactions and the last accept_role found in VaultConfig's history. */
export async function GET() {
  try {
    const env = serverEnv();
    const reserve = await readReserve(env);
    return jsonResponse(await readOperatorHistory(env, reserve));
  } catch (e) {
    return errorResponse(e);
  }
}
