/**
 * Reserve assets on /admin: what the reserve holds (BRS and TESOURO), the
 * issuer income waiting in the inbox, who manages each, and what the
 * Reserve Admin can change today versus what is only in the spec.
 *
 * Pure functions over the decoded accounts (`ReserveView`, `Ledger`). Every
 * amount is an on-chain field or a sum of them; shares are layout and display
 * ratios of those fields, never a value the chain does not hold.
 */
import { isAddress } from "@solana/kit";
import { MAX_INCOME_TAKE_BPS, U64_MAX } from "@mutav-finance/mutav-protocol-solana";
import type { AdapterEntry, IncomeReceipt } from "@mutav-finance/mutav-protocol-solana";
import { bytesToHex } from "./serde";
import type { Role } from "./roles";
import type { PriceDraft } from "./tx-kinds";
import type { Ledger, ReserveView, Row } from "./view";

/** `10_000` bps = 100%: the bound `validate_params` puts on every bps field. */
export const BPS_MAX = 10_000;
/** `VaultConfig.adapters` slots (`MAX_ADAPTERS`, spec §12 Q33). */
export const ADAPTER_SLOTS = 8;
/** The default `Pubkey` (all zeros): an unset address field. */
export const UNSET_ADDRESS = "11111111111111111111111111111111";
const I64_MIN = -(1n << 63n);
const I64_MAX = (1n << 63n) - 1n;

// ── Composition ─────────────────────────────────────────────────────────────

export type AdapterRow = {
  slot: number;
  programId: string;
  assetMint: string;
  /** Max BRS-equivalent value allocated through this adapter (spec §3.9). */
  cap: bigint;
  /** BRS-equivalent value allocated now. */
  allocated: bigint;
  enabled: boolean;
};

/** The used slots of `VaultConfig.adapters`; an empty slot has a zero program id. */
export function adapterRows(adapters: readonly AdapterEntry[]): AdapterRow[] {
  return adapters
    .map((a, slot) => ({ slot, programId: a.programId, assetMint: a.assetMint, cap: a.cap, allocated: a.allocated, enabled: a.enabled }))
    .filter((a) => a.programId !== UNSET_ADDRESS);
}

export type Composition = {
  /** `VaultState.brs_balance`: BRS the program tracks in `reserve`. */
  brs: bigint;
  /** `tesouro_units` valued at the bounded price (client math mirror of `refresh`). */
  tesouroValue: bigint;
  tesouroUnits: bigint;
  /** `brs + tesouroValue`: what counts toward NAV and coverage. */
  stableAssets: bigint;
  /** Issuer income in the inbox: paid by Nora, not swept, counted nowhere. */
  inbox: bigint;
  /** Share of stable assets, in bps; null while the reserve holds nothing. */
  brsShareBps: bigint | null;
  tesouroShareBps: bigint | null;
  /** `caps.max_tesouro_share_bps`. */
  capBps: number;
  /** The most TESOURO value the cap allows at today's stable assets. */
  capValue: bigint;
  /** How much more TESOURO value the cap would allow now (≥ 0). */
  capRoom: bigint;
  /** TESOURO value ÷ the cap's value, in bps; null when the cap allows nothing. */
  capUsedBps: bigint | null;
  overCap: boolean;
  adapters: AdapterRow[];
  /** Why TESOURO is 0 today, in plain words; null when the reserve holds TESOURO. */
  tesouroZeroReason: string | null;
};

const shareBps = (part: bigint, whole: bigint) => (whole === 0n ? null : (part * 10_000n) / whole);

