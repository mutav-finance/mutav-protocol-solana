/**
 * Allowlist status of one wallet, against the on-chain root (spec §5.5:
 * every `request_*` carries a Merkle proof of `owner` against
 * `VaultConfig.investor_allowlist_root`). The proof is built with the client's
 * `buildAllowlist` from the server's public ALLOWLIST list, and checked with
 * the client's `verifyAllowlistProof` (the program's `verify`). Hashing only;
 * KYC happens off-chain, before an owner is added to the list.
 */
import { address, type Address } from "@solana/kit";
import { buildAllowlist, verifyAllowlistProof } from "@mutav-finance/mutav-protocol-solana";

export type AllowlistState =
  /** The proof verifies against the on-chain root: the wallet may request. */
  | "allowlisted"
  /** The root is set and matches ALLOWLIST, and this wallet is not on it. */
  | "not-listed"
  /** The on-chain root is zero: nobody is allowlisted (a zero root never verifies). */
  | "root-unset"
  /** ALLOWLIST does not hash to the on-chain root, so no proof can be built here. */
  | "list-mismatch";

export type AllowlistCheck = { state: AllowlistState; proof: Uint8Array[] | null };

const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((x, i) => x === b[i]);

export async function checkAllowlist(onChainRoot: ArrayLike<number>, listed: readonly string[], owner: string): Promise<AllowlistCheck> {
  const root = Uint8Array.from(onChainRoot);
  if (root.every((x) => x === 0)) return { state: "root-unset", proof: null };
  const owners = listed.map((x) => address(x));
  if (owners.length === 0) return { state: "list-mismatch", proof: null };
  const tree = await buildAllowlist(owners);
  if (!sameBytes(tree.root, root)) return { state: "list-mismatch", proof: null };
  const proof = tree.proofs.get(owner as Address) ?? null;
  if (!proof) return { state: "not-listed", proof: null };
  return (await verifyAllowlistProof(root, owner as Address, proof)) ? { state: "allowlisted", proof } : { state: "not-listed", proof: null };
}

/** Why a wallet cannot request, in the words the investor view and the composer use. */
export const ALLOWLIST_TEXT: Record<AllowlistState, string> = {
  allowlisted: "This wallet is on the allowlist: its Merkle proof verifies against the on-chain root.",
  "not-listed": "This wallet is not on the allowlist (KYC is done off-chain). It can read everything here but cannot send requests.",
  "root-unset": "The on-chain allowlist root is empty, so no wallet can send requests yet.",
  "list-mismatch": "The server's ALLOWLIST does not hash to the on-chain root, so no proof can be built. The Reserve Admin must update one or the other.",
};
