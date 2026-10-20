// Generates index.html for MUTAV demo Chapter 3 ("Capital efficiency") from the simulation ledger.
// Reads ../ch3-ledger.json if present, else ../ch3-ledger.placeholder.json (marked PLACEHOLDER).
// Run from the project root: node tools/build.mjs   (or: node tools/build.mjs path/to/ledger.json [--finale=sharepath])
// Kit config: ../kit.config.json  { finale: "inout" | "sharepath", scaleLine }. --finale=… overrides it.
// Every number on screen comes from the ledger file; this script only lays it out and times it.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url).pathname;
const args = process.argv.slice(2);
const KIT = existsSync(here("../kit.config.json")) ? JSON.parse(readFileSync(here("../kit.config.json"), "utf8")) : {};
const FINALE = (args.find((a) => a.startsWith("--finale="))?.split("=")[1] || KIT.finale || "inout").toLowerCase();
if (!["inout", "sharepath"].includes(FINALE)) throw new Error(`finale must be "inout" or "sharepath", got ${FINALE}`);
const SRC = args.find((a) => !a.startsWith("--")) || (existsSync(here("../../ch3-ledger.json")) ? here("../../ch3-ledger.json") : here("../../ch3-ledger.placeholder.json"));
const L = JSON.parse(readFileSync(SRC, "utf8"));
const meta = L.meta || {};
const notes = [].concat(meta.notes || []).join(" ");
const PLACEHOLDER = !!meta.placeholder || /placeholder/i.test(SRC);
const warn = [];