export function reserveComposition(r: Pick<ReserveView, "state" | "config" | "solvency" | "incomeInbox">): Composition {
  const brs = r.state.brsBalance;
  const tesouroValue = r.solvency.tesouroValue;
  const stableAssets = brs + tesouroValue;
  const capBps = r.config.caps.maxTesouroShareBps;
  const capValue = (BigInt(capBps) * stableAssets) / 10_000n;
  const adapters = adapterRows(r.config.adapters);
  const enabled = adapters.filter((a) => a.enabled);
  let tesouroZeroReason: string | null = null;
  if (tesouroValue === 0n) {
    const why: string[] = [];
    if (enabled.length === 0) why.push("no TESOURO adapter is whitelisted");
    if (capBps === 0) why.push("the TESOURO share cap is 0%");
    why.push("allocate is not in this program binary");
    tesouroZeroReason = `${why.join(", ")}.`.replace(/^./, (c) => c.toUpperCase());
  }
  return {
    brs,
    tesouroValue,
    tesouroUnits: r.state.tesouroUnits,
    stableAssets,
    inbox: r.incomeInbox.amount,
    brsShareBps: shareBps(brs, stableAssets),
    tesouroShareBps: shareBps(tesouroValue, stableAssets),
    capBps,
    capValue,
    capRoom: capValue > tesouroValue ? capValue - tesouroValue : 0n,
    capUsedBps: capValue === 0n ? null : (tesouroValue * 10_000n) / capValue,
    overCap: tesouroValue > capValue,
    adapters,
    tesouroZeroReason,
  };
}

// ── Who does what ───────────────────────────────────────────────────────────

/** "external": Nora, the BRS issuer, outside the program's roles. */
export type Actor = Role | "external";

export type Duty = {
  actor: Actor;
  /** The instruction it signs, if any; null for a plain transfer. */
  ix: string | null;
  action: string;
  /** In this program binary (true), or spec only (false). */
  live: boolean;
  href?: string;
};

/** Who acts on where the reserve's assets sit. Income flows are under Money in & out. */
export const RESERVE_ASSET_DUTIES: readonly Duty[] = [
  { actor: "admin", ix: "set_config", live: true, href: "#allocation-controls", action: "Sets the TESOURO share cap and the TESOURO price account and its bounds. Squads proposal, time-locked." },
  { actor: "admin", ix: "allocate", live: false, href: "#allocation-planned", action: "Whitelists TESOURO adapters, allocates BRS to TESOURO and deallocates back. Planned: not in this program binary." },
  { actor: "anyone", ix: "refresh", live: true, action: "Re-values the reserve: reads and bounds the TESOURO price, recomputes stable assets, NAV and the mode." },
];

// ── Planned (spec only) ─────────────────────────────────────────────────────

export type PlannedInstruction = {
  ix: string;
  args: string;
  role: Role;
  what: string;
  gatedBy: string[];
  spec: string;
};

/**
 * Reserve-allocation instructions the spec gives the Reserve Admin (§2, §5.1,
 * §5.7) that this program binary does not have. A test checks them against
 * the spec's role table and `lib.rs`.
 */
export const PLANNED_RESERVE_INSTRUCTIONS: readonly PlannedInstruction[] = [
  {
    ix: "whitelist_adapter",
    args: "program_id, asset_mint, cap",
    role: "admin",
    what: "Adds a TESOURO adapter to VaultConfig.adapters, with its cap: the most BRS-equivalent value it may ever hold.",
    gatedBy: ["Squads time lock", `at most ${ADAPTER_SLOTS} adapters`],
    spec: "§5.1",
  },
  {
    ix: "remove_adapter",
    args: "program_id",
    role: "admin",
    what: "Removes an adapter from the whitelist.",
    gatedBy: ["Squads time lock", "nothing still allocated (allocated = 0)"],
    spec: "§5.1",
  },
  {
    ix: "allocate",
    args: "adapter_program, amount",
    role: "admin",
    what: "Moves BRS from the reserve into TESOURO through a whitelisted adapter.",
    gatedBy: [
      "TESOURO share cap: TESOURO value after ≤ max_tesouro_share_bps × stable assets",
      "adapter cap: allocated + amount ≤ the adapter's cap",
      "solvency gate: mode Normal, stable assets after ≥ coverage required",
      "liquidity: BRS left ≥ open provisions (+ earmark)",
      "fresh TESOURO price; not paused",
    ],
    spec: "§5.7",
  },
  {
    ix: "deallocate",
    args: "adapter_program, tesouro_units",
    role: "admin",
    what: "Brings TESOURO back into BRS in the reserve: the de-risking move.",
    gatedBy: [
      "solvency gate: any value lost must fit in free capital",
      "under-coverage: allowed only if it does not worsen coverage",
      "fresh TESOURO price; not paused",
    ],
    spec: "§5.7",
  },
];

