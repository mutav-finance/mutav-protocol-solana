import { describe, expect, it } from "vitest";
import { decode, encode, fromHex, bytesToHex } from "../serde";

describe("serde", () => {
  it("round-trips bigints beyond 2^53 and byte arrays", () => {
    const v = { a: (1n << 64n) - 1n, b: [1n, -5n], h: new Uint8Array([0, 255, 16]), s: "x", n: 3 };
    const out = decode<typeof v>(encode(v));
    expect(out.a).toBe((1n << 64n) - 1n);
    expect(out.b).toEqual([1n, -5n]);
    expect(Array.from(out.h)).toEqual([0, 255, 16]);
    expect(out.s).toBe("x");
    expect(out.n).toBe(3);
  });
  it("leaves ordinary objects with a $big key among others alone", () => {
    expect(decode<{ x: { $big: string; y: number } }>('{"x":{"$big":"1","y":2}}').x).toEqual({ $big: "1", y: 2 });
  });
  it("hex helpers", () => {
    expect(bytesToHex(new Uint8Array([1, 171]))).toBe("01ab");
    expect(Array.from(fromHex("0x01ab"))).toEqual([1, 171]);
    expect(() => fromHex("abc")).toThrow();
  });
});
