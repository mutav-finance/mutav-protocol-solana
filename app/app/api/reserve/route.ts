import { guardedEnv, readReserve } from "@/lib/server/chain";
import { errorResponse, readResponse } from "@/lib/server/respond";

/** The reserve snapshot: VaultConfig, VaultState and the §4 quantities. */
export async function GET() {
  try {
    return readResponse(await readReserve(await guardedEnv()));
  } catch (e) {
    return errorResponse(e);
  }
}
