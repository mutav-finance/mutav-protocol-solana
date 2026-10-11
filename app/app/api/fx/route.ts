import { readFx } from "@/lib/server/fx";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

/** The USD/BRL display rate (lib/server/fx.ts). */
export async function GET() {
  try {
    return jsonResponse(await readFx());
  } catch (e) {
    return errorResponse(e);
  }
}