const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => (x == null || x === "" ? 0 : +x);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (v, dp = 2) => {
  const a = Math.abs(v).toFixed(dp).split(".");
  return "R$" + a[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (dp ? "." + a[1] : "");
};
const signed = (v, dp = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + money(v, dp);
// Scale formatting: R$k under a million (rounded), R$M with two decimals over it (rounded half-up,
// one trailing zero dropped: 3,997,969 -> "R$4.0M", 3,824,260 -> "R$3.82M").
const moneyScale = (v) => {
  const a = Math.abs(v);
  if (a >= 1e6) return "R$" + (a / 1e6).toFixed(2).replace(/0$/, "") + "M";
  if (a >= 1e3) return "R$" + Math.round(a / 1e3) + "k";
  return "R$" + Math.round(a);
};

// ---------------------------------------------------------------- Ledger normalisation
const ops = [...L.ops];
const monthsN = [...new Set(ops.map((o) => +o.month))].sort((a, b) => a - b);
const months = monthsN.map((m) => {
  const s0 = (L.months || []).find((x) => +x.month === m) || {};
  const s = { ...s0 };
  for (const k of ["fees_net", "issuer_income", "claims_paid", "take_to_treasury"]) if (s[k] == null && s0[k + "_brs"] != null) s[k] = s0[k + "_brs"];
  const mo = ops.filter((o) => +o.month === m);
  const sum = (t) => r2(mo.filter((o) => o.type === t).reduce((a, o) => a + num(o.amount_brs), 0));
  const fromOps = { fees_net: sum("fee"), issuer_income: sum("issuer_income"), claims_paid: -sum("claim_paid") };
  for (const k of Object.keys(fromOps)) {
    if (s[k] != null && Math.abs(num(s[k]) - fromOps[k]) > 0.05) warn.push(`M${m} ${k}: months[] ${s[k]} vs ops ${fromOps[k]} (chart uses months[])`);
  }
  return {
    month: m, yyyymm: s.yyyymm ?? s.period ?? mo[0]?.yyyymm ?? mo[0]?.period ?? "",
    fees_net: num(s.fees_net ?? fromOps.fees_net), issuer_income: num(s.issuer_income ?? fromOps.issuer_income),
    claims_paid: Math.abs(num(s.claims_paid ?? fromOps.claims_paid)), take_to_treasury: num(s.take_to_treasury),
    reserve_start: s.reserve_start, reserve_end: s.reserve_end, nav_start: s.nav_start, nav_end: s.nav_end,
  };
});

// NAV kind: plot one consistent kind. Prefer published; fall back to conversion with a note.
const kindOf = (o) => {
  const k = String(o.nav_kind ?? o.nav_source ?? o.nav_type ?? o.nav_after_kind ?? meta.nav_kind ?? "published").toLowerCase();
  return k.includes("conv") ? "conversion" : "published";
};
const navAs = (o, kind) => {
  const explicit = kind === "published" ? o.nav_published_after ?? o.published_nav_after : o.nav_conversion_after ?? o.conversion_nav_after;
  if (explicit != null) return +explicit;
  return o.nav_after != null && kindOf(o) === kind ? +o.nav_after : null;
};
let NAVKIND = "published";
let navNote = "";
if (ops.some((o) => navAs(o, "published") == null)) {
  if (ops.every((o) => navAs(o, "conversion") != null)) { NAVKIND = "conversion"; navNote = "conversion unit value: published value not in ledger"; }
  else navNote = "published unit value, held between published updates";
}
let lastNav = navAs(ops.find((o) => navAs(o, NAVKIND) != null) || {}, NAVKIND) ?? num(months[0].nav_start) ?? 1;
const navStart = months[0].nav_start != null && NAVKIND === "published" ? +months[0].nav_start : lastNav;
for (const o of ops) { const v = navAs(o, NAVKIND); if (v != null) lastNav = v; o._nav = lastNav; }
const navEnd = ops.at(-1)._nav;

// Treasury take: a footnote, never a reserve segment.
const takeOps = ops.filter((o) => o.type === "take_to_treasury");
const takeTotal = r2(months.reduce((a, m) => a + m.take_to_treasury, 0) || takeOps.reduce((a, o) => a + Math.abs(num(o.treasury_amount_brs ?? o.treasury_brs ?? o.amount_brs)), 0));

// ---------------------------------------------------------------- Ledger rows (refresh is bookkeeping: not a row)
const role = (o) => String(o.role || "").toLowerCase();
const isTranche = (o) => o.type === "deposit" && role(o).includes("tranche");
const capInLabel = (o) =>
  isTranche(o) ? "pilot tranche"
  : role(o).includes("capital provider") ? "capital provider"
  : role(o).includes("refill") ? "refill to max_tvl"
  : role(o).includes("start capital") ? "MUTAV start capital"
  : owner(o);
const LABEL = {
  fee: (o) => `Guarantee fee · ${o.agency || o.ref}`,
  issuer_income: () => "Reserve yield · BRS issuer revenue",
  claim_filed: (o) => `Claim filed · ${o.ref}`,
  claim_paid: (o) => `Claim paid · ${o.ref}`,
  deposit: (o) => `Capital in · ${capInLabel(o)}`,
  withdrawal: (o) => `Capital out · ${role(o).includes("capital provider") ? "capital provider" : owner(o)}`,
  take_to_treasury: () => "Treasury take · not in reserve",
};
const SW = { fee: "fee", issuer_income: "yld", claim_filed: "clm", claim_paid: "clm", deposit: "cap", withdrawal: "cap", take_to_treasury: "cap" };
const owner = (o) => (o.owner === "capital" ? "capital account" : o.owner || "capital provider");
const shown = ops.filter((o) => o.type !== "refresh" && !(o.type === "take_to_treasury" && num(o.amount_brs) === 0));
// Grouped rows, each placed at its last op (share value and balances after that op):
//   fee invoices -> one row per agency per month (with invoice count);
//   pilot tranche parts -> one "Capital in · pilot tranche" row per month;
//   a split exit (several requests, one fill) -> one "Capital out" row with a ×N note.
const groupKey = (o) =>
  o.type === "fee" ? `f|${o.month}|${o.agency}`
  : isTranche(o) ? `t|${o.month}`
  : o.type === "withdrawal" ? `w|${o.month}|${o.owner}|${o.signature ?? o.ts}`
  : null;
const groups = {};
shown.forEach((o, i) => { const k = groupKey(o); if (k) (groups[k] ||= []).push(i); });
const disp = [];
shown.forEach((o, i) => {
  const k = groupKey(o);
  if (!k) return disp.push(o);
  const g = groups[k];
  if (i !== g.at(-1)) return;
  disp.push({ ...o, amount_brs: r2(g.reduce((a, j) => a + num(shown[j].amount_brs), 0)), _n: g.length });
});
// No capital-provider payoff on screen: withdrawal rows are not listed; their amount still counts in "Capital allocated, net" via the next capital row.
{ let carry = 0;
  for (let i = 0; i < disp.length; i++) {
    const o = disp[i];
    if (o.type === "withdrawal") { carry += num(o.amount_brs); disp.splice(i--, 1); continue; }
    if (carry && o.type === "deposit") { disp[i] = { ...o, _capCarry: carry }; carry = 0; }
  }
  if (carry) warn.push(`withdrawal ${carry} not carried into a capital row`);
}
const v3 = meta.sim_config?.v3 || {};
const capped = (o) => isTranche(o) && num(v3.tranches?.[`m${o.month}`]?.refused_at_cap) > 0;
const rows = disp.map((o) => {
  let amt = num(o.amount_brs), amtTxt, cls;
  const cap = o.type === "deposit" || o.type === "withdrawal";
  if (o.type === "claim_filed") { const p = Math.abs(num(o.provision_brs)); amtTxt = `provision ${signed(-p)}`; cls = "neg"; }
  else if (o.type === "take_to_treasury") { const t = Math.abs(num(o.treasury_amount_brs ?? o.treasury_brs ?? o.amount_brs)); amtTxt = `${money(t)} to treasury`; cls = "mut"; }
  else {
    const note = o.type === "fee" ? `${o._n || 1} invoice${(o._n || 1) > 1 ? "s" : ""}`
      : o.type === "withdrawal" && o._n > 1 ? `×${o._n} requests`
      : capped(o) ? "max_tvl cap" : "";
    amtTxt = signed(amt, cap ? 0 : 2) + (note ? ` <small>· ${note}</small>` : "");
    cls = o.type === "deposit" ? "cap" : amt > 0 ? "pos" : amt < 0 ? "neg" : "mut";
  }
  return { o, m: +o.month, label: (LABEL[o.type] || ((x) => `${x.type} · ${x.ref ?? ""}`))(o), sw: SW[o.type] || "cap", amtTxt, cls, nav: o._nav };
});

// ---------------------------------------------------------------- Timing
const FPS = 30;
const T_MONTHS = 1.7;            // intro before month 1
const MONTHS_SPAN = 19.6;        // M1..M6
// Fee rows are the bulk of the book; they move quickest. Claims and capital rows hold a beat longer.
const WT = { fee: 0.8, issuer_income: 1.1, claim_filed: 1.25, claim_paid: 1.1, deposit: 1.3, withdrawal: 1.8 };
const weight = (r) => WT[r.o.type] ?? 1;
const W = rows.reduce((a, r) => a + weight(r), 0);
let t = T_MONTHS + 0.25;
for (const r of rows) { r.t = r2(t); r.gap = (MONTHS_SPAN * weight(r)) / W; t += r.gap; }
// Per-row move duration: never longer than the gap to the next row (no overlapping tweens on #hl / #list).
rows.forEach((r) => (r.mv = r2(Math.min(0.35, r.gap - 0.03))));
const monthStart = Object.fromEntries(months.map((m) => [m.month, r2(rows.find((r) => r.m === m.month).t - 0.25)]));
const T_FIN = r2(T_MONTHS + MONTHS_SPAN + 1.2); // ~1s hold on the full end state before the finale
const TOTAL = r2(T_FIN + 5.6);

// ---------------------------------------------------------------- Chart geometry (two panels on one month axis: never two y-scales on one plot)
const PX0 = 168, PX1 = 1180, NM = months.length, BW = (PX1 - PX0) / NM;
const bandL = (i) => PX0 + i * BW;
// NAV panel
const NT = 268, NB = 500;
const navVals = [navStart, ...rows.map((r) => r.nav)];
const nMin = Math.min(...navVals), nMax = Math.max(...navVals);
const nStep = [0.0025, 0.005, 0.01, 0.02, 0.025, 0.05, 0.1, 0.25].find((s) => (Math.ceil(nMax / s - 1e-9) - Math.floor(nMin / s + 1e-9)) <= 4) || 0.5;
const nLo = Math.floor(nMin / nStep + 1e-9) * nStep, nHi = Math.max(Math.ceil(nMax / nStep - 1e-9) * nStep, nLo + nStep);
const ny = (v) => NB - ((v - nLo) / (nHi - nLo)) * (NB - NT);
const nDp = nStep < 0.01 ? 4 : 3;
// Flows panel
const FT = 596, FB = 772;
const maxIn = Math.max(...months.map((m) => m.fees_net + m.issuer_income), 1);
const maxOut = Math.max(...months.map((m) => m.claims_paid), 0);
const fStep = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000].find((s) => maxIn / s <= 3.2);
const inTop = Math.ceil(maxIn / fStep) * fStep;
const outBot = maxOut > 0 ? Math.ceil(maxOut / (fStep / 2)) * (fStep / 2) : 0;
const k = (FB - FT) / (inTop + outBot);
const ZY = FT + inTop * k;
const fy = (v) => ZY - v * k;
const fmtK = (v) => (v === 0 ? "0" : (v < 0 ? "−" : "") + "R$" + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) % 1000 ? 1 : 0) + "k" : Math.abs(v)));
const fTicks = []; for (let v = -outBot; v <= inTop + 1e-6; v += fStep / (outBot && v < 0 ? 2 : 1)) fTicks.push(v);
const BARW = Math.min(72, BW * 0.42);

const roundTop = (x, y, w, h, r) => (h <= 0 ? "" : (r = Math.min(r, h, w / 2), `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`));
const roundBot = (x, y, w, h, r) => (h <= 0 ? "" : (r = Math.min(r, h, w / 2), `M${x},${y}H${x + w}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}Z`));

const bars = months.map((m, i) => {
  const cx = bandL(i) + BW / 2, x = cx - BARW / 2;
  const hF = m.fees_net * k, hY = m.issuer_income * k, hC = m.claims_paid * k;
  const gap = hF > 0 && hY > 0 ? 2 : 0;
  return {
    i, m: m.month, cx,
    fee: hF > 0 ? `<path id="bf${i}" class="bf" d="${roundTop(x, ZY - hF, BARW, hF, hY > 0 ? 0 : 4)}"/>` : "",
    yld: hY > 0 ? `<path id="by${i}" class="by" d="${roundTop(x, ZY - hF - gap - hY, BARW, hY, 4)}"/>` : "",
    clm: hC > 0 ? `<path id="bc${i}" class="bc" d="${roundBot(x, ZY + 2, BARW, hC, 4)}"/>` : "",
  };
});