export const PLANNED_BLOCKER =
  "There is no BRS↔TESOURO path on Solana yet: Etherfuse mints and redeems TESOURO against USDC, not BRS. Until a venue exists, the adapter and these four instructions ship in a later program upgrade. Today the reserve is 100% BRS.";

// ── Admin controls (set_config) ─────────────────────────────────────────────

/** An integer in `[min, max]`, or null. Blank, decimals and junk are null. */
export function parseIntIn(input: string, min: bigint, max: bigint): bigint | null {
  const s = input.trim().replace(/_/g, "");
  if (!/^-?\d+$/.test(s)) return null;
  const v = BigInt(s);
  return v < min || v > max ? null : v;
}

/** A bps value in `[0, max]`, as a number, or null. */
export const parseBps = (input: string, max = BPS_MAX): number | null => {
  const v = parseIntIn(input, 0n, BigInt(max));
  return v === null ? null : Number(v);
};

/** The TESOURO share cap control: 0–10_000 bps (`validate_params`). */
export const tesouroCapRequest = (input: string) => {
  const v = parseBps(input);
  return v === null ? null : ({ kind: "set_config", maxTesouroShareBps: v } as const);
};

/** The income-take control: `≤ MAX_INCOME_TAKE_BPS`, which is 0 until spec §12 Q47 is decided. */
export const incomeTakeRequest = (input: string) => {
  const v = parseBps(input, MAX_INCOME_TAKE_BPS);
  return v === null ? null : ({ kind: "set_config", incomeTakeBps: v } as const);
};

/** What each TESOURO price parameter does and the bound `validate_params` enforces (spec §7). */
export const PRICE_PARAM_INFO: Record<keyof PriceDraft, { field: string; label: string; meaning: string; bound: string }> = {
  tesouroPriceAccount: { field: "price.tesouro_price_account", label: "TESOURO price account", meaning: "Etherfuse's on-chain price account that refresh reads for TESOURO.", bound: "any address (unset = 1111…1111)" },
  p0: { field: "price.p0", label: "Reference price p0", meaning: "Start of the accrual curve that caps the price: BRS base units per TESOURO base unit × 10⁹.", bound: "u64" },
  t0: { field: "price.t0", label: "Reference time t0", meaning: "When p0 was observed (unix seconds).", bound: "i64" },
  yMaxBps: { field: "price.y_max_bps", label: "Max annual yield y max", meaning: "Slope of the accrual curve: TESOURO is valued at min(on-chain price, p0 × (1 + y max)^years).", bound: "0–10000 bps" },
  maxStalenessSecs: { field: "price.max_staleness_secs", label: "Max staleness", meaning: "A price older than this is stale: gated instructions refuse to run on it.", bound: "≥ 0 s" },
  maxDeviationBps: { field: "price.max_deviation_bps", label: "Max deviation", meaning: "A price that moved more than this against the last accepted one is rejected until admin review.", bound: "0–10000 bps" },
  maxNavMoveBps: { field: "price.max_nav_move_bps", label: "Max NAV move per refresh", meaning: "A larger move of NAV per share (net of fees and swept income) halts the capital queue until clear_fulfil_halt.", bound: "0–10000 bps" },
};

export type PriceFields = Record<keyof PriceDraft, string>;
export const PRICE_FIELDS: readonly (keyof PriceDraft)[] = ["tesouroPriceAccount", "p0", "t0", "yMaxBps", "maxStalenessSecs", "maxDeviationBps", "maxNavMoveBps"];

/**
 * The price-parameter control. Blank fields carry over; a filled field must
 * be in the program's bound. Returns the fields in error, and a request only
 * when at least one field is filled and none is in error.
 */
