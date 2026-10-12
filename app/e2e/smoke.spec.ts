import { expect, test, type Page } from "@playwright/test";

/** The spec's language rule, checked on what actually renders. */
const BANNED = /\b(premiums?|(re)?insur(ance|ed|ers?)|polic(y|ies)|policyholders?|yield vault|sinistros?|fund|solvency[ -]gat(e|ed|es|ing))\b/i;

async function noBannedWords(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(BANNED);
}

test.describe("smoke: every route renders against a seeded localnet", () => {
  // /reserve opens "How to read this page" on a first visit; the smoke reads past it (one test covers it).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("mutav-transparency-intro-v1", "1"));
  });

  test("/ redirects to /reserve (no app landing), banner and shared nav", async ({ page }) => {
    const res = await page.request.get("/", { maxRedirects: 0 });
    expect([307, 308]).toContain(res.status());
    expect(res.headers()["location"]).toMatch(/\/reserve$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/reserve$/);
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Not open to public investment.");
    // The smoke runs on localnet, where the banner says it is a local simulation.
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Local simulation");
    // Transparency is the active tab; the logo opens /reserve; no link points home.
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav.getByRole("link", { name: "Transparency" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("link", { name: "MUTAV", exact: true })).toHaveAttribute("href", "/reserve");
    await expect(page.locator('a[href="/"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Footer" }).getByRole("link", { name: /mutav\.finance/ })).toHaveAttribute("href", "https://www.mutav.finance");
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
    // The hero splits the figure across spans (smaller decimals, US$ hint), so match the text content.
    await expect(page.locator("main")).toContainText("Reserve balance?R$ 29,500.00");
    await expect(page.getByRole("heading", { name: "Where the capital sits" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent activity" })).toBeVisible();
    await expect(page.getByText("Claim payments are never blocked by required coverage.")).toBeVisible();
    // The coverage ceiling: what the reserve can carry, what is in use, the headroom.
    await expect(page.getByRole("group", { name: "Coverage ceiling" })).toContainText("can back up to");
    await expect(page.getByRole("group", { name: "Coverage ceiling" })).toContainText("% of capacity)");
    // The legal floor (founder decision, 2026-10-11): the demo banner on every page.
    await expect(page.getByRole("note", { name: "Pilot demo" })).toContainText("Not open to public investment.");
    await noBannedWords(page);
  });

  test("/reserve and /capital render from the cheap reads while the ledger's history is throttled", async ({ page }) => {
    // The public devnet RPC throttles the heavy history read: /api/history and /api/ledger answer 503 busy.
    await page.route(/\/api\/(history|ledger)(\?|$)/, (route) =>
      route.fulfill({ status: 503, headers: { "content-type": "application/json", "retry-after": "10" }, body: JSON.stringify({ error: "Chain busy: the RPC is rate limiting, retrying shortly", busy: true, retryAfter: 10 }) }),
    );
    await page.goto("/reserve");
    await expect(page.locator("main")).toContainText("Reserve balance?R$ 29,500.00");
    await expect(page.getByRole("status", { name: /Coverage status: COVERED/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where the capital sits" })).toBeVisible();
    // Only the history panel waits, inside the side column.
    await expect(page.locator("aside").getByText("Chain busy, retrying…")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent activity" })).toHaveCount(0);

    await page.goto("/reserve/coverage");
    await expect(page.getByText("3 active guarantees")).toBeVisible();
    await expect(page.getByText("Totals · cover against the reserve")).toBeVisible();
    await expect(page.getByText("Coverage required (higher of the two)")).toBeVisible();

    await page.goto("/reserve/capital");
    await expect(page.getByRole("heading", { name: "Capital queue" })).toBeVisible();
    await expect(page.getByText("Chain busy, retrying…")).toBeVisible();

    await page.goto("/capital");
    await expect(page.getByRole("group", { name: "Reserve figures" })).toContainText("R$ 29,500.00");
    await expect(page.getByRole("heading", { name: "Your requests" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "How the ceiling works" })).toBeVisible();
    // The hero leads with capacity left up to the ceiling, in %; the bar shows cover in use against it.
    await expect(page.locator("main")).toContainText("Capacity left");
    await expect(page.locator("main")).toContainText("ceiling free for new leases.");
    await expect(page.getByRole("img", { name: /^Remaining cover .* ceiling; capacity left/ })).toBeVisible();
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
    await expect(page.getByRole("table", { name: "Admin caps" }).locator("tbody tr")).toHaveCount(3);
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
    await expect(page.locator("#general-coverage")).toContainText("10%");
    await expect(page.locator("#money").getByRole("button", { name: "Sign directly: Fill deposits fulfil_deposits" })).toBeVisible();
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

  test("/operator — read-only without the operator wallet, with live figures, the gate preview, limits and duties", async ({ page }) => {
    // The guided demo folded into the operator console.
    await page.goto("/demo");
    await expect(page).toHaveURL(/\/operator$/);
    await expect(page.getByRole("heading", { name: "Operator", level: 1 })).toBeVisible();
    await expect(page.getByText("READ-ONLY · NO WALLET CONNECTED")).toBeVisible();
    const stats = page.getByTestId("reserve-stats");
    for (const label of ["Reserve balance", "Coverage required", "Free capital", "Set aside for claims", "Share price"]) await expect(stats).toContainText(label);
    await expect(stats).toContainText("R$ 29,500.00");
    await expect(stats).toContainText("MODE · NORMAL");
    await expect(page.getByRole("button", { name: "Refresh on-chain" })).toBeVisible();

    // The recording script's prefill: MTV-PF-0100 at Imobiliária Planalto, R$1,500 rent, 6× + 6× (R$18,000 of cover) fits…
    const console_ = page.locator("#console");
    await expect(console_.getByLabel("Lease reference")).toHaveValue("MTV-PF-0100");
    await expect(console_.getByLabel("Agency")).toHaveValue("Imobiliária Planalto");
    const preview = console_.getByTestId("gate-preview");
    await expect(preview).toContainText("Fits");
    // …while R$12,000 (R$144,000 of cover) is above max_cover_per_guarantee (R$40,000).
    await console_.getByLabel("Monthly rent (BRS)").fill("12000");
    await expect(preview).toContainText("Would be refused: R$ 144,000.00 of cover is above the R$ 40,000.00 per-guarantee cap");
    await expect(console_.getByRole("button", { name: /Send anyway/ })).toBeDisabled();
    // Console tabs read as sentence-case names over the instruction; the read-only CTA is the outline variant.
    await expect(console_.getByRole("tab", { name: /Register guarantee\s*register_guarantee/ })).toBeVisible();
    await console_.getByLabel("Monthly rent (BRS)").fill("1500");
    await expect(console_.getByRole("button", { name: /Register guarantee/ })).toHaveAttribute("data-variant", "outline");
    // F7: the claim form prefills the first notice reference and the most recent guarantee.
    await console_.getByRole("tab", { name: /File claim/ }).click();
    await expect(console_.getByLabel("Notice reference")).toHaveValue("NTC-PF-0001");
    await expect(console_.getByRole("combobox", { name: "Guarantee" })).toContainText("left");
    await expect(page.getByRole("figure", { name: "Claim-payment caps" })).toContainText("R$ 2,500 / R$ 20,000");
    // register, close, contribute_fees, sweep_income (ADR 0017), file, pay, settle.
    await expect(page.getByRole("table", { name: "Operator duties" }).locator("tbody tr")).toHaveCount(7);
    await expect(page.getByRole("heading", { name: "If the operator key is compromised" })).toBeVisible();
    await noBannedWords(page);
  });

  test("/simulator — static reserve simulator in protocol terms, one full view", async ({ page }) => {
    await page.goto("/simulator");
    await expect(page.locator(".demo-banner").and(page.getByRole("note", { name: "Pilot demo" }))).toContainText("Not open to public investment.");
    await expect(page.getByRole("heading", { name: "Reserve simulator", level: 1 })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /Coverage ratio \(c\)/ })).toHaveValue("0,25");
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