// Reserve growth panel: month-end reserve split into net capital allocated + cumulative earnings (ledger only)
const capOps = ops.filter((o) => o.type === "deposit" || o.type === "withdrawal");
const capEnd = months.map((m) => r2(capOps.filter((o) => +o.month <= m.month).reduce((a, o) => a + num(o.amount_brs), 0)));
const resEnd = months.map((m) => num(m.reserve_end));
const earnEnd = resEnd.map((v, i) => r2(v - capEnd[i]));
{ const e = r2(months.reduce((a, m) => a + m.fees_net + m.issuer_income - m.claims_paid, 0));
  if (Math.abs(e - earnEnd.at(-1)) > 1) warn.push(`earnings ${earnEnd.at(-1)} vs fees+yield-claims ${e}`); }
const gStep = 250000, gHi = Math.max(gStep, Math.ceil(Math.max(...resEnd) / gStep - 1e-9) * gStep);
const gy = (v) => NB - (v / gHi) * (NB - NT);
const fmtG = (v) => (v === 0 ? "0" : v >= 1e6 ? "R$" + v / 1e6 + "M" : "R$" + v / 1000 + "k");
const gcols = months.map((m, i) => {
  const x = r2(bandL(i) + BW / 2 - BARW / 2), yc = r2(gy(capEnd[i])), ye = r2(gy(resEnd[i]));
  return `<path id="gc${i}" class="gc" d="${roundTop(x, yc, BARW, r2(NB - yc), earnEnd[i] > 0 ? 0 : 4)}"/>` + (earnEnd[i] > 0 ? `<path id="ge${i}" class="ge" d="${roundTop(x, ye, BARW, r2(yc - ye - 2), 4)}"/>` : "");
});
const capAt = (m) => rows.find((r) => r.m === m && (r.o.type === "deposit" || r.o.type === "withdrawal"))?.t ?? monthStart[m];

// NAV polyline: one vertex per ledger row, spread across its month band
const pts = [[bandL(0) + 10, ny(navStart)]];
for (const m of months) {
  const mr = rows.filter((r) => r.m === m.month), i = months.indexOf(m);
  mr.forEach((r, j) => { r.px = r2(bandL(i) + 10 + ((BW - 20) * (j + 1)) / mr.length); r.py = r2(ny(r.nav)); pts.push([r.px, r.py]); });
}
let len = 0; const cum = [0];
for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(len); }
rows.forEach((r, i) => (r.len = r2(cum[i + 1])));
const LEN = Math.ceil(len) + 2;
const navD = "M" + pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join(" L");

// ---------------------------------------------------------------- Counters (all from the ledger)
const cum3 = { fee: 0, yld: 0, clm: 0, cap: 0 };
const ev = { fee: [], yld: [], clm: [], cap: [], nav: [], res: [], req: [], book: [] };
for (const r of rows) {
  const a = num(r.o.amount_brs);
  if (r.o.type === "fee") ev.fee.push([r.t, r2((cum3.fee += a))]);
  if (r.o.type === "issuer_income") ev.yld.push([r.t, r2((cum3.yld += a))]);
  if (r.o.type === "claim_paid") ev.clm.push([r.t, r2((cum3.clm += -a))]);
  if (r.o.type === "deposit" || r.o.type === "withdrawal") ev.cap.push([r.t, r2((cum3.cap += a + num(r.o._capCarry)))]);
  ev.nav.push([r.t, r.nav]);
  if (r.o.reserve_after != null) ev.res.push([r.t, +r.o.reserve_after]);
  if (r.o.ceiling_after != null) ev.req.push([r.t, +r.o.ceiling_after]);
  if (r.o.cover_in_force_after != null) ev.book.push([r.t, +r.o.cover_in_force_after, num(r.o.active_leases_after)]);
}
const lastOp = ops.at(-1);
const endLeases = num(lastOp.active_leases_after), endCover = num(lastOp.cover_in_force_after);
// Leases that register after the last listed op (e.g. the M6 day-28 registrations) land on the closing refresh: show them as the run's last step.
if (ev.book.length && (ev.book.at(-1)[2] !== endLeases || ev.book.at(-1)[1] !== endCover)) ev.book.push([r2(rows.at(-1).t + 0.3), endCover, endLeases]);
const wOp = ops.find((o) => o.type === "withdrawal" && o.all) || ops.findLast((o) => o.type === "withdrawal");
const who = wOp?.owner;
const mine = (o) => (who ? o.owner === who : true);
const depOps = ops.filter((o) => o.type === "deposit" && mine(o)), wdOps = ops.filter((o) => o.type === "withdrawal" && mine(o));
const deposit = depOps.reduce((a, o) => a + num(o.amount_brs), 0);
const withdrawal = -wdOps.reduce((a, o) => a + num(o.amount_brs), 0);
const finNav0 = depOps[0]?.nav_at_fill != null ? +depOps[0].nav_at_fill : null;
const finNav1 = wdOps.at(-1)?.nav_at_fill != null ? +wdOps.at(-1).nav_at_fill : null;
const firstRes = ops[0].reserve_after != null ? num(months[0].reserve_start ?? ops[0].reserve_after - num(ops[0].amount_brs)) : 0;
const firstReq = num(months[0].ceiling_start ?? 0);
const C = {
  cap: { el: "tot-cap", ev: ev.cap, start: 0, dp: 0, fmt: "plus" },
  fee: { el: "tot-fee", ev: ev.fee, start: 0, dp: 0, fmt: "plus" },
  yld: { el: "tot-yld", ev: ev.yld, start: 0, dp: 0, fmt: "plus" },
  clm: { el: "tot-clm", ev: ev.clm, start: 0, dp: 0, fmt: "minus" },
  nav: { el: "nav-hero", ev: ev.nav, start: navStart, dp: 4, fmt: "nav" },
  res: { el: "res-bal", ev: ev.res, start: firstRes, dp: 0, fmt: "money" },
  req: { el: "req-v", ev: ev.req, start: firstReq, dp: 0, fmt: "scale" },
  // Book in force: leases + cover, stepping per ledger row (no tween, so the count stays whole); ends on the end-of-run values.
  book: { el: "book", ev: ev.book.map(([t, v, n]) => [t, v, n]), start: 0, dp: 0, fmt: "book", dur: 0.001 },
};
if (FINALE === "inout") C.fin = { el: "fin-out", ev: [[r2(T_FIN + 1.5), withdrawal]], start: deposit, dp: 0, fmt: "money", dur: 1.2 };
const finNavFrom = finNav0 ?? navStart, finNavTo = finNav1 ?? navEnd;

