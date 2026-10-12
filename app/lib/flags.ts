/**
 * Launch switches, inlined at build time.
 *
 * `CAPITAL_FORMS_PUBLIC` (env `NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC`, default on).
 * Demo: the /capital request form (Deposit and Redeem, amounts, preview,
 * limits) is visible to every visitor; on-chain actions stay allowlist-gated
 * (holders can always redeem, ADR 0023). Before launch, set it to `false` to
 * show the form only to allowlisted wallets (holders get redeem only).
 */
export const CAPITAL_FORMS_PUBLIC = process.env.NEXT_PUBLIC_CAPITAL_FORMS_PUBLIC !== "false";
