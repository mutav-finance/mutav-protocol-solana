import { readFx, type FxResponse } from "@/lib/server/fx";
import { errorResponse } from "@/lib/server/respond";
import { jsonResponse } from "@/lib/serde";

/** The USD/BRL display rate (lib/server/fx.ts); `{ fx: null }` when no source is configured. */
export async function GET() {
  try {
    const body: FxResponse = { fx: await readFx() };
    return jsonResponse(body);
  } catch (e) {
    return errorResponse(e);
  }
}
