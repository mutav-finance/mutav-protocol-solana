import { readReserve } from "@/lib/server/chain";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

/** The reserve snapshot: VaultConfig, VaultState and the §4 quantities. */
export async function GET() {
  try {
    return jsonResponse(await readReserve());
  } catch (e) {
    return errorResponse(e);
  }
}
