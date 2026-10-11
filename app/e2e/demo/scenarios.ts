/**
 * The storyboarded demo beats (World's Fair demo script, F2–F11), captured
 * one clip per beat with a disposable role wallet injected into the page.
 * TEST-ONLY. Run with `bun run demo:capture` (see README.md in this folder).
 *
 * Beats run in order and build on each other's on-chain state:
 *   00-setup            check the staged state (c × R$100k in, a pending withdrawal, 5 × R$18k cover)
 *   a-reserve-health    /reserve Health, no wallet
 *   b-register-ana      /operator register_guarantee MTV-PF-0006 (fits) → Confirmed, tx link
 *   b2-explorer-ana     Solana Explorer: Ana's Guarantee PDA (the only Explorer shot)
 *   c-refusal           MTV-PF-0007, red preview → Send anyway → InsufficientFreeCapital
 *   d1-file-claim       file_claim R$3,000 on Ana's default leg, notice NTC-PF-0001
 *   d2-pay-claim        pay_claim R$3,000 (within the caps)
 *   d3-refresh-under    /reserve Refresh → under-covered (Edit A clip)
 *   d3b-capital-frozen  /investor: the pre-staged withdrawal waits while redemptions are frozen
 *   d4-settle           settle_payout (PIX hash) → /reserve claims timeline
 *   (off camera)        coverage restore: request_deposit 5,000 → fulfil → claim → refresh
 *   e-reserve-verify    /reserve Health → scroll to "Every account"
 *   agency (stub)       app.mutav.finance agency shot: out of scope for now
 */
import { test, expect, type Browser, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { findGuaranteePda } from "@mutav-finance/mutav-protocol-solana";
import { address } from "@solana/kit";
import { REF } from "../../lib/refs";
import { decode, encode, fromHex } from "../../lib/serde";
import type { TxRequest } from "../../lib/tx-kinds";
import type { ReserveView } from "../../lib/view";
import { Clip } from "./capture";
import { Director, PACE } from "./director";
import { INVESTOR, NAV, OPERATOR, RESERVE } from "./pages";
import { BASE_URL, CLUSTER, DPR, ONLY, rpcUrl } from "./env";
import { installCursor, installTestWallet } from "./inject";
import { b58, TestSigner } from "./signer";
import { walletPath, type DemoRole } from "./wallets";

const BRL = 1_000_000n;
const BINDING = "__mutavDemoSign";
const ANA = { lease: "MTV-PF-0006", agency: "Imobiliária Planalto", rent: "1500", second: "MTV-PF-0007", notice: "NTC-PF-0001", claim: "3000" };
const runDir = () => {
  const d = process.env.DEMO_RUN_DIR;
  if (!d) throw new Error("DEMO_RUN_DIR not set: run through playwright.demo.config.ts");
  return d;
};

// ── Sessions: a browser context per role, the wallet injected ──────────────

type Session = { context: BrowserContext; page: Page; signer: TestSigner | null; role: DemoRole | "none"; d: Director };

async function session(browser: Browser, role: DemoRole | "none"): Promise<Session> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: DPR });
  let signer: TestSigner | null = null;
  if (role !== "none") {
    signer = await TestSigner.fromFile(walletPath(CLUSTER, role), rpcUrl(), CLUSTER);
    const s = signer;
    await context.exposeBinding(BINDING, async (_src, method: string, b64: string) => {
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const out =
        method === "signTransaction" ? await s.signTransaction(bytes) : method === "signAndSendTransaction" ? await s.signAndSendTransaction(bytes) : method === "signMessage" ? await s.signMessage(bytes) : null;
      if (!out) throw new Error(`unknown wallet method ${method}`);
      return Buffer.from(out).toString("base64");
    });
    await context.addInitScript(installTestWallet, { role, address: s.address, publicKey: s.publicKeyBytes, binding: BINDING });
  }
  await context.addInitScript(installCursor);
  const page = await context.newPage();
  return { context, page, signer, role, d: new Director(page) };
}

/** Off camera: connect the injected wallet through the app's own Connect button. */
async function connect(s: Session) {
  if (!s.signer) return;
  await NAV.connect(s.page).click();
  await NAV.walletOption(s.page, /MUTAV demo/).click();
  await expect(NAV.disconnect(s.page)).toBeVisible();
  await s.page.mouse.move(1500, 600);
}

