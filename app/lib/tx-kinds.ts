/**
 * The transactions the app can compose, as sent from the browser to
 * /api/tx/build. 32-byte references travel as hex; amounts as bigint.
 * Shared by the server composer and the client forms.
 */
export type OperatorTx =
  | {
      kind: "register_guarantee";
      id: string;
      agencyId: string;
      refsHash: string;
      defaultCover: bigint;
      exitCover: bigint;
    }
  /** `reason`: 1 RELEASED (default), 2 VOID: nothing paid (ADR 0020). */
  | { kind: "close_guarantee"; guarantee: string; reason?: 1 | 2 }
  | { kind: "contribute_fees"; invoiceRefHash: string; amount: bigint }
  /** ADR 0017: sweep one issuer income statement from the income inbox into the reserve. `period` is YYYYMM. */
  | { kind: "sweep_income"; incomeRefHash: string; period: number; amount: bigint }
  | { kind: "file_claim"; guarantee: string; leg: 1 | 2; amount: bigint; noticeRefHash: string }
  /** Pays exactly the filing's provision: `amount` is sent as `expected_amount` (ADR 0021); `leg` is read from the filing. */
  | { kind: "pay_claim"; guarantee: string; leg: 1 | 2; amount: bigint; noticeRefHash: string }
  | { kind: "settle_payout"; guarantee: string; noticeRefHash: string; pixE2eHash: string };

/** The allowlisted capital provider's instructions (spec §5.5); `seq` names the owner's request. */
export type InvestorTx =
  /** `minSharesOut`: the owner's price limit (ADR 0023); 0 or absent = none. */
  | { kind: "request_deposit"; assets: bigint; minSharesOut?: bigint }
  | { kind: "cancel_deposit"; seq: bigint }
  | { kind: "claim_shares"; seq: bigint }
  /** `minAssetsOut`: the owner's price limit (ADR 0023); 0 or absent = none. */
  | { kind: "request_redeem"; shares: bigint; minAssetsOut?: bigint }
  | { kind: "cancel_redeem"; seq: bigint }
  | { kind: "claim_assets"; seq: bigint };

export type PublicTx =
  | { kind: "refresh" }
  /**
   * Permissionless crank (spec §5.8, ADR 0026): moves a queue head over dead
   * seqs (parked or closed requests). No signer; the connected wallet pays the fee.
   * `max`: request accounts read, 1–24 (default 16).
   */
  | { kind: "advance_queue_head"; queue: "deposit" | "redeem"; max?: number };

/** The proposed operator or pauser key takes its role, signing itself (ADR 0020). 1 = operator, 2 = pauser. */
export type RoleTx = { kind: "accept_role"; role: 1 | 2 };

/** `PriceParams` fields the admin may change through `set_config` (spec §7). Addresses travel as base58. */
export type PriceDraft = Partial<{
  tesouroPriceAccount: string;
  p0: bigint;
  t0: bigint;
  yMaxBps: number;
  maxStalenessSecs: bigint;
  maxDeviationBps: number;
  maxNavMoveBps: number;
}>;

/** NAV per share range (`NAV_SCALE`) a fill or halt clear may run at (ADR 0023). */
export type NavBoundsDraft = { min: bigint; max: bigint };

