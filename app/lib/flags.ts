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

/**
 * `ACCELERATED_CLOCK` (env `NEXT_PUBLIC_ACCELERATED_CLOCK=1`, default off).
 * Set only when recording the warped-clock localnet simulation: the localnet
 * banner then reads "Local simulation · accelerated clock". Ignored off localnet.
 */
export const ACCELERATED_CLOCK = process.env.NEXT_PUBLIC_ACCELERATED_CLOCK === "1";

/**
 * `IN_APP_APPROVAL` (from `NEXT_PUBLIC_CLUSTER`, inlined at build time; on only
 * for `localnet`). Members approve, reject, cancel and execute Squads proposals
 * in the Squads app, never in this app (NEW-R3-1, NEW-R3-2; founder decision
 * 2026-10-29): /admin composes proposals and shows them decoded, read-only.
 * The localnet demo and the e2e keep in-app votes, because the Squads app
 * cannot reach a local validator. Not switchable by query, cookie or header.
 */
export const inAppApproval = (cluster: string | undefined) => cluster === "localnet";
/**
 * Exactly "localnet" (fails closed on any other spelling, which `parseCluster`
 * would still accept as localnet). The vote component may still ship in devnet
 * bundles, unrendered; the control is server-side: POST /api/squads answers
 * 404 and `composeProposalAction` refuses off localnet.
 */
export const IN_APP_APPROVAL = process.env.NEXT_PUBLIC_CLUSTER === "localnet";
