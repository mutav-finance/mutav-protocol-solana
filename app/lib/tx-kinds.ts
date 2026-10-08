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
      rent: bigint;
      defaultMultiplierBps: number;
      exitMultiplierBps: number;
      defaultCover: bigint;
      exitCover: bigint;
    }
  | { kind: "close_guarantee"; guarantee: string }
  | { kind: "contribute_fees"; invoiceRefHash: string; amount: bigint }
  /** ADR 0017: sweep one issuer income statement from the income inbox into the reserve. `period` is YYYYMM. */
  | { kind: "sweep_income"; incomeRefHash: string; period: number; amount: bigint }
  | { kind: "file_claim"; guarantee: string; leg: 0 | 1; amount: bigint; noticeRefHash: string }
  | { kind: "pay_claim"; guarantee: string; leg: 0 | 1; amount: bigint; noticeRefHash: string }
  | { kind: "settle_payout"; guarantee: string; noticeRefHash: string; pixE2eHash: string };

/** The allowlisted capital provider's instructions (spec §5.5); `seq` names the owner's request. */
export type InvestorTx =
  | { kind: "request_deposit"; assets: bigint }
  | { kind: "cancel_deposit"; seq: bigint }
  | { kind: "claim_shares"; seq: bigint }
  | { kind: "request_redeem"; shares: bigint }
  | { kind: "cancel_redeem"; seq: bigint }
  | { kind: "claim_assets"; seq: bigint };

export type PublicTx = { kind: "refresh" };

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

export type AdminTx =
  | { kind: "fulfil_deposits"; count: number }
  | { kind: "fulfil_redeems"; count: number; maxAssets: bigint }
  | { kind: "pause" }
  | { kind: "unpause" }
  | { kind: "clear_fulfil_halt" }
  | {
      kind: "set_config";
      coverageRatioBps?: number;
      caps?: Partial<Record<"maxTvl" | "maxCoverPerGuarantee" | "maxCoverPerAgency" | "maxClaimPerCall" | "maxClaimPerPeriod" | "minRequest" | "maxRequest" | "minFillAssets", bigint>>;
      /** `caps.max_tesouro_share_bps`: the most of stable assets `allocate` may put in TESOURO. */
      maxTesouroShareBps?: number;
      /** TESOURO price parameters (spec §7); blank fields carry over. */
      price?: PriceDraft;
      /** MUTAV's take from issuer income (ADR 0017); `≤ MAX_INCOME_TAKE_BPS`, 0 until spec §12 Q47. */
      incomeTakeBps?: number;
    }
  | { kind: "set_allowlist_root"; owners: string[] };

export type TxRequest = OperatorTx | InvestorTx | PublicTx | AdminTx;
export type TxKind = TxRequest["kind"];

export const ADMIN_KINDS: ReadonlySet<TxKind> = new Set([
  "fulfil_deposits",
  "fulfil_redeems",
  "unpause",
  "clear_fulfil_halt",
  "set_config",
  "set_allowlist_root",
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
export function expectedSigner(kind: TxKind): "operator" | "admin" | "pauser-or-admin" | "investor" | "anyone" {
  if (OPERATOR_KINDS.has(kind)) return "operator";
  if (ADMIN_KINDS.has(kind)) return "admin";
  if (kind === "pause") return "pauser-or-admin";
  if (kind === "refresh") return "anyone";
  return "investor";
}