/** Open a route (off camera), connect, wait for the chain read, park the cursor. */
async function open(s: Session, path: string, ready: Locator | ((p: Page) => Locator)) {
  await s.page.goto(path);
  await (typeof ready === "function" ? ready(s.page) : ready).waitFor({ state: "visible", timeout: 60_000 });
  await connect(s);
  await s.page.evaluate(() => window.scrollTo(0, 0));
}

async function record(s: Session, name: string, title: string, body: (d: Director, clip: Clip) => Promise<void>) {
  const clip = new Clip(s.page, runDir(), name, title, s.role, { dpr: DPR, format: (process.env.DEMO_FRAME_FORMAT as "jpeg" | "png") ?? "jpeg", quality: Number(process.env.DEMO_JPEG_QUALITY ?? 92) });
  s.d.clip = clip;
  await clip.start();
  clip.meta.notes.push(
    `cursor overlay: ${await s.page.evaluate(() => {
      const el = document.getElementById("__demo_cursor");
      if (!el) return "missing";
      const cs = getComputedStyle(el);
      return JSON.stringify({ parent: el.parentElement?.tagName, rect: el.getBoundingClientRect().toJSON(), visibility: cs.visibility, display: cs.display, opacity: cs.opacity, z: cs.zIndex, transform: cs.transform });
    })}`,
  );
  await s.d.hold(1, "pre-roll");
  try {
    await body(s.d, clip);
    await s.d.hold(1, "post-roll");
  } finally {
    const meta = await clip.stop();
    writeFileSync(join(runDir(), "clips", `${name}.meta.json`), JSON.stringify(meta));
    s.d.clip = null;
  }
  return clip;
}

const want = (name: string) => !ONLY || ONLY.has(name);

// ── Chain reads and off-camera transactions through the app's own API ─────

async function reserve(): Promise<ReserveView> {
  return decode<ReserveView>(await (await fetch(`${BASE_URL}/api/reserve`, { cache: "no-store" })).text());
}