// ---------------------------------------------------------------- Reconcile against meta.headline (any mismatch is a warning)
const H = meta.headline;
if (H) {
  const chk = (name, got, want, tol = 0.01) => { if (want != null && Math.abs(num(got) - num(want)) > tol) warn.push(`reconcile ${name}: build ${got} vs headline ${want}`); };
  for (const p of H.nav_path || []) chk(`M${p.month} share price`, rows.findLast((r) => r.m === +p.month)?.nav, p.nav_end, 1e-6);
  chk("M1 share price start", navStart, H.nav_path?.[0]?.nav_start, 1e-6);
  chk("reserve.end", ev.res.at(-1)?.[1], H.reserve?.end);
  chk("reserve.start (after first fill)", ev.res[0]?.[1], H.reserve?.start);
  chk("ceiling.end", ev.req.at(-1)?.[1], H.ceiling?.end);
  chk("ceiling.start (after first fill)", ev.req[0]?.[1], H.ceiling?.start);
  const T = H.totals || {};
  chk("fees_net", cum3.fee, T.fees_net_brs); chk("issuer_income", cum3.yld, T.issuer_income_brs); chk("claims_paid", cum3.clm, T.claims_paid_brs);
  chk("take_to_treasury", takeTotal, T.take_to_treasury_brs);
  chk("fee receipts", ops.filter((o) => o.type === "fee").length, T.fee_receipts, 0);
  chk("income statements", ops.filter((o) => o.type === "issuer_income").length, T.income_statements, 0);
  chk("claims paid count", ops.filter((o) => o.type === "claim_paid").length, T.claims_paid, 0);
  chk("chart fees (months[])", months.reduce((a, m) => a + m.fees_net, 0), T.fees_net_brs);
  chk("chart yield (months[])", months.reduce((a, m) => a + m.issuer_income, 0), T.issuer_income_brs);
  chk("chart claims (months[])", months.reduce((a, m) => a + m.claims_paid, 0), T.claims_paid_brs);
  chk("provider in", deposit, H.provider?.in_brs); chk("provider out", withdrawal, H.provider?.out_brs);
  chk("provider exit requests", wdOps.length, H.provider?.exit_requests, 0);
  chk("end leases", endLeases, H.end?.active_leases, 0); chk("end cover", endCover, H.end?.total_cover_brs);
  chk("end share price", navEnd, H.end?.share_price, 1e-6);
  for (const r of rows.filter((x) => isTranche(x.o))) chk(`M${r.m} tranche`, r.o.amount_brs, v3.tranches?.[`m${r.m}`]?.total);
}

// ---------------------------------------------------------------- Finale variants (kit.config.json finale: "inout" | "sharepath")
const DISC = "Simulation of reserve mechanics · not an expected return";
const exitNote = wdOps.length > 1 ? ` in ${wdOps.length} requests (max_request cap)` : "";
const FIN_INOUT = `        <div id="fin">
          <div class="k" id="fin-k">Capital provider · six simulated months</div>
          <div class="io" id="fin-io">${money(deposit, 0)} in<span class="to">→</span><span class="end"><span id="fin-out">${money(deposit, 0)}</span> out</span></div>
          <div class="disc" id="fin-disc">${DISC}</div>
          <div class="src" id="fin-src">Deposit in M${depOps[0]?.month ?? "?"}, ${wOp?.all ? "full " : ""}withdrawal in M${wdOps.at(-1)?.month ?? "?"}${exitNote}. Amounts from the ledger.</div>
        </div>`;
// Share path: start + six month-end share prices as a stepped line (each month a tread, rises as risers).
const spVals = [navStart, ...months.map((m) => rows.findLast((r) => r.m === m.month).nav)];
const SPX0 = 250, SPX1 = 1150, SPY0 = 196, SPY1 = 46;
const spLo = Math.min(...spVals), spHi = Math.max(...spVals);
const spx = (i) => r2(SPX0 + ((SPX1 - SPX0) * i) / (spVals.length - 1));
const spy = (v) => r2(SPY0 - ((v - spLo) / (spHi - spLo || 1)) * (SPY0 - SPY1));
let spD = `M${spx(0)},${spy(spVals[0])}`, spLen = 0;
for (let i = 1; i < spVals.length; i++) { spD += ` H${spx(i)} V${spy(spVals[i])}`; spLen += spx(i) - spx(i - 1) + Math.abs(spy(spVals[i]) - spy(spVals[i - 1])); }
spLen = Math.ceil(spLen) + 2;
const resFrom = ev.res[0]?.[1] ?? firstRes, resTo = ev.res.at(-1)?.[1] ?? firstRes;
const FIN_SHARE = `        <div id="fin" style="top:226px;height:628px">
          <div class="k" id="fin-k">Reserve unit value · six simulated months</div>
          <div class="io" id="fin-io">${spVals[0].toFixed(3)}<span class="to">→</span><span class="end">${spVals.at(-1).toFixed(3)}</span></div>
          <div class="disc plate" id="fin-disc"><span>${DISC}</span></div>
          <div class="sub" id="fin-sub">Reserve ${moneyScale(resFrom)} → ${moneyScale(resTo)} · backs ${moneyScale(endCover)} of guarantees</div>
          <svg id="sp" width="1400" height="250" viewBox="0 0 1400 250" style="position:absolute;left:0;top:368px">
            <line class="sp-base" x1="${SPX0 - 30}" x2="${SPX1 + 30}" y1="${SPY0 + 18}" y2="${SPY0 + 18}"/>
            <path id="sp-glow" d="${spD}" stroke-dasharray="${spLen}" stroke-dashoffset="${spLen}"/>
            <path id="sp-line" d="${spD}" stroke-dasharray="${spLen}" stroke-dashoffset="${spLen}"/>
${spVals.map((v, i) => `            <circle id="sp-d${i}" class="nd" cx="${spx(i)}" cy="${spy(v)}" r="${i === spVals.length - 1 ? 9 : 7}"/><text id="sp-v${i}" class="spv${i === spVals.length - 1 ? " last" : ""}" x="${spx(i)}" y="${r2(spy(v) - 20)}" text-anchor="middle">${v.toFixed(3)}</text><text class="sp-m" x="${spx(i)}" y="${SPY0 + 46}" text-anchor="middle">${i ? `M${months[i - 1].month}` : "start"}</text>`).join("\n")}
          </svg>
        </div>`;

