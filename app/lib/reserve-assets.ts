/**
 * Reserve assets on /admin: what the reserve holds (BRS in the pilot; more
 * assets through adapters later, ADR 0018), the settlement floor, the issuer
 * income waiting in the inbox, and what the Reserve Admin can change today
 * versus what is only in the spec.
 *
 * Pure functions over the decoded accounts (`ReserveView`, `Ledger`). Every
 * amount is an on-chain field or a sum of them; shares are layout and display
 * ratios of those fields, never a value the chain does not hold.
 */
import type { IncomeReceipt } from "@mutav-finance/mutav-protocol-solana";
import { bytesToHex } from "./serde";
import type { Role } from "./roles";
import type { Ledger, ReserveView, Row } from "./view";

/** `10_000` bps = 100%: the bound `validate_params` puts on every bps field. */
export const BPS_MAX = 10_000;
/** `VaultConfig.adapters` slots (`MAX_ADAPTERS`, spec §12 Q33). */
export const ADAPTER_SLOTS = 8;
/** The default `Pubkey` (all zeros): an unset address field. */
export const UNSET_ADDRESS = "11111111111111111111111111111111";

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

/**
 * Whitelisted adapters. The program keeps no inline adapter list since
 * ADR 0019 (adapters are described by their `AdapterState` PDAs when built),
 * so the pilot has none.
 */
export function adapterRows(): AdapterRow[] {
  return [];
}

export type Composition = {
  /** `VaultState.brs_balance`: BRS, the settlement token, tracked in `reserve`. */
  brs: bigint;
  /** Value held through adapters at the bounded price (client math mirror of `refresh`). Today the single field `tesouro_units`. */
  adapterValue: bigint;
  adapterUnits: bigint;
  /** `brs + adapterValue`: what counts toward NAV and coverage. */
  stableAssets: bigint;
  /** Issuer income in the inbox: paid by Nora, not swept, counted nowhere. */
  inbox: bigint;
  /** Share of stable assets, in bps; null while the reserve holds nothing. */
  brsShareBps: bigint | null;
  adapterShareBps: bigint | null;
  /**
   * The settlement floor (ADR 0018): the minimum share of stable assets held
   * in BRS. 100% in the pilot: the program holds BRS only and has no floor
   * field since ADR 0019.
   */
  floorBps: number;
  /** The BRS the floor requires at today's stable assets. */
  floorValue: bigint;
  /** BRS above the floor: what all adapters together could still use. */
  roomAboveFloor: bigint;
  /** BRS below the floor (after a price move or a floor raise). */
  belowFloor: boolean;
  adapters: AdapterRow[];
  /** Why nothing is held through adapters, in plain words; null when something is. */
  brsOnlyReason: string | null;
  /** Nothing is held through an adapter: the pilot's BRS-only reserve (ADR 0018). */
  brsOnly: boolean;
};

const shareBps = (part: bigint, whole: bigint) => (whole === 0n ? null : (part * 10_000n) / whole);

/** No adapter holds anything allocated. */
const nothingAllocated = (adapters: AdapterRow[]) => adapters.every((a) => a.allocated === 0n);

export function reserveComposition(r: Pick<ReserveView, "state" | "config" | "solvency" | "incomeInbox">): Composition {
  const brs = r.state.brsBalance;
  // BRS only (ADR 0018, ADR 0019): no adapter value and a 100% floor.
  const adapterValue = 0n;
  const stableAssets = r.solvency.stableAssets;
  const floorBps = BPS_MAX;
  const floorValue = (BigInt(floorBps) * stableAssets + 9_999n) / 10_000n;
  const adapters = adapterRows();
  const enabled = adapters.filter((a) => a.enabled);
  let brsOnlyReason: string | null = null;
  if (adapterValue === 0n) {
    const why = ["the pilot reserve holds BRS only (ADR 0018)"];
    if (enabled.length === 0) why.push("no adapter is whitelisted");
    if (floorBps === BPS_MAX) why.push("the settlement floor is 100%");
    brsOnlyReason = `${why.join("; ")}.`.replace(/^./, (c) => c.toUpperCase());
  }
  return {
    brs,
    adapterValue,
    adapterUnits: 0n,
    stableAssets,
    inbox: r.incomeInbox.amount,
    brsShareBps: shareBps(brs, stableAssets),
    adapterShareBps: shareBps(adapterValue, stableAssets),
    floorBps,
    floorValue,
    roomAboveFloor: brs > floorValue ? brs - floorValue : 0n,
    belowFloor: brs < floorValue,
    adapters,
    brsOnlyReason,
    brsOnly: adapterValue === 0n && nothingAllocated(adapters),
  };
}