export function priceRequest(f: Partial<PriceFields>): { request: { kind: "set_config"; price: PriceDraft } | null; errors: (keyof PriceDraft)[] } {
  const price: PriceDraft = {};
  const errors: (keyof PriceDraft)[] = [];
  const filled = (k: keyof PriceDraft) => (f[k] ?? "").trim() !== "";
  if (filled("tesouroPriceAccount")) {
    const a = f.tesouroPriceAccount!.trim();
    if (isAddress(a)) price.tesouroPriceAccount = a;
    else errors.push("tesouroPriceAccount");
  }
  const int = (k: "p0" | "t0" | "maxStalenessSecs", min: bigint, max: bigint) => {
    if (!filled(k)) return;
    const v = parseIntIn(f[k]!, min, max);
    if (v === null) errors.push(k);
    else price[k] = v;
  };
  int("p0", 0n, U64_MAX);
  int("t0", I64_MIN, I64_MAX);
  int("maxStalenessSecs", 0n, I64_MAX);
  for (const k of ["yMaxBps", "maxDeviationBps", "maxNavMoveBps"] as const) {
    if (!filled(k)) continue;
    const v = parseBps(f[k]!);
    if (v === null) errors.push(k);
    else price[k] = v;
  }
  const any = Object.keys(price).length > 0;
  return { request: any && errors.length === 0 ? { kind: "set_config", price } : null, errors };
}

/**
 * The program's bound on each reserve-asset field of `set_config`, checked
 * again by the server before composing (the program checks it last).
 */
export function reserveConfigError(req: { maxTesouroShareBps?: number; incomeTakeBps?: number; price?: PriceDraft }): string | null {
  const bps = (v: number | undefined, max: number) => v !== undefined && (!Number.isInteger(v) || v < 0 || v > max);
  if (bps(req.maxTesouroShareBps, BPS_MAX)) return "max_tesouro_share_bps must be 0–10000";
  if (bps(req.incomeTakeBps, MAX_INCOME_TAKE_BPS))
    return `income_take_bps must be ≤ MAX_INCOME_TAKE_BPS (${MAX_INCOME_TAKE_BPS}): the cap is undecided (spec §12 Q47), so the program refuses any non-zero take`;
  const p = req.price ?? {};
  if (bps(p.yMaxBps, BPS_MAX) || bps(p.maxDeviationBps, BPS_MAX) || bps(p.maxNavMoveBps, BPS_MAX)) return "price bps fields must be 0–10000";
  if (p.maxStalenessSecs !== undefined && p.maxStalenessSecs < 0n) return "price.max_staleness_secs must be ≥ 0";
  if (p.p0 !== undefined && (p.p0 < 0n || p.p0 > U64_MAX)) return "price.p0 must fit in a u64";
  if (p.tesouroPriceAccount !== undefined && !isAddress(p.tesouroPriceAccount)) return "price.tesouro_price_account is not an address";
  return null;
}

// ── Issuer income ───────────────────────────────────────────────────────────

export type IncomeSweep = {
  address: string;
  period: number;
  ref: string;
  gross: bigint;
  take: bigint;
  net: bigint;
  slot: bigint;
  blockTime: bigint | null;
};

export type IncomeSummary = {
  inbox: bigint;
  inboxAddress: string;
  inboxExists: boolean;
  /** `VaultState.income_total`: net swept into the reserve, lifetime. */
  sweptNet: bigint;
  /** `VaultState.income_take_total`: MUTAV's take, lifetime. */
  sweptTake: bigint;
  takeBps: number;
  /** Swept statements, newest first, at most `limit`. */
  last: IncomeSweep[];
  receipts: number;
};

export function incomeSummary(
  r: Pick<ReserveView, "state" | "config" | "incomeInbox">,
  income: Ledger["income"] | (Row<IncomeReceipt> & { blockTime: bigint | null })[],
  limit = 6,
): IncomeSummary {
  const sweeps = income
    .map(({ address, data, blockTime }) => ({
      address,
      period: data.period,
      ref: bytesToHex(Uint8Array.from(data.incomeRefHash)),
      gross: data.gross,
      take: data.take,
      net: data.net,
      slot: data.slot,
      blockTime,
    }))
    .sort((a, b) => (b.slot > a.slot ? 1 : b.slot < a.slot ? -1 : 0));
  return {
    inbox: r.incomeInbox.amount,
    inboxAddress: r.incomeInbox.address,
    inboxExists: r.incomeInbox.exists,
    sweptNet: r.state.incomeTotal,
    sweptTake: r.state.incomeTakeTotal,
    takeBps: r.config.incomeTakeBps,
    last: sweeps.slice(0, limit),
    receipts: sweeps.length,
  };
}
