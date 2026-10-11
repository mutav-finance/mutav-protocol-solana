/**
 * Routes and locators for every screen the demo touches, one map per page
 * (TEST-ONLY). Role- and text-based locators only, so a restyle (PR #45:
 * /reserve sub-routes, /investor → /investment, a shared nav) means editing
 * this file, not the scenarios. Every entry names the current (#42) screen.
 */
import type { Locator, Page } from "@playwright/test";

const region = (p: Page, name: string) => p.getByRole("region", { name, exact: true });

/** The site chrome: wallet connect lives in the nav on every app page. */
export const NAV = {
  connect: (p: Page) => p.getByRole("button", { name: "Connect wallet" }),
  walletOption: (p: Page, name: RegExp) => p.getByRole("menu").getByRole("button", { name }),
  disconnect: (p: Page) => p.getByRole("button", { name: "Disconnect" }),
};

/** Public transparency. #45 splits it: /reserve (health), /reserve/coverage, /reserve/claims, /reserve/capital, /reserve/risks, /reserve/verify. */
export const RESERVE = {
  health: { path: "/reserve", section: (p: Page) => region(p, "Health") },
  claims: { path: "/reserve#claims", section: (p: Page) => region(p, "Claims timeline") },
  verify: { path: "/reserve", section: (p: Page) => region(p, "Every account") },
  coverageStatus: (p: Page) => p.getByRole("status", { name: /Coverage status/ }),
  refresh: (p: Page) => region(p, "Health").getByRole("button", { name: "Refresh on-chain" }),
  refreshConfirmed: (p: Page) => region(p, "Health").getByRole("status").filter({ hasText: "Confirmed" }),
  healthCard: (p: Page, label: "Free capital" | "Coverage required" | "Stable assets") => region(p, "Health").getByText(label, { exact: true }).first(),
  modeBadge: (p: Page) => p.getByRole("status", { name: /^Mode:/ }),
  claimsTable: (p: Page) => p.getByRole("table", { name: "Claims timeline" }),
  accountsTable: (p: Page) => p.getByRole("table", { name: "Accounts" }),
};

/** Operator console: one tab per instruction. */
export const OPERATOR = {
  path: "/operator",
  console: (p: Page) => region(p, "Console"),
  tab: (p: Page, name: "register_guarantee" | "file_claim" | "pay_claim" | "settle_payout") => region(p, "Console").getByRole("tab", { name }),
  field: (p: Page, label: string) => region(p, "Console").getByLabel(label, { exact: true }).filter({ visible: true }).first(),
  preview: (p: Page) => region(p, "Console").getByTestId("gate-preview"),
  previewRow: (p: Page, text: string) => region(p, "Console").getByTestId("gate-preview").getByText(text),
  button: (p: Page, name: string | RegExp) => region(p, "Console").getByRole("button", { name }).first(),
  status: (p: Page, text: "Confirmed" | "Failed") => region(p, "Console").getByRole("status").filter({ hasText: text }),
  moved: (p: Page) => region(p, "Console").getByRole("table", { name: "How the reserve numbers moved" }),
  /** The guarantee picker (a select); options read "<id hex 8>… · default left …". */
  guaranteeOption: (p: Page, idHexPrefix: string) => p.getByRole("option", { name: new RegExp(`^${idHexPrefix}`) }),
  /** pay_claim / settle_payout rows unmount once sent; these are what stays on screen. */
  payBound: (p: Page) => region(p, "Console").getByText("Bound before you sign").filter({ visible: true }).first().locator(".."),
  noFiledClaim: (p: Page) => region(p, "Console").getByText(/No filed claim waiting for payment/).filter({ visible: true }).first(),
  noPaidClaim: (p: Page) => region(p, "Console").getByText(/No paid claim waiting for settlement/).filter({ visible: true }).first(),
  pixField: (p: Page) => region(p, "Console").getByLabel("PIX end-to-end id").first(),
};

/** The capital provider. #45 renames it /investment (swap-style deposit / redeem card, USD display rate TBD). */
export const INVESTOR = {
  path: "/investor",
  ready: (p: Page) => p.getByRole("heading", { name: "Investor", level: 1 }),
  entries: (p: Page) => p.getByRole("table", { name: "Your queue entries" }),
  redeemRow: (p: Page) => p.getByRole("table", { name: "Your queue entries" }).getByRole("row").filter({ hasText: "redeem" }).first(),
  /** "Your redeem seq N heads the queue and would not fill now (PREVIEW): …" */
  stuckNote: (p: Page) => p.getByText(/heads the queue and would not fill now/).first(),
};

export type Loc = Locator;