export type AdminTx =
  /** `navBounds` defaults to the current NAV ± `DEFAULT_NAV_TOLERANCE_BPS`. */
  | { kind: "fulfil_deposits"; count: number; navBounds?: NavBoundsDraft }
  | { kind: "fulfil_redeems"; count: number; maxAssets: bigint; navBounds?: NavBoundsDraft }
  | { kind: "pause" }
  | { kind: "unpause" }
  | { kind: "clear_fulfil_halt"; navBounds?: NavBoundsDraft }
  | {
      kind: "set_config";
      coverageRatioBps?: number;
      /** MUTAV's take from each guarantee fee, `≤ MAX_FEE_TAKE_BPS` (3_000). */
      feeTakeBps?: number;
      /**
       * `stressBuffer` is left out on purpose: ADR 0028 locks it (R$19k,
       * `DEVNET_LOCKED`), so the app never proposes a change to it.
       */
      caps?: Partial<Record<"maxTvl" | "maxCoverPerGuarantee" | "maxClaimPerCall" | "maxClaimPerPeriod" | "minRequest" | "maxRequest", bigint>>;
      /** `caps.max_nav_move_bps`, the NAV-move guard (spec §7), 0–10_000. */
      maxNavMoveBps?: number;
    }
  /** The root of the server's ALLOWLIST (A9); `owners`, when sent, must be that same list or the server refuses. */
  | { kind: "set_allowlist_root"; owners?: string[] }
  /** Clear a pending handover before it is accepted (1 operator, 2 pauser, 3 admin). */
  | { kind: "cancel_pending"; role: 1 | 2 | 3 }
  /** Propose new operator and pauser keys (distinct from the admin and each other); each new key then signs `accept_role` (ADR 0020). */
  | { kind: "set_roles"; operator: string; pauser: string }
  /** Point claim payments at a new BRS token account (spec §2.1 checks run on-chain). */
  | { kind: "set_payments_account"; paymentsAccount: string }
  /** Pauser key or admin, no time lock: clears the operator at once. */
  | { kind: "revoke_operator" }
  /**
   * Approve the exact amount of a filed claim above `max_claim_per_call`
   * (ADR 0021). `filing` is the ClaimFiling address; the server re-reads it and
   * binds the amount to its provision and the revision to its revision.
   */
  | { kind: "approve_claim"; guarantee: string; filing: string }
  /**
   * Park a pending request (ADR 0030): `cancel_deposit` / `cancel_redeem`
   * signed by the admin, owner = the request's owner. Nothing moves; the owner
   * collects the escrow later.
   */
  | { kind: "park_deposit"; seq: bigint }
  | { kind: "park_redeem"; seq: bigint };

export type TxRequest = OperatorTx | InvestorTx | PublicTx | RoleTx | AdminTx;
export type TxKind = TxRequest["kind"];

export const ADMIN_KINDS: ReadonlySet<TxKind> = new Set([
  "fulfil_deposits",
  "fulfil_redeems",
  "unpause",
  "clear_fulfil_halt",
  "set_config",
  "set_allowlist_root",
  "set_roles",
  "set_payments_account",
  "cancel_pending",
  "approve_claim",
  "park_deposit",
  "park_redeem",
]);
export const OPERATOR_KINDS: ReadonlySet<TxKind> = new Set([
  "register_guarantee",
  "close_guarantee",
  "contribute_fees",
  "sweep_income",
  "file_claim",
  "pay_claim",
  "settle_payout",
]);

/** Which configured role the program checks as signer, for the UI warning. */
export function expectedSigner(kind: TxKind): "operator" | "admin" | "pauser-or-admin" | "investor" | "anyone" | "proposed key" {
  if (kind === "accept_role") return "proposed key";
  if (OPERATOR_KINDS.has(kind)) return "operator";
  if (ADMIN_KINDS.has(kind)) return "admin";
  if (kind === "pause" || kind === "revoke_operator") return "pauser-or-admin";
  if (kind === "refresh" || kind === "advance_queue_head") return "anyone";
  return "investor";
}

/**
 * Sentence-case names for the instructions the consoles send, shown on tabs
 * and buttons with the instruction name as a small mono sub-label.
 */
export const IX_LABEL: Record<string, string> = {
  register_guarantee: "Register guarantee",
  contribute_fees: "Guarantee fee",
  sweep_income: "Issuer income",
  file_claim: "File claim",
  pay_claim: "Pay claim",
  settle_payout: "Settle payout",
  close_guarantee: "Close guarantee",
  pause: "Pause",
  unpause: "Unpause",
  revoke_operator: "Revoke operator",
  clear_fulfil_halt: "Reopen queue fills",
  set_config: "Change settings",
  propose_role: "Propose keys",
  accept_role: "Accept role",
  cancel_pending: "Cancel handover",
  set_payments_account: "Set payments account",
  set_allowlist_root: "Set allowlist root",
  fulfil_deposits: "Fill deposits",
  fulfil_redeems: "Fill redemptions",
  park_deposit: "Set aside request",
  park_redeem: "Set aside request",
  advance_queue_head: "Advance queue head",
  approve_claim: "Approve claim",
};

/** The human label for an instruction name, or the name itself. */
export const ixLabel = (ix: string) => IX_LABEL[ix] ?? ix;
