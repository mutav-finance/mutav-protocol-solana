import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@/lib/serde";
import { fetchPtax, parsePtaxRow, ptaxUrl, readFx, resetFxCache, type FxResponse } from "@/lib/server/fx";
import { noFx } from "@/lib/client/use-fx";

const { GET } = await import("@/app/api/fx/route");

/** The real Olinda shape (verified with curl, 2026-10-12). */
const published = { value: [{ cotacaoCompra: 4.9886, cotacaoVenda: 4.9892, dataHoraCotacao: "2026-10-09 13:07:30.746597" }] };
const empty = { value: [] };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that answers by the `@dataCotacao` in the URL (MM-DD-YYYY); unknown days are empty. */
function byDay(days: Record<string, unknown>) {
  return vi.fn(async (url: string | URL | Request) => {
    const d = /@dataCotacao='([\d-]+)'/.exec(String(url))?.[1] ?? "";
    return json(days[d] ?? empty);
  });
}

beforeEach(() => {
  resetFxCache();
  vi.stubEnv("NEXT_PUBLIC_MOCK_CHAIN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("PTAX parsing", () => {
  it("reads the selling rate as BRL per US$1 × 1e6, in bigint, and the time in Brasília", () => {
    expect(parsePtaxRow(published.value[0]!)).toEqual({ rate: 4_989_200n, source: "PTAX/BCB", asOf: "2026-10-09T13:07:30-03:00" });
  });

  it("rejects a row without a usable rate or time", () => {
    expect(parsePtaxRow({ cotacaoVenda: 0, dataHoraCotacao: "2026-10-09 13:07:30" })).toBeNull();
    expect(parsePtaxRow({ cotacaoVenda: "abc", dataHoraCotacao: "2026-10-09 13:07:30" })).toBeNull();
    expect(parsePtaxRow({ cotacaoVenda: 4.9, dataHoraCotacao: null })).toBeNull();
  });

  it("asks Olinda for the day as MM-DD-YYYY", () => {
    expect(ptaxUrl(new Date("2026-10-09T12:00:00Z"))).toContain("@dataCotacao='10-09-2026'&$format=json");
  });
});

describe("fetchPtax", () => {
  it("takes the day's rate when it is published", async () => {
    const f = byDay({ "10-09-2026": published });
    // Friday 2026-10-09, 18:00 UTC = 15:00 in Brasília.
    expect((await fetchPtax(f as unknown as typeof fetch, new Date("2026-10-09T18:00:00Z")))?.rate).toBe(4_989_200n);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("looks back over a weekend to Friday's rate", async () => {
    const f = byDay({ "10-09-2026": published });
    // Sunday 2026-10-11 (Brasília): Sunday and Saturday are empty, Friday has the rate.
    const fx = await fetchPtax(f as unknown as typeof fetch, new Date("2026-10-11T15:00:00Z"));
    expect(fx?.asOf).toBe("2026-10-09T13:07:30-03:00");
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("uses the Brasília date, not UTC, near midnight", async () => {
    const f = byDay({ "10-09-2026": published });
    // 02:00 UTC on the 10th is still the 9th, 23:00, in Brasília.
    await fetchPtax(f as unknown as typeof fetch, new Date("2026-10-10T02:00:00Z"));
    expect(String(f.mock.calls[0]![0])).toContain("'10-09-2026'");
  });

  it("gives up after a week of empty days", async () => {
    const f = byDay({});
    expect(await fetchPtax(f as unknown as typeof fetch, new Date("2026-10-11T15:00:00Z"))).toBeNull();
    expect(f).toHaveBeenCalledTimes(8);
  });

  it("is null on a network error, an HTTP error or an unexpected body", async () => {
    const now = new Date("2026-10-09T18:00:00Z");
    expect(await fetchPtax(vi.fn(async () => Promise.reject(new Error("offline"))) as unknown as typeof fetch, now)).toBeNull();
    expect(await fetchPtax(vi.fn(async () => json({}, 503)) as unknown as typeof fetch, now)).toBeNull();
    expect(await fetchPtax(vi.fn(async () => json({ nope: 1 })) as unknown as typeof fetch, now)).toBeNull();
  });
});

describe("readFx cache", () => {
  it("reads PTAX once per hour", async () => {
    const f = byDay({ "10-09-2026": published });
    const t0 = new Date("2026-10-09T18:00:00Z");
    await readFx(f as unknown as typeof fetch, t0);
    await readFx(f as unknown as typeof fetch, new Date(t0.getTime() + 30 * 60_000));
    expect(f).toHaveBeenCalledTimes(1);
    await readFx(f as unknown as typeof fetch, new Date(t0.getTime() + 61 * 60_000));
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("/api/fx", () => {
  it("answers 200 with { fx: null } when PTAX fails, and the client stops polling", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = decode<FxResponse>(await res.text());
    expect(body).toEqual({ fx: null });
    expect(noFx(body)).toBe(true);
  });

  it("carries { rate, source, asOf } from PTAX, with the rate still a bigint after transit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json(published)));
    const body = decode<FxResponse>(await (await GET()).text());
    expect(body.fx).toEqual({ rate: 4_989_200n, source: "PTAX/BCB", asOf: "2026-10-09T13:07:30-03:00" });
    expect(typeof body.fx?.rate).toBe("bigint");
    expect(noFx(body)).toBe(false);
  });

  it("serves the labelled mock rate on the mock chain", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_MOCK_CHAIN", "1");
    const body = decode<FxResponse>(await (await GET()).text());
    expect(body.fx?.rate).toBe(5_400_000n);
    expect(body.fx?.source).toBe("mock rate");
  });
});
