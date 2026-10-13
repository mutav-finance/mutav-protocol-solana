// Writes ../../ch3-ledger.placeholder.json: PLACEHOLDER data in the same schema as the real
// localnet-simulation ledger (ch3-ledger.json). Every number here is derived from the
// assumptions in `meta.assumptions`; nothing in it comes from a real run.
// Run from the project root: node tools/make-placeholder.mjs
import { writeFileSync } from "node:fs";

const A = {
  leases: 19,
  rent_brs: 1500,
  fee_rate_of_rent_per_month: 0.12,
  treasury_take_of_fee: 0.2,
  issuer_yield_per_year: 0.096,
  cover_per_lease_brs: 18000,
  coverage_ratio: 0.25,
  opening_reserve_brs: 280000, // PLACEHOLDER: capital already in the reserve before month 1 (seed), at share value 1.0000
  agencies: [
    ["Imobiliária Planalto", 7],
    ["Imobiliária Centro", 6],
    ["Imobiliária Serrana", 6],
  ],
  deposit_brs: 20000,
  claims: [
    { month: 2, ref: "MTV-PF-0104", agency: "Imobiliária Planalto", amount: 1500 },
    { month: 4, ref: "MTV-PF-0112", agency: "Imobiliária Centro", amount: 2300 },
  ],
};

const r2 = (x) => Math.round(x * 100) / 100;
const r6 = (x) => Math.round(x * 1e6) / 1e6;

// deterministic fake signatures (base58 alphabet), clearly placeholder
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const sig = () => Array.from({ length: 88 }, () => B58[Math.floor(rnd() * 58)]).join("");

let reserve = A.opening_reserve_brs;
let shares = A.opening_reserve_brs; // opened at 1.0000
let provisions = 0;
let providerShares = 0;
const required = () => r2(A.coverage_ratio * A.leases * A.cover_per_lease_brs + provisions);
const nav = () => r6((reserve - provisions) / shares);
const ceiling = () => r2((reserve - provisions) / A.coverage_ratio);

const ops = [];
const months = [];
const push = (m, day, type, extra) => {
  const yyyymm = 202700 + m;
  const ts = `2027-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}T12:00:00Z`;
  ops.push({
    month: m, yyyymm, ts, type, ...extra,
    reserve_after: r2(reserve), nav_after: nav(), nav_kind: "published",
    required_after: required(), ceiling_after: ceiling(), signature: sig(),
  });
};

for (let m = 1; m <= 6; m++) {
  const ms = { month: m, yyyymm: 202700 + m, reserve_start: r2(reserve), nav_start: nav(), fees_net: 0, issuer_income: 0, claims_paid: 0, take_to_treasury: 0 };

  if (m === 1) {
    const sh = A.deposit_brs / nav();
    shares += sh; providerShares += sh; reserve += A.deposit_brs;
    push(m, 2, "deposit", { agency: null, ref: "capital-provider-1", amount_brs: A.deposit_brs, shares: r6(sh) });
  }

  A.agencies.forEach(([name, n], k) => {
    const gross = n * A.rent_brs * A.fee_rate_of_rent_per_month;
    const take = gross * A.treasury_take_of_fee;
    const net = gross - take;
    reserve += net; ms.fees_net += net; ms.take_to_treasury += take;
    push(m, 5 + k * 5, "fee", { agency: name, ref: `INV-${202700 + m}-${k + 1}`, amount_brs: r2(net), gross_brs: r2(gross), leases: n });
  });

  for (const c of A.claims.filter((c) => c.month === m)) {
    provisions += c.amount;
    push(m, 18, "claim_filed", { agency: c.agency, ref: c.ref, amount_brs: 0, provision_brs: c.amount });
    reserve -= c.amount; provisions -= c.amount; ms.claims_paid += c.amount;
    push(m, 20, "claim_paid", { agency: c.agency, ref: c.ref, amount_brs: -c.amount });
  }

  const inc = reserve * (A.issuer_yield_per_year / 12);
  reserve += inc; ms.issuer_income += inc;
  push(m, 28, "issuer_income", { agency: null, ref: "BRS issuer revenue", amount_brs: r2(inc) });
  push(m, 30, "refresh", { agency: null, ref: "refresh_reserve", amount_brs: 0 });

  if (m === 6) {
    const out = providerShares * nav();
    reserve -= out; shares -= providerShares;
    push(m, 30, "withdrawal", { agency: null, ref: "capital-provider-1", amount_brs: r2(-out), shares: r6(-providerShares) });
  }

  Object.assign(ms, {
    fees_net: r2(ms.fees_net), issuer_income: r2(ms.issuer_income), claims_paid: r2(ms.claims_paid),
    take_to_treasury: r2(ms.take_to_treasury), reserve_end: r2(reserve), nav_end: nav(),
  });
  months.push(ms);
}

const out = {
  meta: {
    placeholder: true,
    title: "PLACEHOLDER: not a real simulation run. Replace with ch3-ledger.json from the localnet simulation.",
    generated_by: "ch3-flows/tools/make-placeholder.mjs",
    unit: "BRS (1 BRS = R$1)",
    nav_kind: "published",
    notes: [
      "PLACEHOLDER DATA.",
      "The treasury take (20% of each guarantee fee) is paid by the agency straight to the treasury; it is not a separate reserve op and never enters the reserve. fee.amount_brs is net of it; months[].take_to_treasury sums it.",
      "claim_filed books a provision (provision_brs): the published share value dips while no BRS moves. claim_paid then moves the BRS and releases the provision.",
      "Deposits and withdrawals convert at the share value and do not move it.",
    ],
    assumptions: A,
  },
  ops,
  months,
};
writeFileSync(new URL("../../ch3-ledger.placeholder.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
const last = months.at(-1);
console.log({ ops: ops.length, nav_end: last.nav_end, reserve_end: last.reserve_end, withdrawal: ops.at(-1).amount_brs });
