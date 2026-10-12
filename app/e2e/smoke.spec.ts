import { expect, test, type Page } from "@playwright/test";

/** The spec's language rule, checked on what actually renders. */
const BANNED = /\b(premiums?|(re)?insur(ance|ed|ers?)|polic(y|ies)|policyholders?|yield vault|sinistros?|fund|coverage[ -]gat(e|ed|es|ing))\b/i;

async function noBannedWords(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(BANNED);
}

test.describe("smoke: every route renders against a seeded localnet", () => {
  // /reserve opens "How to read this page" on a first visit; the smoke reads past it (one test covers it).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mutav-transparency-intro-v1", "1"));
  });

  test("/ — story, live strip from the chain, diagram, shared nav", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Not open to public investment.");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("backed by a reserve anyone can verify");
    const strip = page.getByTestId("live-strip");
    await expect(strip).toContainText("LIVE FROM LOCALNET");
    // Seeded: R$30,000 in, R$1,000 fee (R$800 net), R$1,200 issuer income swept
    // (ADR 0017), R$2,500 claim paid → R$29,500.
    await expect(strip).toContainText("R$ 29,500.00");
    await expect(page.locator(".react-flow__node")).toHaveCount(9);
    await expect(page.getByRole("heading", { name: "Who does what" })).toBeVisible();
    for (const role of ["Reserve Admin", "Operator", "Investor"]) await expect(page.locator(".role-grid").getByRole("heading", { name: role })).toBeVisible();

    // The landing uses the same sticky app nav as every other page.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Transparency" })).toBeVisible();
    await page.mouse.wheel(0, 3000);
    await expect(nav).toBeInViewport();
    await noBannedWords(page);
  });

  test("/reserve — overview: hero, where the capital sits, promises, persistent tabs", async ({ page }) => {
    await page.goto("/reserve");
    const views = page.getByRole("navigation", { name: "Transparency views" });
    for (const tab of ["Overview", "Coverage", "Claims", "Money", "Risks", "Verify"]) await expect(views.getByRole("link", { name: tab })).toBeVisible();
    await expect(views.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("status", { name: /Coverage status: COVERED/ })).toBeVisible();
    await expect(page.getByText("R$ 28,300.00").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where the capital sits" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(page.getByText("Claim payments are never blocked by required coverage.")).toBeVisible();
    // The legal floor (founder decision, 2026-10-11): the demo banner on every page.
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Not open to public investment.");
    await noBannedWords(page);
  });

  test("/reserve — first visit opens How to read this page", async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem("mutav-transparency-intro-v1"));
    await page.goto("/reserve");
    const intro = page.getByRole("dialog", { name: /Every number on this page is read from Solana/ });
    await expect(intro).toBeVisible();
    await intro.getByRole("button", { name: "Skip" }).click();
    await expect(intro).toHaveCount(0);
    await page.getByRole("button", { name: "How to read this page" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("/reserve tabs — coverage, claims, capital, risks, verify", async ({ page }) => {
    await page.goto("/reserve/coverage");
    await expect(page.getByText("3 active guarantees")).toBeVisible();
    await expect(page.getByRole("table", { name: "Remaining cover by guarantee" }).locator("tbody tr")).toHaveCount(3);
    await expect(page.getByRole("table", { name: "Per-agency exposure" }).locator("tbody tr")).toHaveCount(3);
    await noBannedWords(page);

    await page.goto("/reserve/claims");
    const claims = page.getByRole("table", { name: "Claims timeline" });
    await expect(claims.locator("tbody tr")).toHaveCount(1);
    await expect(claims).toContainText("default");
    await expect(page.getByText("Claim payments are never blocked by required coverage or by a pause.")).toBeVisible();
    await noBannedWords(page);

    await page.goto("/reserve/capital");
    const flows = page.getByRole("table", { name: "Money flows" });
    await expect(flows).toContainText("Guarantee fee");
    await expect(flows).toContainText("Claim payment");
    await expect(flows).toContainText("Deposit");
    await expect(page.getByRole("heading", { name: "Capital queue" })).toBeVisible();
    await noBannedWords(page);

    await page.goto("/reserve/risks");
    await expect(page.getByRole("heading", { name: "Claim payment caps" })).toBeVisible();
    await expect(page.getByRole("status", { name: "Reserve token account freeze status" })).toContainText("NOT FROZEN");
    await expect(page.getByText("A freeze stops every outflow, claim payments included.")).toBeVisible();
    await expect(page.getByText("Not open to public investment.", { exact: true })).toBeVisible();
    await expect(page.getByText("nothing here is an offer", { exact: false }).first()).toBeVisible();
    await noBannedWords(page);

    await page.goto("/reserve/verify");
    await expect(page.getByText("8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9")).toBeVisible();
    await noBannedWords(page);

    // The v1 routes still land on their v2 tab.
    for (const [from, to] of [["flows", "capital"], ["queue", "capital"], ["disclosures", "risks"], ["accounts", "verify"]]) {
      await page.goto(`/reserve/${from}`);
      await expect(page).toHaveURL(new RegExp(`/reserve/${to}$`));
    }
  });

  test("/demo — six steps and a live gate preview", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Run the demo" })).toBeVisible();
    for (let n = 1; n <= 6; n++) await expect(page.locator(`#step-${n}`)).toBeVisible();

    const step2 = page.locator("#step-2");
    const preview = step2.getByTestId("gate-preview");
    // At c = 0.10 (ADR 0016) free capital is R$27,550: a R$1,500 rent at 3× + 1×
    // (R$6,000 of cover) fits, and so does R$3,000 (R$12,000)…
    await expect(preview).toContainText("Fits");
    await step2.getByLabel("Monthly rent (BRS)").fill("3000");
    await expect(preview).toContainText("Fits");
    // …while R$12,000 (R$48,000 of cover) is above max_cover_per_guarantee (R$40,000).
    await step2.getByLabel("Monthly rent (BRS)").fill("12000");
    await expect(preview).toContainText("Would be refused: GuaranteeCapExceeded");
    await expect(step2.getByRole("button", { name: /Send anyway/ })).toBeVisible();
    await expect(page.getByText("NO WALLET CONNECTED")).toBeVisible();
    await noBannedWords(page);
  });

  test("/admin — General controls, Money in & out, Allocation; direct signing labelled localnet-only", async ({ page }) => {
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav.getByRole("link")).toHaveText(["01 General controls", "02 Money in & out", "03 Allocation"]);
    for (const [id, heading] of [["general", "General controls"], ["money", "Money in & out"], ["allocation", "Allocation: BRS today, more assets through adapters"]]) {
      await expect(page.locator(`#${id}`).getByRole("heading", { name: heading, level: 2 })).toBeVisible();
    }
    await expect(page.locator("#reserve-assets")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Emergency" })).toContainText("NOT PAUSED");
    await expect(page.getByText("DIRECT SIGNING · LOCALNET ONLY").first()).toBeVisible();
    await expect(page.getByText("NO SQUADS MULTISIG CONFIGURED")).toBeVisible();
    await expect(page.locator("#general-coverage")).toContainText("10.00%");
    await expect(page.locator("#money").getByRole("button", { name: "Sign directly: fulfil_deposits" })).toBeVisible();
    await expect(page.locator("#allocation-composition")).toContainText("100% BRS (pilot)");
    await expect(page.locator("#allocation-composition")).toContainText("Min in BRS (settlement token): 100%");
    await expect(page.locator("#allocation-expand").getByRole("table", { name: "Planned reserve-allocation instructions" }).locator("tbody tr")).toHaveCount(4);
    await expect(page.locator("#allocation-expand").getByRole("table", { name: "Adapter candidates" })).toContainText("TESOURO");
    await noBannedWords(page);
  });

  test("/capital — not open to public investment; demo form visible, actions gated without a wallet", async ({ page, request }) => {
    for (const old of ["/investment", "/dashboard", "/investor"]) {
      await page.goto(old);
      await expect(page).toHaveURL(/\/capital$/);
    }
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Not open to public investment.");
    await expect(page.getByRole("heading", { name: "Capital queue", level: 1 })).toBeVisible();
    await expect(page.getByRole("note", { name: "Not open to public investment" })).toContainText(
      "Pilot capital comes from MUTAV's own wallet only. This page is not open to public investment and nothing here is an offer.",
    );
    await expect(page.getByRole("group", { name: "Reserve figures" })).toContainText("Share price");
    // Demo (CAPITAL_FORMS_PUBLIC): every visitor sees the form, both tabs and the limits;
    // without a wallet the submit is disabled, with the reason.
    const card = page.getByRole("region", { name: "Deposit request" });
    await expect(card).toContainText("Capital requests are limited to allowlisted wallets during the pilot. This is not an offer.");
    await expect(card).toContainText("per request");
    await expect(page.getByLabel("You deposit")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request deposit" })).toBeDisabled();
    await page.getByRole("tab", { name: "Redeem" }).click();
    await expect(page.getByLabel("You redeem")).toBeVisible();
    await expect(page.getByRole("button", { name: "Request redemption" })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Your requests" })).toBeVisible();
    const seeded = await (await request.get("/api/reserve")).json();
    const capital = (await (await request.get(`/api/investor?owner=${seeded.config.mutavCapitalWallet}`)).json()).allowlist.state;
    const operator = (await (await request.get(`/api/investor?owner=${seeded.config.operator}`)).json()).allowlist.state;
    expect([capital, operator]).toEqual(["allowlisted", "not-listed"]);
    await noBannedWords(page);
  });

  test("/operator — read-only without the operator wallet, with limits and duties", async ({ page }) => {
    await page.goto("/operator");
    await expect(page.getByRole("heading", { name: "Operator", level: 1 })).toBeVisible();
    await expect(page.getByText("READ-ONLY · NO WALLET CONNECTED")).toBeVisible();
    await expect(page.getByRole("figure", { name: "Claim-payment caps" })).toContainText("R$ 2,500 / R$ 20,000");
    await expect(page.locator("#console").getByRole("button", { name: "register_guarantee" })).toBeDisabled();
    // register, close, contribute_fees, sweep_income (ADR 0017), file, pay, settle.
    await expect(page.getByRole("table", { name: "Operator duties" }).locator("tbody tr")).toHaveCount(7);
    await expect(page.getByRole("heading", { name: "If the operator key is compromised" })).toBeVisible();
    await noBannedWords(page);
  });

  test("/simulator — static reserve simulator in protocol terms, one full view", async ({ page }) => {
    await page.goto("/simulator");
    await expect(page.locator(".demo-banner").and(page.getByRole("note", { name: "Pilot demo" }))).toContainText("Not open to public investment.");
    await expect(page.getByRole("heading", { name: "Reserve simulator", level: 1 })).toBeVisible();
    await expect(page.getByLabel(/Coverage ratio \(c\)/)).toHaveValue("0,25");
    await expect(page.locator("#glance")).toContainText("Coverage & safety");
    await expect(page.locator("#chart")).toContainText("Stable assets vs coverage required");
    await expect(page.locator("#kstrip")).toContainText("What the reserve earns");
    await expect(page.locator("#kstrip")).toContainText("vs Selic");
    await expect(page.locator("#kstrip")).toContainText("MUTAV take");

    // inputs read like outputs (pt-BR) and accept pasted values with or without separators
    await page.getByRole("tab", { name: "Capital" }).click();
    const start = page.getByRole("textbox", { name: /Starting capital/ });
    await expect(start).toHaveValue("300.000");
    await start.fill("250000");
    await start.blur();
    await expect(start).toHaveValue("250.000");
    await expect(page.locator("#scenSel")).toHaveValue("custom");

    // Export menu: keyboard operable, closes on Escape
    await page.getByRole("button", { name: "Export" }).click();
    await expect(page.getByRole("menuitem", { name: /Copy summary/ })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menuitem", { name: /Copy summary/ })).toBeHidden();
    await page.getByRole("button", { name: "Reset" }).click();
    await noBannedWords(page);

    await expect(page.getByRole("button", { name: "Advanced" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Compare c & sizing" }).click();
    await expect(page.locator("#ruleTbl tbody tr")).toHaveCount(3);
    await page.getByRole("tab", { name: "Reserve yield" }).click();
    await expect(page.locator("#ychart svg")).toBeVisible();
    await page.getByRole("tab", { name: "What MUTAV earns" }).click();
    await expect(page.locator("#takeKpis")).toContainText("take total");
    await noBannedWords(page);
    await page.getByRole("tab", { name: "Method" }).click();
    await expect(page.locator("#pane-method")).toContainText("coverage_required");
    await noBannedWords(page);
  });

  test("API refuses to relay an unsigned or foreign transaction", async ({ request }) => {
    const res = await request.post("/api/tx/send", { data: { tx: "AA==" } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
