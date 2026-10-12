import { readFx, type FxResponse } from "@/lib/server/fx";
import { jsonResponse } from "@/lib/serde";

/**
 * The USD/BRL display rate (lib/server/fx.ts: BCB PTAX, cached ~1 h).
 * Always 200: `{ fx: null }` when there is no rate, so pages just hide the
 * US$ hints and never block on it.
 */
export async function GET() {
  let fx: FxResponse["fx"] = null;
  try {
    fx = await readFx();
  } catch {
    fx = null;
  }
  const body: FxResponse = { fx };
  return jsonResponse(body);
}
