import { expect, test, type Page } from "@playwright/test";

/** The spec's language rule, checked on what actually renders. */
const BANNED = /\b(premiums?|insurance|insured|policy|policies|policyholders?|yield vault)\b/i;

async function noBannedWords(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(BANNED);
}

test.describe("smoke: every route renders against a seeded localnet", () => {
  test("/ — story, live strip from the chain, diagram, two-nav swap", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("backed by a reserve anyone can verify");
    const strip = page.getByTestId("live-strip");
    await expect(strip).toContainText("LIVE FROM LOCALNET");
    // Seeded: R$30,000 in, R$1,000 fee (R$800 net), R$2,500 claim paid → R$28,300.
    await expect(strip).toContainText("R$ 28,300.00");
    await expect(page.locator(".react-flow__node")).toHaveCount(9);
    await expect(page.getByRole("heading", { name: "Who does what" })).toBeVisible();
    for (const role of ["Reserve Admin", "Operator", "Investor"]) await expect(page.locator(".role-grid").getByRole("heading", { name: role })).toBeVisible();

    const bar = page.getByTestId("compact-bar");
    await expect(bar).toHaveAttribute("data-visible", "false");
    await expect(bar).toBeHidden();
    await page.mouse.wheel(0, 3000);
    await expect(bar).toHaveAttribute("data-visible", "true");
    await expect(bar.getByRole("link", { name: "See the reserve" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(bar).toHaveAttribute("data-visible", "false");
    await noBannedWords(page);
  });

  test("/reserve — health, coverage, claims timeline, flows, queue, disclosures, accounts", async ({ page }) => {
    await page.goto("/reserve");
    await expect(page.getByRole("heading", { name: "Health" })).toBeVisible();
    await expect(page.getByRole("status", { name: /Coverage status: COVERED/ })).toBeVisible();
    await expect(page.getByText("2 active · Σ remaining cover R$ 19,500.00 = remaining_cover_total")).toBeVisible();
    await expect(page.getByRole("table", { name: "Remaining cover by guarantee" }).locator("tbody tr")).toHaveCount(2);
    await expect(page.getByRole("table", { name: "Per-agency exposure" }).locator("tbody tr")).toHaveCount(2);
    const claims = page.getByRole("table", { name: "Claims timeline" });
    await expect(claims.locator("tbody tr")).toHaveCount(1);
    await expect(claims).toContainText("on time");
    const flows = page.getByRole("table", { name: "Money flows" });
    await expect(flows).toContainText("Guarantee fee");
    await expect(flows).toContainText("Claim payment");
    await expect(flows).toContainText("Deposit");
    await expect(page.getByText("BRS is issued by Nora, and Nora can freeze it")).toBeVisible();
    await expect(page.getByRole("table", { name: "Accounts" })).toContainText("8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9");
    await expect(page.getByRole("button", { name: "Refresh on-chain" })).toBeVisible();
    await expect(page.getByRole("figure", { name: "Coverage against the reserve" })).toBeVisible();
    await expect(page.getByRole("figure", { name: "Claim speed, from on-chain timestamps" })).toBeVisible();
    await expect(page.getByText("The pilot runs on MUTAV's own capital and is not open to public investment")).toBeVisible();
    await noBannedWords(page);
  });

  test("/demo — six steps and a live gate preview", async ({ page }) => {
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Run the demo" })).toBeVisible();
    for (let n = 1; n <= 6; n++) await expect(page.locator(`#step-${n}`)).toBeVisible();

    const step2 = page.locator("#step-2");
    const preview = step2.getByTestId("gate-preview");
    // Free capital is R$8,800: a R$1,500 rent at 3× + 1× (R$6,000 of cover) fits…
    await expect(preview).toContainText("Fits");
    // …and R$3,000 at 3× + 1× (R$12,000) does not.
    await step2.getByLabel("Monthly rent (BRS)").fill("3000");
    await expect(preview).toContainText("Would be refused: InsufficientFreeCapital");
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

  test("/investor — read-only without a wallet, gated on the on-chain allowlist", async ({ page, request }) => {
    await page.goto("/investor");
    await expect(page.getByRole("heading", { name: "Investor", level: 1 })).toBeVisible();
    await expect(page.getByText("NO WALLET CONNECTED · READ-ONLY")).toBeVisible();
    await expect(page.getByRole("button", { name: "request_deposit" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "request_redeem" })).toBeDisabled();
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
    await expect(page.getByRole("table", { name: "Operator duties" }).locator("tbody tr")).toHaveCount(6);
    await expect(page.getByRole("heading", { name: "If the operator key is compromised" })).toBeVisible();
    await noBannedWords(page);
  });

  test("/simulator — static reserve simulator in protocol terms, one full view", async ({ page }) => {
    await page.goto("/simulator");
    await expect(page.getByRole("heading", { name: "Reserve simulator", level: 1 })).toBeVisible();
    await expect(page.getByLabel(/Coverage ratio \(c\)/)).toHaveValue("0,1");
    await expect(page.locator("#glance")).toContainText("Coverage & safety");
    await expect(page.locator("#chart")).toContainText("Stable assets vs coverage required");
    await expect(page.locator("#kstrip")).toContainText("What the reserve earns");
    await expect(page.locator("#kstrip")).toContainText("vs Selic");
    await expect(page.locator("#kstrip")).toContainText("MUTAV take");

    // inputs read like outputs (pt-BR) and accept pasted values with or without separators
    await page.getByRole("tab", { name: "Capital" }).click();
    const start = page.getByLabel(/Starting capital/);
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