/** Compose with /api/tx/build, sign with the role wallet, send (relay on localnet, wallet RPC on devnet), confirm. */
async function offCamera(signer: TestSigner, request: TxRequest, via?: "direct" | "squads") {
  const built = await fetch(`${BASE_URL}/api/tx/build`, { method: "POST", body: encode({ request, signer: signer.address, via }) });
  const b = decode<{ tx: string; error?: string }>(await built.text());
  if (!built.ok) throw new Error(`build ${request.kind}: ${b.error ?? built.status}`);
  const wire = Uint8Array.from(Buffer.from(b.tx, "base64"));
  let sig: string;
  if (CLUSTER === "localnet") {
    const signed = Buffer.from(await signer.signTransaction(wire)).toString("base64");
    const res = await fetch(`${BASE_URL}/api/tx/send`, { method: "POST", body: encode({ tx: signed }) });
    const r = decode<{ signature?: string; error?: string }>(await res.text());
    if (!res.ok || !r.signature) throw new Error(`send ${request.kind}: ${r.error}`);
    sig = r.signature;
  } else {
    sig = b58(await signer.signAndSendTransaction(wire));
  }
  for (let i = 0; i < 90; i++) {
    const st = decode<{ status: string; err?: unknown }>(await (await fetch(`${BASE_URL}/api/tx/status?sig=${sig}`)).text());
    if (st.status === "failed") throw new Error(`${request.kind} failed: ${encode(st.err)}`);
    if (st.status === "confirmed" || st.status === "finalized") return sig;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${request.kind} not confirmed in 90 s`);
}

/** The bounding box of `text` inside `container` (a Range over the text node), CSS px. */
async function textBox(container: Locator, text: string) {
  return container.evaluate((root, text) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.textContent?.indexOf(text) ?? -1;
      if (i >= 0) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + text.length);
        const b = r.getBoundingClientRect();
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }
    }
    return null;
  }, text);
}

const brl = (v: bigint) => `R$${(Number(v) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const explorerAccount = (addr: string) =>
  CLUSTER === "devnet" ? `https://explorer.solana.com/address/${addr}?cluster=devnet` : `https://explorer.solana.com/address/${addr}?cluster=custom&customUrl=${encodeURIComponent(rpcUrl())}`;

// ── The beats ──────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.describe("demo capture", () => {
  const state: { anaGuarantee?: string; anaIdHex?: string; registerTx?: string } = {};
  const P = (s: Session) => s.page;

  test("00-setup: the staged pre-recording state", async () => {
    const r = await reserve();
    const c = r.config.coverageRatioBps;
    const s = r.solvency;
    const summary = {
      coverageRatio: c / 10_000,
      stableAssets: brl(s.stableAssets),
      coverageRequired: brl(s.coverageRequired),
      freeCapital: brl(s.freeCapital),
      activeGuarantees: r.state.activeGuarantees,
      maxClaimPerCall: brl(r.config.caps.maxClaimPerCall),
      maxClaimPerPeriod: brl(r.config.caps.maxClaimPerPeriod),
      maxCoverPerGuarantee: brl(r.config.caps.maxCoverPerGuarantee),
      anaNeeds: brl((BigInt(c) * 6_000n * BRL) / 10_000n),
    };
    writeFileSync(join(runDir(), "setup-state.json"), JSON.stringify(summary, null, 2));
    console.log("staged state:", summary);
    if (CLUSTER === "devnet" && r.state.activeGuarantees === 0) {
      throw new Error(
        "devnet is not staged. Off camera, in order: capital wallet request_deposit (c × R$100,000), the Squads 2-of-2 fulfil_deposits " +
          "(Julia + Draau, 5 min lock), capital claim_shares, capital request_redeem (≈ R$1,500 of shares, for the capital beat), then the operator " +
          "registers 5 × R$18,000 (MTV-PF-0001..0005: rent 2,000, 6× + 3×). The stand-in Squads keys cannot sign for the real multisig.",
      );
    }
    // The beats need: Ana's lease fits, a second identical one does not.
    const ana = (BigInt(c) * 6_000n * BRL) / 10_000n;
    expect(s.freeCapital >= ana, `free capital ${brl(s.freeCapital)} must fit Ana's ${brl(ana)}`).toBe(true);
    expect(s.freeCapital < 2n * ana, `free capital ${brl(s.freeCapital)} must refuse a second ${brl(ana)}`).toBe(true);
  });

  test("a-reserve-health: /reserve, no wallet", async ({ browser }) => {
    test.skip(!want("a-reserve-health"));
    const s = await session(browser, "none");
    await open(s, RESERVE.health.path, RESERVE.coverageStatus);
    await record(s, "a-reserve-health", "The reserve, live from Solana: Health", async (d) => {
      await d.scrollTo(RESERVE.health.section(P(s)), "Health");
      await d.result(RESERVE.coverageStatus(P(s)), "coverage status");
      await d.hold(2.5, "free capital", RESERVE.healthCard(P(s), "Free capital"));
      await d.hold(2, "coverage required", RESERVE.healthCard(P(s), "Coverage required"));
    });
    await s.context.close();
  });

  test("b-register-ana: register_guarantee MTV-PF-0006 fits", async ({ browser }) => {
    const s = await session(browser, "operator");
    await open(s, OPERATOR.path, (p) => OPERATOR.tab(p, "register_guarantee"));
    const p = P(s);
    await record(s, "b-register-ana", "Ana's lease goes on-chain", async (d, clip) => {
      await d.scrollTo(OPERATOR.console(p), "console");
      await d.click(OPERATOR.tab(p, "register_guarantee"), "register tab");
      await d.type(OPERATOR.field(p, "Lease reference"), ANA.lease, "lease reference");
      await d.type(OPERATOR.field(p, "Agency"), ANA.agency, "agency");
      await d.type(OPERATOR.field(p, "Monthly rent (BRS)"), ANA.rent, "rent");
      await expect(OPERATOR.preview(p)).toContainText("Fits");
      await d.result(OPERATOR.preview(p), "green preview: fits");
      await d.hold(2.5, "free capital before", OPERATOR.previewRow(p, "Free capital before"));
      await d.click(OPERATOR.button(p, "register_guarantee"), "register_guarantee");
      const status = OPERATOR.status(p, "Confirmed");
      await d.result(status, "Confirmed + tx link");
      const link = status.getByRole("link").first();
      state.registerTx = (await link.getAttribute("href")) ?? undefined;
      clip.meta.links.registerTx = state.registerTx ?? "";
      await d.hold(1.5, "tx link", link);
      await d.result(OPERATOR.moved(p), "moved table");
      await d.hold(3, "required ▲ free ▼ active ▲", OPERATOR.moved(p));
    });
    const id = await REF.guaranteeId(ANA.lease);
    const [pda] = await findGuaranteePda({ config: address((await reserve()).addresses.config), id: fromHex(id) });
    state.anaGuarantee = pda;
    state.anaIdHex = id;
    await s.context.close();
  });

  test("b2-explorer-ana: Ana's Guarantee PDA on Solana Explorer", async ({ browser }) => {
    test.skip(!want("b2-explorer-ana") || !state.anaGuarantee);
    const s = await session(browser, "none");
    const url = explorerAccount(state.anaGuarantee!);
    try {
      await s.page.goto(url, { timeout: 30_000 });
      await s.page.getByText(/Assigned Program|Owner/i).first().waitFor({ timeout: 45_000 });
    } catch (e) {
      writeFileSync(join(runDir(), "clips", "b2-explorer-ana.meta.json"), JSON.stringify({ name: "b2-explorer-ana", title: "Explorer", frames: [], events: [], skipped: `Explorer did not load the account: ${(e as Error).message.split("\n")[0]}` }));
      await s.context.close();
      test.skip(true, "Explorer did not load the account (on localnet Explorer may not reach a local RPC)");
      return;
    }
    await record(s, "b2-explorer-ana", "One PDA per lease: owner MUTAV, an opaque id", async (d, clip) => {
      clip.meta.links.anaGuarantee = url;
      const owner = s.page.getByText(/Assigned Program|Owner/i).first();
      await d.result(owner, "owner: the MUTAV program");
      await d.hold(3, "owner", owner);
    });
    await s.context.close();
  });

  test("c-refusal: the same lease again is refused (InsufficientFreeCapital)", async ({ browser }) => {
    test.skip(!want("c-refusal"));
    const s = await session(browser, "operator");
    await open(s, OPERATOR.path, (p) => OPERATOR.tab(p, "register_guarantee"));
    const p = P(s);
    await record(s, "c-refusal", "The refusal: the coverage gate", async (d, clip) => {
      await d.scrollTo(OPERATOR.console(p), "console");
      await d.type(OPERATOR.field(p, "Lease reference"), ANA.second, "lease reference");
      await d.type(OPERATOR.field(p, "Agency"), ANA.agency, "agency");
      await d.type(OPERATOR.field(p, "Monthly rent (BRS)"), ANA.rent, "rent");
      await expect(OPERATOR.preview(p)).toContainText("Would be refused: InsufficientFreeCapital");
      await d.result(OPERATOR.preview(p), "red preview");
      await d.hold(1.5, "would be refused", OPERATOR.previewRow(p, "Would be refused"));
      await d.hold(1.5, "coverage required after", OPERATOR.previewRow(p, "Coverage required after"));
      await d.hold(1.5, "stable assets", OPERATOR.previewRow(p, "Stable assets"));
      await d.click(OPERATOR.button(p, /Send anyway/), "Send anyway");
      const failed = OPERATOR.status(p, "Failed");
      await d.result(failed, "Failed");
      const err = failed.getByText(/InsufficientFreeCapital/).first();
      await expect(err).toBeVisible();
      await err.scrollIntoViewIfNeeded();
      const box = await textBox(failed, "InsufficientFreeCapital");
      if (box) await d.pointAt(box.x + box.width * 0.5, box.y + box.height + 6, "under the error name");
      clip.event("result", { label: "program error name: InsufficientFreeCapital (place 'Coverage gate · refused' next to it)", selector: "operator console status · text InsufficientFreeCapital", box });
      await clip.still(clip.event("hold", { label: "hold on the error name", box, duration: 3 }));
      await s.page.waitForTimeout(3000 * PACE);
      clip.meta.notes.push(`error text: ${(await err.innerText()).slice(0, 300)}`);
    });
    await s.context.close();
  });

  test("d1-file-claim: Ana's rent goes unpaid", async ({ browser }) => {
    test.skip(!state.anaIdHex, "needs Ana's guarantee from b-register-ana");
    const s = await session(browser, "operator");
    await open(s, OPERATOR.path, (p) => OPERATOR.tab(p, "file_claim"));
    const p = P(s);
    await record(s, "d1-file-claim", "file_claim: a provision before any money moves", async (d) => {
      await d.scrollTo(OPERATOR.console(p), "console");
      await d.click(OPERATOR.tab(p, "file_claim"), "file_claim tab");
      await d.click(OPERATOR.field(p, "Guarantee"), "guarantee");
      await d.click(OPERATOR.guaranteeOption(p, state.anaIdHex!.slice(0, 8)), "Ana's guarantee");
      await d.type(OPERATOR.field(p, "Claim amount (BRS)"), ANA.claim, "amount");
      await d.type(OPERATOR.field(p, "Notice reference"), ANA.notice, "notice");
      await d.click(OPERATOR.button(p, "file_claim"), "file_claim");
      await d.result(OPERATOR.status(p, "Confirmed"), "Confirmed");
      await d.result(OPERATOR.moved(p), "moved: provisions ▲ NAV ▼");
      await d.hold(3, "provisions ▲ NAV ▼", OPERATOR.moved(p));
    });
    await s.context.close();
  });

  test("d2-pay-claim: pay_claim within the caps", async ({ browser }) => {
    test.skip(!state.anaIdHex);
    const s = await session(browser, "operator");
    await open(s, OPERATOR.path, (p) => OPERATOR.tab(p, "pay_claim"));
    const p = P(s);
    await record(s, "d2-pay-claim", "pay_claim: paid from the reserve, within the caps", async (d, clip) => {
      await d.scrollTo(OPERATOR.console(p), "console");
      await d.click(OPERATOR.tab(p, "pay_claim"), "pay_claim tab");
      const pay = OPERATOR.button(p, /^pay_claim/);
      await pay.waitFor();
      await d.hold(2.5, "bound box: per call / per period / liquid BRS", OPERATOR.payBound(p));
      await d.click(pay, "pay_claim");
      // The paid claim leaves the "filed" list, which unmounts its Confirmed status:
      // what stays is the empty list and the bound box with the new liquid BRS.
      await d.result(OPERATOR.noFiledClaim(p), "paid: no filed claim left");
      await d.hold(3, "liquid BRS after the payment", OPERATOR.payBound(p));
      clip.meta.notes.push("pay_claim: the app unmounts the row (and its Confirmed / tx link / moved table) once the claim is paid; the bound box shows the new liquid BRS.");
    });
    await s.context.close();
  });

  test("d3-refresh-under: Refresh shows the reserve under its target (Edit A)", async ({ browser }) => {
    test.skip(!want("d3-refresh-under"));
    const s = await session(browser, "viewer");
    await open(s, RESERVE.health.path, RESERVE.coverageStatus);
    const p = P(s);
    await record(s, "d3-refresh-under", "Refresh: under-covered, and the claim was paid anyway", async (d) => {
      await d.scrollTo(RESERVE.health.section(p), "Health");
      await d.click(RESERVE.refresh(p), "Refresh on-chain");
      await d.result(RESERVE.refreshConfirmed(p), "refresh confirmed");
      await d.result(RESERVE.coverageStatus(p), "coverage status after refresh");
      await d.hold(2.5, "coverage status", RESERVE.coverageStatus(p));
      await d.hold(2.5, "mode badge", RESERVE.modeBadge(p));
    });
    await s.context.close();
  });

  test("d3b-capital-frozen: a pending withdrawal waits while redemptions are frozen", async ({ browser }) => {
    test.skip(!want("d3b-capital-frozen"));
    const s = await session(browser, "capital");
    await open(s, INVESTOR.path, INVESTOR.ready);
    const p = P(s);
    await INVESTOR.entries(p).waitFor({ timeout: 60_000 });
    await record(s, "d3b-capital-frozen", "Capital side: the withdrawal waits, the claim was paid", async (d, clip) => {
      await d.scrollTo(INVESTOR.entries(p), "your queue entries", 260);
      await d.result(INVESTOR.redeemRow(p), "pending redeem row");
      await d.hold(2, "pending withdrawal", INVESTOR.redeemRow(p));
      const stuck = INVESTOR.stuckNote(p);
      if (await stuck.isVisible()) {
        await d.result(stuck, "would not fill now (preview)");
        await d.hold(3, "why it waits", stuck);
        clip.meta.notes.push(`investor page: ${(await stuck.innerText()).slice(0, 400)}`);
      } else {
        clip.meta.notes.push("investor page shows the pending redeem row but no 'would not fill now' note");
      }
    });
    await s.context.close();
  });

  test("d4-settle: settle_payout, then the claims timeline", async ({ browser }) => {
    test.skip(!state.anaIdHex);
    const s = await session(browser, "operator");
    await open(s, OPERATOR.path, (p) => OPERATOR.tab(p, "settle_payout"));
    const p = P(s);
    await record(s, "d4-settle", "settle_payout: the PIX recorded on-chain → claims timeline", async (d) => {
      await d.scrollTo(OPERATOR.console(p), "console");
      await d.click(OPERATOR.tab(p, "settle_payout"), "settle_payout tab");
      await d.hold(1.5, "PIX end-to-end id (only its SHA-256 goes on-chain)", OPERATOR.pixField(p));
      await d.click(OPERATOR.button(p, "settle_payout"), "settle_payout");
      await d.result(OPERATOR.noPaidClaim(p), "settled: no paid claim left");
      await d.goto(RESERVE.claims.path, "cut to the claims timeline");
      await RESERVE.claimsTable(p).waitFor({ timeout: 60_000 });
      await d.scrollTo(RESERVE.claims.section(p), "claims timeline");
      const row = RESERVE.claimsTable(p).locator("tbody tr").last();
      await d.result(row, "filed → paid → settled row");
      await d.hold(3, "timestamps and durations", row);
    });
    await s.context.close();
  });

  test("off-camera: coverage restore (R$5,000 in, fulfil, claim, refresh)", async () => {
    test.skip(!want("e-reserve-verify"));
    if (CLUSTER === "devnet") {
      test.skip(true, "devnet restore: capital request_deposit 5000 → Squads fulfil_deposits (2-of-2, 5 min) → claim_shares → refresh, by hand");
      return;
    }
    const capital = await TestSigner.fromFile(walletPath(CLUSTER, "capital"), rpcUrl(), CLUSTER);
    const admin = await TestSigner.fromFile(walletPath(CLUSTER, "squads1"), rpcUrl(), CLUSTER);
    const pauser = await TestSigner.fromFile(walletPath(CLUSTER, "pauser"), rpcUrl(), CLUSTER);
    const seq = (await reserve()).state.nextDepositSeq;
    await offCamera(capital, { kind: "request_deposit", assets: 5_000n * BRL });
    await offCamera(admin, { kind: "fulfil_deposits", count: 1 }, "direct");
    await offCamera(capital, { kind: "claim_shares", seq });
    await offCamera(pauser, { kind: "refresh" });
    const r = await reserve();
    writeFileSync(join(runDir(), "restore-state.json"), JSON.stringify({ stableAssets: brl(r.solvency.stableAssets), coverageRequired: brl(r.solvency.coverageRequired), freeCapital: brl(r.solvency.freeCapital), mode: r.state.mode }, null, 2));
  });

  test("e-reserve-verify: anyone can verify, no wallet", async ({ browser }) => {
    test.skip(!want("e-reserve-verify"));
    const s = await session(browser, "none");
    await open(s, RESERVE.verify.path, RESERVE.coverageStatus);
    const p = P(s);
    await record(s, "e-reserve-verify", "None of this asks for trust: every account", async (d) => {
      await d.scrollTo(RESERVE.health.section(p), "Health");
      await d.hold(2, "healthy again", RESERVE.coverageStatus(p));
      await d.scrollTo(RESERVE.verify.section(p), "Every account");
      await d.result(RESERVE.accountsTable(p), "accounts table");
      await d.hold(2.5, "an address on Explorer", RESERVE.accountsTable(p).getByRole("link").first());
    });
    await s.context.close();
  });

  test("agency: app.mutav.finance agency shot (stub)", async () => {
    test.skip(true, "out of scope for now: the agency surface lives in mutav-app (app.mutav.finance)");
  });
});