// ── Expanding with adapters ─────────────────────────────────────────────────

/** "external": an issuer outside the program's roles. */
export type Actor = Role | "external";

export type ExpansionStep = {
  actor: Actor;
  /** The instruction it takes, or null for a deploy outside the program. */
  ix: string | null;
  action: string;
  /** In this program binary (true), or spec only (false). */
  live: boolean;
};

/**
 * How a new asset joins the reserve (ADR 0018): step 1 is a program upgrade,
 * steps 2–4 are Squads proposals under the time lock, and step 5 (refresh) is
 * signed by anyone. A test checks each live step's signer against the program
 * and each planned one against the spec.
 */
export const EXPANSION_STEPS: readonly ExpansionStep[] = [
  { actor: "admin", ix: null, live: false, action: "Upgrade the program with the adapter instructions and deploy the asset's adapter program, after its own security review." },
  { actor: "admin", ix: "whitelist_adapter", live: false, action: "Whitelist the adapter with its limits: its cap (the most BRS-equivalent value it may hold), its share limit of stable assets, and its own price feed with staleness and deviation bounds." },
  { actor: "admin", ix: "set_config", live: true, action: "Lower the minimum held in the settlement token (BRS) below 100%: the share above the floor is what all adapters together may use." },
  { actor: "admin", ix: "allocate", live: false, action: "Allocate BRS into the asset above the settlement floor, within the adapter's cap and share limit, the solvency gate and the liquidity check; deallocate brings it back." },
  { actor: "anyone", ix: "refresh", live: true, action: "Re-value the reserve at the bounded price on every refresh: stable assets, NAV and the mode follow." },
];

export type AdapterCandidate = { asset: string; issuer: string; what: string; blocker: string };

/** Assets an adapter could add. A candidate, not a commitment (ADR 0018). */
export const ADAPTER_CANDIDATES: readonly AdapterCandidate[] = [
  {
    asset: "TESOURO",
    issuer: "Etherfuse",
    what: "Tokenized Brazilian federal bonds (Token-2022, on-chain BondPrice account).",
    blocker: "No BRS↔TESOURO path: Etherfuse mints and redeems against USDC. Its price-account layout is also unconfirmed (spec §12 Q2, Q6).",
  },
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
    what: "Adds an adapter to VaultConfig.adapters with its cap; with the first adapter upgrade, also its share limit and its own price feed (AdapterState).",
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
    what: "Moves BRS from the reserve into an adapter's asset (TESOURO first).",
    gatedBy: [
      "settlement floor: BRS after ≥ min_settlement_bps × stable assets",
      "adapter limits: allocated + amount ≤ its cap; its value ≤ its share limit",
      "solvency gate: mode Normal, stable assets after ≥ coverage required",
      "liquidity: BRS left ≥ open provisions (+ earmark)",
      "fresh price from the adapter's feed; not paused",
    ],
    spec: "§5.7",
  },
  {
    ix: "deallocate",
    args: "adapter_program, tesouro_units",
    role: "admin",
    what: "Brings an adapter's asset back into BRS in the reserve: the de-risking move.",
    gatedBy: [
      "solvency gate: any value lost must fit in free capital",
      "under-coverage: allowed only if it does not worsen coverage",
      "fresh price from the adapter's feed; not paused",
    ],
    spec: "§5.7",
  },
];

export const PLANNED_BLOCKER =
  "Step 1 is a program upgrade; steps 2–4 are Squads proposals under the time lock; refresh is signed by anyone. The four planned instructions ship in the upgrade that adds the first adapter (ADR 0018).";

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
  /** MUTAV's take on issuer income: always 0 (ADR 0019). */
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
      ref: bytesToHex(Uint8Array.from(data.refHash)),
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
    sweptTake: 0n,
    takeBps: 0,
    last: sweeps.slice(0, limit),
    receipts: sweeps.length,
  };
}
