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
