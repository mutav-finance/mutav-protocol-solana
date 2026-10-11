/**
 * Why a capital queue head would not fill now (Q-2 / F10: the pilot fills
 * whole requests in FIFO order, so one head that does not fit stops the
 * queue), in the program's check order (`fulfil_deposits.rs`,
 * `fulfil_redeems.rs`). A PREVIEW from the client's math mirror on the
 * current accounts: the program decides at execution, at that moment's NAV.
 *
 * Plus the admin's own rule for deposit fills: the head's owner must still
 * be on the current allowlist (a de-listed owner's deposit is cancelled, not
 * filled).
 */
import { assetsFor, sharesFor, type VaultConfig, type VaultState } from "@mutav-finance/mutav-protocol-solana";
import { fmtBrs, fmtShares } from "./format";
import { capitalQueue, type Ledger } from "./view";

type Solv = { netAssets: bigint; stableAssets: bigint; freeCapital: bigint; liquidBudget: bigint };

export type HeadStatus = {
  side: "deposit" | "redeem";
  seq: bigint;
  owner: string;
  /** Deposit: BRS in; redeem: BRS out at NAV now (preview). */
  value: bigint;
  /** Deposit: shares at NAV now; redeem: shares escrowed. */
  shares: bigint;
  /** The owner's price limit (0 = none): min shares out, or min BRS out. */
  limit: bigint;
  /** Plain-English reasons the head would not fill now; empty = it would. */
  stuck: string[];
};

const lim = (side: "deposit" | "redeem", limit: bigint) => (side === "deposit" ? `${fmtShares(limit)} shares` : fmtBrs(limit));

export function depositHead(
  config: Pick<VaultConfig, "paused" | "caps">,
  state: Pick<VaultState, "depositHead" | "redeemHead" | "sharesOutstanding" | "fulfilHalted">,
  sol: Solv,
  ledger: Pick<Ledger, "deposits" | "redeems">,
  allowlist: readonly string[] | null,
): HeadStatus | null {
  const head = capitalQueue(state, ledger).deposits[0];
  if (!head) return null;
  const req = ledger.deposits.find((d) => d.address === head.address)!.data;
  const shares = sharesFor(req.assets, state.sharesOutstanding, sol.netAssets);
  const stuck: string[] = [];
  if (config.paused) stuck.push("the reserve is paused");
  if (state.fulfilHalted) stuck.push("fulfilment is halted by the NAV-move guard: clear_fulfil_halt first");
  if (shares === 0n) stuck.push("it would mint 0 shares at NAV now");
  else if (req.minSharesOut > 0n && shares < req.minSharesOut) stuck.push(`its price limit is not met: ${fmtShares(shares)} shares at NAV now, the owner asks for at least ${lim("deposit", req.minSharesOut)}. The owner or the admin cancels it, or the price recovers`);
  if (sol.stableAssets + req.assets > config.caps.maxTvl) stuck.push(`the reserve would pass max TVL: ${fmtBrs(sol.stableAssets)} + ${fmtBrs(req.assets)} > ${fmtBrs(config.caps.maxTvl, 0)}`);
  if (allowlist && !allowlist.includes(req.owner)) stuck.push("its owner is not on the current allowlist: cancel it (the admin can) instead of filling it");
  return { side: "deposit", seq: req.seq, owner: req.owner, value: req.assets, shares, limit: req.minSharesOut, stuck };
}

export function redeemHead(
  config: Pick<VaultConfig, "paused">,
  state: Pick<VaultState, "depositHead" | "redeemHead" | "sharesOutstanding" | "fulfilHalted" | "mode">,
  sol: Solv,
  ledger: Pick<Ledger, "deposits" | "redeems">,
  maxAssets: bigint | null = null,
): HeadStatus | null {
  const head = capitalQueue(state, ledger).redeems[0];
  if (!head) return null;
  const req = ledger.redeems.find((r) => r.address === head.address)!.data;
  const value = assetsFor(req.shares, state.sharesOutstanding, sol.netAssets);
  const stuck: string[] = [];
  if (config.paused) stuck.push("the reserve is paused");
  if (state.mode !== 0) stuck.push("the reserve is under-covered: redemptions are frozen until coverage is back");
  if (state.fulfilHalted) stuck.push("fulfilment is halted by the NAV-move guard: clear_fulfil_halt first");
  if (value === 0n) stuck.push("it is worth 0 BRS at NAV now");
  const budget = [sol.freeCapital, sol.liquidBudget, ...(maxAssets !== null ? [maxAssets] : [])].reduce((a, b) => (b < a ? b : a));
  if (value > budget) {
    const which = budget === sol.freeCapital ? "free capital" : budget === sol.liquidBudget ? "the liquid balance net of provisions" : "the max BRS of this fill";
    stuck.push(`it needs ${fmtBrs(value)} and only ${fmtBrs(budget)} is available (${which}); whole requests only, so the queue waits behind it`);
  }
  if (req.minAssetsOut > 0n && value < req.minAssetsOut) stuck.push(`its price limit is not met: ${fmtBrs(value)} at NAV now, the owner asks for at least ${lim("redeem", req.minAssetsOut)}. The owner or the admin cancels it, or the price recovers`);
  return { side: "redeem", seq: req.seq, owner: req.owner, value, shares: req.shares, limit: req.minAssetsOut, stuck };
}

/** `preview` less `bps` (rounded down): a price limit with room for the NAV to move before the fill. */
export function limitWithSlippage(preview: bigint, bps: number): bigint {
  if (preview <= 0n) return 0n;
  return (preview * BigInt(10_000 - Math.min(Math.max(bps, 0), 10_000))) / 10_000n;
}

/**
 * The deposit seqs a fill may include: from the head, stopping before the
 * first request whose owner is off the current allowlist (the admin cancels
 * those rather than filling them). Returns how many to fill and the blocker.
 */
export function allowlistedFillCount(
  state: Pick<VaultState, "depositHead" | "redeemHead">,
  ledger: Pick<Ledger, "deposits" | "redeems">,
  allowlist: readonly string[],
  count: number,
): { count: number; blocked: { seq: bigint; owner: string } | null } {
  const q = capitalQueue(state, ledger).deposits.slice(0, count);
  const i = q.findIndex((r) => !allowlist.includes(r.owner));
  if (i === -1) return { count: Math.min(count, q.length || count), blocked: null };
  return { count: i, blocked: { seq: q[i]!.seq, owner: q[i]!.owner } };
}