// ---------------------------------------------------------------- HTML
const rowH = 108;
const rowsHtml = rows.map((r, i) => `          <div class="row" id="r${i}" style="top:${i * rowH}px">
            <div class="mtag">M${r.m}</div>
            <div class="rb"><div class="lbl"><i class="sw ${r.sw}"></i><span>${esc(r.label)}</span></div>
              <div class="vals"><span class="amt ${r.cls}">${r.amtTxt}</span><span class="nv">unit ${r.nav.toFixed(4)}</span></div></div>
          </div>`).join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>MUTAV Ch3 capital efficiency</title>
    <!-- GENERATED by tools/build.mjs from ${esc(SRC.split("/").pop())}: edit the generator or the ledger, not this file. -->
    <script src="vendor/gsap.min.js"></script>
    <style>
      @font-face { font-family: "Geist"; font-weight: 100 900; font-style: normal; src: url("assets/fonts/Geist.woff2") format("woff2"); }
      @font-face { font-family: "Inter"; font-weight: 100 900; font-style: normal; src: url("assets/fonts/Inter.woff2") format("woff2"); }
      @font-face { font-family: "JetBrains Mono"; font-weight: 100 800; font-style: normal; src: url("assets/fonts/JetBrainsMono.woff2") format("woff2"); }
      :root {
        --canvas: #0e0f11; --surface: #16181c; --border: #2a2d33; --text: #f0f0ee; --text-2: #9aa0aa; --text-3: #5f6570;
        --accent: #e8a020; --fee: #c98500; --yld: #3987e5; --clm: #c46a62; --pos: #3dab72; --neg: #d3938d;
        --font-display: "Geist", "Helvetica Neue", Arial, sans-serif;
        --font-sans: "Inter", "Helvetica Neue", Arial, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, Menlo, monospace;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--canvas); color: var(--text); font-family: var(--font-sans); -webkit-font-smoothing: antialiased; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--canvas); }
      .clip { position: absolute; inset: 0; overflow: hidden; }
      .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

      /* Stage */
      #grid { position: absolute; left: -48px; top: -48px; width: 2016px; height: 1176px;
        background-image: linear-gradient(to right, rgba(240,240,238,.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(240,240,238,.04) 1px, transparent 1px);
        background-size: 48px 48px; }
      #vig { position: absolute; inset: 0; background: radial-gradient(ellipse 80% 75% at 50% 45%, rgba(14,15,17,0) 50%, rgba(6,7,8,.75) 100%); }
      #spill { position: absolute; left: 1060px; top: 60px; width: 1000px; height: 900px; background: radial-gradient(closest-side, rgba(232,160,32,.07), rgba(232,160,32,0)); }
      #grain { position: absolute; left: -128px; top: -128px; width: 2176px; height: 1336px; opacity: .06; mix-blend-mode: overlay;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch' seed='7'/><feColorMatrix type='saturate' values='0'/></filter><rect width='256' height='256' filter='url(%23n)'/></svg>");
        background-size: 256px 256px; }

      /* Honesty banner */
      #banner { position: absolute; left: 0; right: 0; top: 26px; display: flex; justify-content: center; }
      #banner .plate { display: flex; align-items: center; gap: 22px; padding: 12px 26px; background: rgba(30,31,35,.97); border: 1px solid rgba(232,160,32,.75);
        font-family: var(--font-mono); font-size: 26px; letter-spacing: .05em; white-space: nowrap; }
      #banner .a { text-transform: uppercase; color: var(--text); }
      #banner .a b { font-weight: 500; color: var(--accent); }
      #banner .sep { width: 1px; height: 26px; background: var(--border); }
      #banner .b { color: var(--text-2); font-size: 26px; }
      #scale { position: absolute; left: 0; right: 0; top: 98px; display: flex; justify-content: center; }
      #scale span { font-family: var(--font-mono); font-size: 19px; letter-spacing: .08em; color: var(--text-2); white-space: nowrap; }
      #ph { position: absolute; left: 32px; top: 36px; padding: 7px 12px; border: 1px dashed rgba(232,160,32,.6); font-family: var(--font-mono); font-size: 18px;
        letter-spacing: .1em; color: var(--accent); background: rgba(14,15,17,.9); }

      /* Chart */
      #chart { position: absolute; left: 0; top: 0; width: 1200px; height: 870px; }
      #title { position: absolute; left: 72px; top: 120px; font-family: var(--font-display); font-weight: 800; font-size: 50px; letter-spacing: -.03em; white-space: nowrap; }
      #legend { position: absolute; left: 74px; top: 192px; display: flex; gap: 34px; font-size: 22px; font-weight: 500; color: var(--text); white-space: nowrap; }
      #legend span { display: flex; align-items: center; gap: 10px; }
      .sw { display: inline-block; width: 14px; height: 14px; border-radius: 3px; flex: none; }
      .sw.fee { background: var(--fee); } .sw.gcs { background: rgba(236,236,232,.78); } .sw.yld { background: var(--yld); } .sw.clm { background: var(--clm); }
      .sw.cap { background: transparent; box-shadow: inset 0 0 0 2px var(--text-2); }
      #svg { position: absolute; left: 0; top: 0; }
      .gl { stroke: rgba(240,240,238,.07); stroke-width: 1; }
      .zl { stroke: rgba(240,240,238,.32); stroke-width: 1.5; }
      .tk { font-family: "JetBrains Mono"; font-size: 18px; fill: #8a8f99; }
      .pl { font-family: "JetBrains Mono"; font-size: 19px; fill: #9aa0aa; letter-spacing: .06em; }
      .gc { fill: rgba(236,236,232,.78); } .ge { fill: var(--accent); } .gv { font-family: "JetBrains Mono"; font-size: 22px; font-weight: 600; fill: #f4f4f2; } .glg { font-family: "Inter", sans-serif; font-size: 19px; fill: #c9ccd2; }
      .bf { fill: var(--fee); } .by { fill: var(--yld); } .bc { fill: var(--clm); }
      .mlab { font-family: "JetBrains Mono"; font-size: 24px; font-weight: 600; fill: #9aa0aa; }
      .ylab { font-family: "JetBrains Mono"; font-size: 18px; fill: #8f949e; }
      .nd { fill: var(--accent); stroke: var(--canvas); stroke-width: 2; }
      .cf { fill: var(--canvas); stroke: var(--clm); stroke-width: 2.5; }
      .foot { position: absolute; left: 74px; font-size: 20px; color: var(--text-2); white-space: nowrap; }

      /* Ledger */
      #ledger { position: absolute; left: 1230px; top: 120px; width: 632px; height: 740px; background: rgba(22,24,28,.94); border: 1px solid rgba(255,255,255,.08);
        border-radius: 12px; box-shadow: 0 60px 120px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.03); overflow: hidden; }
      #lg-h { position: absolute; left: 30px; top: 24px; font-family: var(--font-display); font-weight: 800; font-size: 34px; letter-spacing: -.02em; }
      #lg-s { position: absolute; left: 30px; top: 72px; font-family: var(--font-mono); font-size: 18px; color: var(--text-2); letter-spacing: .04em; }
      #vp { position: absolute; left: 16px; right: 16px; top: 112px; height: ${4 * rowH}px; overflow: hidden; }
      #list { position: absolute; left: 0; right: 0; top: 0; height: ${rows.length * rowH}px; }
      #hl { position: absolute; left: 0; right: 0; top: 0; height: ${rowH - 8}px; border-radius: 8px; border: 1.5px solid rgba(232,160,32,.85);
        background: rgba(232,160,32,.07); box-shadow: 0 0 28px rgba(232,160,32,.18); }
      .row { position: absolute; left: 0; right: 0; height: ${rowH - 8}px; display: flex; align-items: center; gap: 16px; padding: 0 18px 0 14px; }
      .mtag { flex: none; width: 50px; text-align: center; padding: 5px 0; border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-mono); font-size: 20px; color: var(--text-2); }
      .rb { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
      .lbl { display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 500; white-space: nowrap; }
      .vals { display: flex; justify-content: space-between; align-items: baseline; font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .amt { font-size: 26px; font-weight: 500; } .amt small { font-size: 18px; color: var(--text-2); font-weight: 400; } .amt.pos { color: var(--pos); } .amt.neg { color: var(--neg); } .amt.mut { color: var(--text-2); } .amt.cap { color: #f4f4f2; font-weight: 700; }
      .nv { font-size: 21px; color: var(--text-2); }
      #lg-f { position: absolute; left: 30px; right: 30px; top: 574px; padding-top: 22px; border-top: 1px solid var(--border); }
      #lg-f .k { font-family: var(--font-mono); font-size: 18px; letter-spacing: .1em; text-transform: uppercase; color: var(--text-2); }
      #res-bal { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 44px; font-weight: 500; margin-top: 8px; letter-spacing: -.02em; }
      #req { font-family: var(--font-mono); font-size: 20px; color: var(--text-2); margin-top: 8px; }

      /* Totals strip */
      #strip { position: absolute; left: 72px; top: 922px; width: 1790px; height: 150px; }
      .st { position: absolute; top: 0; }
      .st .k { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 16px; letter-spacing: .04em; text-transform: uppercase; color: var(--text-2); white-space: nowrap; }
      .st .v { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 38px; font-weight: 500; margin-top: 10px; letter-spacing: -.03em; white-space: nowrap; }
      #st-nav { left: 1044px; top: -16px; width: 746px; height: 150px; }
      #nav-hero { font-size: 76px; color: var(--accent); text-shadow: 0 0 34px rgba(232,160,32,.35); margin-top: 2px; }
      #st-nav .from { font-family: var(--font-mono); font-size: 22px; color: var(--text-2); position: absolute; left: 330px; top: 56px; white-space: nowrap; }
      #st-nav .book { font-family: var(--font-mono); font-size: 22px; color: var(--text); position: absolute; left: 330px; top: 92px; white-space: nowrap; }
      .stsep { position: absolute; top: 6px; width: 1px; height: 96px; background: var(--border); }

      /* Finale card */
      #fin { position: absolute; left: 260px; top: 335px; width: 1400px; height: 380px; background: rgba(22,24,28,.97); border: 1px solid rgba(232,160,32,.55);
        border-radius: 14px; box-shadow: 0 80px 160px -20px rgba(0,0,0,.8), 0 0 80px rgba(232,160,32,.10); }
      #fin .k { position: absolute; left: 0; right: 0; top: 56px; text-align: center; font-family: var(--font-mono); font-size: 24px; letter-spacing: .12em; text-transform: uppercase; color: var(--text-2); }
      #fin .io { position: absolute; left: 0; right: 0; top: 128px; text-align: center; font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 76px; font-weight: 500; letter-spacing: -.03em; white-space: nowrap; }
      #fin .io .to { color: var(--text-3); padding: 0 22px; }
      #fin .io .end { color: var(--accent); }
      #fin .disc { position: absolute; left: 0; right: 0; top: 236px; text-align: center; font-family: var(--font-mono); font-size: 24px; letter-spacing: .04em; color: var(--text-2); white-space: nowrap; }
      #fin .nv2 { position: absolute; left: 0; right: 0; top: 302px; text-align: center; font-family: var(--font-mono); font-size: 34px; color: var(--text); white-space: nowrap; }
      #fin .nv2 em { font-style: normal; color: var(--text-2); }
      .sp-base { stroke: rgba(240,240,238,.14); stroke-width: 1; }
      #sp-glow { fill: none; stroke: rgba(232,160,32,.45); stroke-width: 12; stroke-linejoin: round; filter: blur(7px); }
      #sp-line { fill: none; stroke: var(--accent); stroke-width: 4; stroke-linejoin: round; stroke-linecap: round; }
      .spv { font-family: "JetBrains Mono"; font-size: 22px; fill: #c9ccd2; }
      .spv.last { fill: var(--accent); font-weight: 600; font-size: 26px; }
      .sp-m { font-family: "JetBrains Mono"; font-size: 20px; fill: #8a8f99; }
      #fin .sub { position: absolute; left: 0; right: 0; top: 314px; text-align: center; font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 30px; color: var(--text); white-space: nowrap; }
      #fin .disc.plate { top: 232px; }
      #fin .disc.plate span { display: inline-block; padding: 9px 26px; background: #2a2d33; border: 1px solid #44484f; border-radius: 8px; font-size: 29px; font-weight: 500; letter-spacing: .02em; color: #f7f7f5; }
      #fin .src { position: absolute; left: 0; right: 0; top: 300px; text-align: center; font-size: 22px; color: var(--text-2); white-space: nowrap; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-fps="${FPS}" data-width="1920" data-height="1080">
      <div id="stage" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="0">
        <div id="grid" data-layout-allow-overflow></div>
        <div id="spill" data-layout-allow-overflow></div>
        <div id="vig"></div>
      </div>

      <div id="main" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="1">
        <div id="chart" data-layout-allow-occlusion>
          <div id="title">What moves the reserve</div>
          <div id="legend"><span id="lg1"><i class="sw fee"></i>Guarantee fees, net</span><span id="lg2"><i class="sw yld"></i>Reserve yield (BRS issuer revenue)</span><span id="lg3"><i class="sw clm"></i>Claims paid</span></div>
          <svg id="svg" width="1200" height="870" viewBox="0 0 1200 870">
            <g id="axes" data-layout-allow-occlusion>
              <text class="pl" data-layout-allow-occlusion x="${PX0 - 94}" y="${NT - 18}">RESERVE GROWTH, R$</text>
              <rect x="400" y="${NT - 34}" width="14" height="14" rx="3" fill="rgba(236,236,232,.78)"/><text class="glg" data-layout-allow-occlusion x="424" y="${NT - 21}">Capital allocated</text>
              <rect x="610" y="${NT - 34}" width="14" height="14" rx="3" fill="#e8a020"/><text class="glg" data-layout-allow-occlusion x="634" y="${NT - 21}">Earnings (fees + yield − claims)</text>
${[...Array(Math.round(gHi / gStep) + 1).keys()].map((j) => { const v = j * gStep; return `              <line class="${v === 0 ? "zl" : "gl"}" x1="${PX0}" x2="${PX1}" y1="${r2(gy(v))}" y2="${r2(gy(v))}"/><text class="tk" x="${PX0 - 14}" y="${r2(gy(v) + 6)}" text-anchor="end">${fmtG(v)}</text>`; }).join("\n")}
              <text class="pl" data-layout-allow-occlusion x="${PX0 - 94}" y="${FT - 18}">EARNINGS BY MONTH, R$ · capital tranches shown above</text>
${fTicks.map((v) => `              <line class="${v === 0 ? "zl" : "gl"}" x1="${PX0}" x2="${PX1}" y1="${r2(fy(v))}" y2="${r2(fy(v))}"/><text class="tk" x="${PX0 - 14}" y="${r2(fy(v) + 6)}" text-anchor="end">${fmtK(v)}</text>`).join("\n")}
            </g>
            <rect id="band" x="${bandL(0) + 4}" y="${NT - 6}" width="${BW - 8}" height="${FB - NT + 70}" rx="8" fill="rgba(232,160,32,.05)"/>
            <g id="months">
${months.map((m, i) => `              <text id="ml${i}" class="mlab" data-layout-allow-occlusion x="${r2(bandL(i) + BW / 2)}" y="${FB + 34}" text-anchor="middle">M${m.month}</text><text class="ylab" data-layout-allow-occlusion x="${r2(bandL(i) + BW / 2)}" y="${FB + 58}" text-anchor="middle">${esc(m.yyyymm)}</text>`).join("\n")}
            </g>
            <g id="bars">
${bars.map((b) => `              ${b.fee}${b.yld}${b.clm}`).join("\n")}
            </g>
            <g id="growth">
${gcols.map((c) => "              " + c).join("\n")}
            </g>
            <text id="gend" class="gv" data-layout-allow-occlusion x="${r2(bandL(NM - 1) + BW / 2)}" y="${r2(gy(resEnd.at(-1)) - 14)}" text-anchor="middle">${money(resEnd.at(-1), 0)}</text>
          </svg>
          <div class="foot" id="ft1" style="top:${FB + 78}px">${takeTotal > 0 ? `Fees shown net of the treasury take (${money(takeTotal, 0)} in total), which never enters the reserve.` : "Fees shown as received by the reserve."}</div>
          <div class="foot" id="ft2" style="top:${FB + 106}px">Capital movements change the reserve balance, not the unit value.${navNote ? ` Unit value: ${esc(navNote)}.` : ""}</div>
        </div>

        <div id="ledger">
          <div id="lg-h">Operations</div>
          <div id="lg-s">In ledger order · amount · unit value after</div>
          <div id="vp"><div id="list" data-layout-allow-overflow>
            <div id="hl"></div>
${rowsHtml}
          </div></div>
          <div id="lg-f"><div class="k">Reserve balance</div><div id="res-bal">${money(firstRes)}</div><div id="req">Can back <span id="req-v">${moneyScale(firstReq)}</span> of cover</div></div>
        </div>

        <div id="strip" data-layout-allow-occlusion>
          <div class="st" id="st0" style="left:0"><div class="k"><i class="sw gcs"></i>Capital allocated, net</div><div class="v" id="tot-cap">+R$0</div></div>
          <div class="stsep" style="left:268px"></div>
          <div class="st" id="st1" style="left:292px"><div class="k"><i class="sw fee"></i>Guarantee fees</div><div class="v" id="tot-fee">+R$0</div></div>
          <div class="stsep" style="left:520px"></div>
          <div class="st" id="st2" style="left:544px"><div class="k"><i class="sw yld"></i>Reserve yield</div><div class="v" id="tot-yld">+R$0</div></div>
          <div class="stsep" style="left:772px"></div>
          <div class="st" id="st3" style="left:796px"><div class="k"><i class="sw clm"></i>Claims paid</div><div class="v" id="tot-clm">R$0</div></div>
          <div class="st" id="st-nav"><div class="k">Reserve unit value</div><div class="v" id="nav-hero">${navStart.toFixed(4)}</div><div class="from">from ${navStart.toFixed(4)}</div><div class="book" id="book">${endLeases} leases · ${moneyScale(endCover)} of cover</div></div>
          <div class="stsep" style="left:1022px"></div>
        </div>
      </div>

      <div id="fin-clip" class="clip" data-start="${r2(T_FIN)}" data-duration="${r2(TOTAL - T_FIN)}" data-track-index="2">
${FINALE === "inout" ? FIN_INOUT : FIN_SHARE}
      </div>

      <div id="top" class="clip" data-start="0" data-duration="${TOTAL}" data-track-index="3">
        <div id="banner"><div class="plate" id="banner-p"><span class="a"><b>Local simulation</b> · accelerated clock</span><i class="sep"></i><span class="b">Mock BRS mint · local validator</span></div></div>
${KIT.scaleLine ? `        <div id="scale"><span id="scale-t">${esc(KIT.scaleLine)}</span></div>` : ""}
${PLACEHOLDER ? `        <div id="ph">PLACEHOLDER DATA</div>` : ""}
        <div id="grain" data-layout-allow-overflow></div>
      </div>
    </div>

    <script>
      const tl = gsap.timeline({ paused: true });
      const C = ${JSON.stringify(C)};
      const money = (v, dp) => { const a = Math.abs(v).toFixed(dp).split("."); return "R$" + a[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",") + (dp ? "." + a[1] : ""); };
      const scale = (v) => { const a = Math.abs(v); return a >= 1e6 ? "R$" + (a / 1e6).toFixed(2).replace(/0$/, "") + "M" : a >= 1e3 ? "R$" + Math.round(a / 1e3) + "k" : "R$" + Math.round(a); };
      const ease = (x) => 1 - Math.pow(1 - x, 3);
      const valAt = (c, t) => { let v = c.start, prev = c.start; const d = c.dur || 0.5;
        for (const [et, ev] of c.ev) { if (t < et) break; prev = v; v = ev; if (t < et + d) return prev + (v - prev) * ease((t - et) / d); } return v; };
      const els = {}; for (const k in C) els[k] = document.getElementById(C[k].el);
      const bookAt = (c, t) => { let e = null; for (const x of c.ev) { if (t < x[0]) break; e = x; } return e; };
      const draw = (t) => { for (const k in C) { const c = C[k], v = valAt(c, t);
        if (c.fmt === "book") { const e = bookAt(c, t); els[k].textContent = e && e[2] ? e[2] + " leases · " + scale(e[1]) + " of cover" : ""; continue; }
        els[k].textContent = c.fmt === "nav" ? v.toFixed(4) : c.fmt === "plus" ? "+" + money(v, c.dp) : c.fmt === "minus" ? (v > 0 ? "\\u2212" : "") + money(v, c.dp) : c.fmt === "scale" ? scale(v) : money(v, c.dp); } };
      const clock = { t: 0 };
      tl.to(clock, { t: ${TOTAL}, duration: ${TOTAL}, ease: "none", onUpdate: () => draw(clock.t) }, 0);
      draw(0);

      // Stage drift + grain
      tl.fromTo("#grid", { x: 0, y: 20 }, { x: -24, y: -20, duration: ${TOTAL}, ease: "none" }, 0);
      tl.fromTo("#grain", { x: 0, y: 0 }, { x: -120, y: -97, duration: ${TOTAL}, ease: "steps(${Math.round(TOTAL * 15)})" }, 0);

      // Intro
      tl.fromTo("#banner-p", { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, 0);${KIT.scaleLine ? `
      tl.fromTo("#scale-t", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, 0.25);` : ""}${PLACEHOLDER ? `
      tl.fromTo("#ph", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.1);` : ""}
      tl.fromTo("#title", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.6, ease: "expo.out" }, 0.2);
      ["#lg1", "#lg2", "#lg3"].forEach((s, i) => tl.fromTo(s, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0.45 + i * 0.1));
      tl.fromTo("#axes", { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power2.out" }, 0.4);
      tl.fromTo("#months", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power2.out" }, 0.6);
      tl.fromTo("#band", { opacity: 0 }, { opacity: 1, duration: 0.4 }, ${T_MONTHS});
      tl.fromTo("#ledger", { opacity: 0, y: 60, rotationY: -6, transformPerspective: 2400 }, { opacity: 1, y: 0, rotationY: 0, transformPerspective: 2400, duration: 0.8, ease: "expo.out" }, 0.5);
      tl.fromTo("#hl", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${r2(rows[0].t - 0.15)});
      ["#st0", "#st1", "#st2", "#st3", "#st-nav"].forEach((s, i) => tl.fromTo(s, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.8 + i * 0.1));
      tl.fromTo("#ft1", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.2);
      tl.fromTo("#ft2", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.35);

      // Months: band + label highlight
${months.map((m, i) => `${i > 0 ? `      tl.fromTo("#band", { x: ${r2((i - 1) * BW)} }, { x: ${r2(i * BW)}, duration: 0.5, ease: "power3.inOut", immediateRender: false }, ${r2(monthStart[m.month] - 0.2)});
      tl.fromTo("#ml${i - 1}", { fill: "#e8a020" }, { fill: "#9aa0aa", duration: 0.3, immediateRender: false }, ${monthStart[m.month]});
` : ""}      tl.fromTo("#ml${i}", { fill: "#9aa0aa" }, { fill: "#e8a020", duration: 0.3, immediateRender: false }, ${monthStart[m.month]});`).join("\n")}

      // Ledger rows: mask reveal, highlight follows, list scrolls, older rows fade up
${rows.map((r, i) => {
  const out = [];
  out.push(`tl.fromTo("#r${i}", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.45, ease: "expo.out" }, ${r2(r.t - 0.15)});`);
  const OP = [1, 0.78, 0.55, 0.32];
  if (i > 0) out.push(`tl.fromTo("#hl", { y: ${(i - 1) * rowH} }, { y: ${i * rowH}, duration: ${r.mv}, ease: "power3.inOut", immediateRender: false }, ${r2(r.t - 0.3)});`);
  if (i >= 4) out.push(`tl.fromTo("#list", { y: ${-(i - 4) * rowH} }, { y: ${-(i - 3) * rowH}, duration: ${r.mv}, ease: "power3.inOut", immediateRender: false }, ${r2(r.t - 0.3)});`);
  for (let j = Math.max(0, i - 3); j < i; j++) out.push(`tl.fromTo("#r${j}", { opacity: ${OP[i - j - 1]} }, { opacity: ${OP[i - j]}, duration: ${r.mv}, immediateRender: false }, ${r2(r.t - 0.3)});`);
  // chart sync
  const bi = months.findIndex((m) => m.month === r.m), mm = months[bi], a = num(r.o.amount_brs);
  if (r.o.type === "fee" && mm.fees_net > 0) {
    const sofar = rows.filter((x, xi) => xi <= i && x.m === r.m && x.o.type === "fee").reduce((s, x) => s + num(x.o.amount_brs), 0);
    const f = Math.round(Math.min(1, sofar / mm.fees_net) * 1000) / 1000, f0 = Math.round(Math.min(1, (sofar - a) / mm.fees_net) * 1000) / 1000;
    out.push(`tl.fromTo("#bf${bi}", { scaleY: ${f0}, transformOrigin: "50% 100%" }, { scaleY: ${f}, transformOrigin: "50% 100%", duration: ${r2(Math.min(0.45, r.gap - 0.03))}, ease: "power3.out", immediateRender: ${f0 === 0} }, ${r.t});`);
  }
  if (r.o.type === "issuer_income" && mm.issuer_income > 0) out.push(`tl.fromTo("#by${bi}", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, transformOrigin: "50% 100%", duration: 0.5, ease: "power3.out" }, ${r.t});`);
  if (r.o.type === "claim_paid" && mm.claims_paid > 0) {
    const sofar = rows.filter((x, xi) => xi <= i && x.m === r.m && x.o.type === "claim_paid").reduce((s, x) => s - num(x.o.amount_brs), 0);
    const f = Math.round(Math.min(1, sofar / mm.claims_paid) * 1000) / 1000, f0 = Math.round(Math.min(1, (sofar + a) / mm.claims_paid) * 1000) / 1000;
    out.push(`tl.fromTo("#bc${bi}", { scaleY: ${f0}, transformOrigin: "50% 0%" }, { scaleY: ${f}, transformOrigin: "50% 0%", duration: ${r2(Math.min(0.45, r.gap - 0.03))}, ease: "power3.out", immediateRender: ${f0 === 0} }, ${r.t});`);
  }
  return "      " + out.join("\n      ");
}).join("\n")}
${months.map((m, i) => { const li = rows.findLastIndex((r) => r.m === m.month); return `      tl.fromTo("#gc${i}", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, transformOrigin: "50% 100%", duration: 0.7, ease: "power3.out" }, ${r2(capAt(m.month))});` + (earnEnd[i] > 0 ? `\n      tl.fromTo("#ge${i}", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, transformOrigin: "50% 100%", duration: 0.5, ease: "power3.out" }, ${r2(Math.max(rows[li].t, capAt(m.month) + 0.7))});` : ""); }).join("\n")}
      tl.fromTo("#gend", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, ${r2(rows.at(-1).t + 0.4)});
      tl.fromTo("#nav-hero", { textShadow: "0 0 34px rgba(232,160,32,.35)" }, { textShadow: "0 0 54px rgba(232,160,32,.7)", duration: 0.3, yoyo: true, repeat: 1, ease: "power2.out" }, ${r2(rows.at(-1).t + 0.5)});

      // Finale: ledger collapses into one card, flat and straight-on for reading
      tl.to("#ledger", { scaleY: 0.04, transformOrigin: "50% 50%", duration: 0.5, ease: "power3.in" }, ${T_FIN});
      tl.to("#ledger", { opacity: 0, duration: 0.2 }, ${r2(T_FIN + 0.4)});
      tl.to(["#chart", "#strip"], { opacity: 0.16, duration: 0.6, ease: "power2.out" }, ${r2(T_FIN + 0.1)});
      tl.fromTo("#fin", { x: 585, y: -25, scale: 0.42, opacity: 0 }, { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.8, ease: "expo.out" }, ${r2(T_FIN + 0.4)});
      tl.fromTo("#fin-k", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.5, ease: "expo.out" }, ${r2(T_FIN + 0.9)});
      tl.fromTo("#fin-io", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.7, ease: "expo.out" }, ${r2(T_FIN + 1.05)});
      tl.fromTo("#fin-disc", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.out" }, ${r2(T_FIN + (FINALE === "sharepath" ? 1.05 : 1.3))});
${FINALE === "sharepath" ? `      tl.fromTo("#fin-sub", { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: "power2.out" }, ${r2(T_FIN + 1.5)});` : ""}
${FINALE === "inout" ? `      tl.fromTo("#fin-io .end", { textShadow: "0 0 0px rgba(232,160,32,0)" }, { textShadow: "0 0 40px rgba(232,160,32,.45)", duration: 0.4, ease: "power2.out" }, ${r2(T_FIN + 2.7)});
      tl.fromTo("#fin-src", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${r2(T_FIN + 2.6)});
` : `      tl.fromTo(["#sp-line", "#sp-glow"], { strokeDashoffset: ${spLen} }, { strokeDashoffset: 0, duration: 1.8, ease: "power2.inOut" }, ${r2(T_FIN + 1.4)});
${spVals.map((v, i) => `      tl.fromTo(["#sp-d${i}", "#sp-v${i}"], { opacity: 0, scale: 0.6, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, transformOrigin: "50% 50%", duration: 0.35, ease: "expo.out" }, ${r2(T_FIN + 1.4 + (1.8 * i) / (spVals.length - 1))});`).join("\n")}
      tl.fromTo("#fin-io .end", { textShadow: "0 0 0px rgba(232,160,32,0)" }, { textShadow: "0 0 40px rgba(232,160,32,.45)", duration: 0.4, ease: "power2.out" }, ${r2(T_FIN + 3.3)});
`}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
writeFileSync(here("../index.html"), html);
console.log(JSON.stringify({ source: SRC.split("/").pop(), finale_variant: FINALE, endLeases, endCover, placeholder: PLACEHOLDER, rows: rows.length, total: TOTAL, finale: T_FIN, navKind: NAVKIND, navStart, navEnd, deposit, withdrawal, takeTotal, notes: notes.slice(0, 160), warnings: warn }, null, 1));
