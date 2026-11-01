/**
 * Where members approve a proposal: in the Squads app, not in this app
 * (NEW-R3-1, NEW-R3-2; founder decision 2026-10-29).
 *
 * No deep link: the Squads app's proposal URL format is not documented, and
 * Squads' open-source v4 client (github.com/Squads-Protocol/public-v4-client)
 * has none either. It uses hash routes with no parameters (`/#/transactions`)
 * and keeps the multisig address and the RPC URL in the browser's
 * localStorage (keys `x-multisig-v4` and `x-rpc-url`, default mainnet), set
 * from its own screens. So the link opens the app and the text names the
 * multisig, the transaction index and, on devnet, how to point it at devnet.
 * Whether the hosted app.squads.so serves devnet is not confirmed, so the
 * link goes to the open-source client's repository, labelled as such.
 */
import type { Cluster } from "./cluster";

/** Squads' open-source v4 client: runs against any RPC (devnet included). */
export const SQUADS_PUBLIC_CLIENT_URL = "https://github.com/Squads-Protocol/public-v4-client";

export type SquadsApproval = {
  href: string;
  label: string;
  /** How to find the proposal there: there is no deep link. */
  steps: string;
};

/**
 * Where to approve proposal `index` of `multisig`, or null on localnet (the
 * Squads app cannot reach a local validator; in-app votes stay there).
 */
export function squadsApproval(cluster: Cluster, multisig: string, index: bigint): SquadsApproval | null {
  if (cluster === "localnet") return null;
  return {
    href: SQUADS_PUBLIC_CLIENT_URL,
    label: "Squads v4 client (open source)",
    steps: `Approve there, no deep link: build or open the Squads v4 client, set its RPC URL to a devnet RPC and its multisig to ${multisig}, then Transactions, #${index}.`,
  };
}

/** The one-line rule shown with every proposal. */
export const VERIFY_BEFORE_APPROVING =
  "Before approving, check this proposal with the local verification step: this decoded view comes from the same site that built it, so it is a cross-check, not proof.";
