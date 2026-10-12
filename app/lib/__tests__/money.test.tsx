import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FxProvider, Money, UsdHint, UsdSource } from "@/components/MoneyProvider";
import type { FxView } from "@/lib/server/fx";

const fx: FxView = { rate: 5_400_000n, source: "PTAX/BCB", asOf: "2026-10-09T13:07:30-03:00" };
const text = (html: string) => html.replace(/<[^>]+>/g, "");

describe("<Money>", () => {
  it("shows BRS only, with no hint and no source line, without a rate", () => {
    const html = renderToStaticMarkup(
      <>
        <Money brs={58_700_000_000n} />
        <UsdSource />
      </>,
    );
    expect(html).toBe("R$ 58,700.00");
  });

  it("keeps BRS as the figure and adds a muted ≈ US$ hint with a rate", () => {
    const html = renderToStaticMarkup(
      <FxProvider value={fx}>
        <Money brs={58_700_000_000n} />
      </FxProvider>,
    );
    expect(html.startsWith("R$ 58,700.00<span")).toBe(true);
    expect(html).toContain('data-testid="usd-hint"');
    expect(html).toContain("text-(--color-text-2)");
    expect(html).toContain("text-2xs");
    expect(text(html)).toBe("R$ 58,700.00≈ US$ 10,870.37");
  });

  it("puts the hint on its own line with `block`, and signs both", () => {
    const html = renderToStaticMarkup(
      <FxProvider value={fx}>
        <Money brs={5_400_000n} sign="−" block />
      </FxProvider>,
    );
    expect(html).toContain("block");
    expect(text(html)).toBe("−R$ 5.40≈ −US$ 1.00");
  });

  it("renders no hint for a rate that is not a usable number", () => {
    const bad = { ...fx, rate: 0n };
    expect(renderToStaticMarkup(<FxProvider value={bad}><UsdHint brs={1n} /><UsdSource /></FxProvider>)).toBe("");
  });

  it("writes one source line with a rate", () => {
    expect(text(renderToStaticMarkup(<FxProvider value={fx}><UsdSource /></FxProvider>))).toBe(
      "US$ at PTAX (Banco Central do Brasil), 09/10/2026. Display only; the reserve holds BRS.",
    );
  });
});
