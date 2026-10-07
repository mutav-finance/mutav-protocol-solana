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
    await expect(page.locator(".react-flow__node")).toHaveCount(8);

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

  test("/admin — VaultConfig and direct signing labelled localnet-only", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "VaultConfig" })).toBeVisible();
    await expect(page.getByText("DIRECT SIGNING · LOCALNET ONLY").first()).toBeVisible();
    await expect(page.getByText("NO SQUADS MULTISIG CONFIGURED")).toBeVisible();
    await expect(page.locator("#config")).toContainText("100.00%");
    await expect(page.getByRole("button", { name: "Sign directly: fulfil_deposits" })).toBeVisible();
    await noBannedWords(page);
  });

  test("API refuses to relay an unsigned or foreign transaction", async ({ request }) => {
    const res = await request.post("/api/tx/send", { data: { tx: "AA==" } });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
