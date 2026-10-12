import { afterEach, describe, expect, it, vi } from "vitest";
import { decode } from "@/lib/serde";
import type { FxResponse } from "@/lib/server/fx";
import { noFxSource } from "@/lib/client/use-money";

const { GET } = await import("@/app/api/fx/route");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/fx", () => {
  it("answers 200 with no rate when no source is configured, and the client stops polling", async () => {
    vi.stubEnv("NEXT_PUBLIC_MOCK_CHAIN", "");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = decode<FxResponse>(await res.text());
    expect(body).toEqual({ fx: null });
    expect(noFxSource(body)).toBe(true);
  });

  it("serves the labelled mock rate on the mock chain, and the client keeps polling", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MOCK_CHAIN", "1");
    const body = decode<FxResponse>(await (await GET()).text());
    expect(body.fx?.usdBrl).toBe(5_400_000n);
    expect(body.fx?.source).toBe("mock rate");
    expect(noFxSource(body)).toBe(false);
  });
});
