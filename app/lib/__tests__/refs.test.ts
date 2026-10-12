import { describe, expect, it } from "vitest";
import { nextRef } from "../refs";

describe("nextRef", () => {
  it("increments the trailing number, keeping its width", () => {
    expect(nextRef("MTV-PF-0009", 1)).toBe("MTV-PF-0010");
    expect(nextRef("lease-demo-099", 1)).toBe("lease-demo-100");
    expect(nextRef("lease-demo-999", 1)).toBe("lease-demo-1000");
  });
  it("falls back to the demo label for entry n", () => {
    expect(nextRef("Ana Souza", 12)).toBe("lease-demo-012");
  });
});
