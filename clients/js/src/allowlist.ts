/**
 * Investor allowlist Merkle tree (spec §5.5), matching `allowlist.rs`:
 *
 *   leaf(owner) = sha256(0x00 || owner)
 *   node(a, b)  = sha256(0x01 || min(a, b) || max(a, b))
 *
 * Sorted pairs, so a proof is a plain list of sibling hashes. Leaves are
 * sorted and de-duplicated, and a node without a sibling moves up unchanged,
 * so the root depends only on the set of owners. Hashing only; no keys.
 */
import { getAddressEncoder, type Address } from '@solana/kit';

/** Deepest proof the program accepts (2^32 leaves). */
export const MAX_ALLOWLIST_PROOF_LEN = 32;

const addressBytes = getAddressEncoder();

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
  const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

function compare(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return 0;
}

export const allowlistLeaf = (owner: Address) =>
  sha256(new Uint8Array([0]), new Uint8Array(addressBytes.encode(owner)));

export function allowlistNode(a: Uint8Array, b: Uint8Array): Promise<Uint8Array> {
  const [lo, hi] = compare(a, b) <= 0 ? [a, b] : [b, a];
  return sha256(new Uint8Array([1]), lo, hi);
}

export type Allowlist = {
  /** The value for `set_allowlist_root`. */
  root: Uint8Array;
  /** The `proof` argument of `request_deposit` / `request_redeem`, per owner. */
  proofs: Map<Address, Uint8Array[]>;
};

export async function buildAllowlist(owners: Address[]): Promise<Allowlist> {
  const unique = [...new Set(owners)];
  if (unique.length === 0) throw new Error('allowlist is empty (a zero root allowlists nobody)');
  const leaves = await Promise.all(unique.map(async (o) => ({ owner: o, hash: await allowlistLeaf(o) })));
  leaves.sort((x, y) => compare(x.hash, y.hash));

  const proofs = new Map<Address, Uint8Array[]>(unique.map((o) => [o, []]));
  // Each level: the hashes and, for each, the owners below it.
  let level = leaves.map((l) => ({ hash: l.hash, owners: [l.owner] }));
  while (level.length > 1) {
    const next: typeof level = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = level[i + 1];
      if (!b) {
        next.push(a); // no sibling: moves up unchanged
        continue;
      }
      for (const o of a.owners) proofs.get(o)!.push(b.hash);
      for (const o of b.owners) proofs.get(o)!.push(a.hash);
      next.push({ hash: await allowlistNode(a.hash, b.hash), owners: [...a.owners, ...b.owners] });
    }
    level = next;
  }
  for (const p of proofs.values()) {
    if (p.length > MAX_ALLOWLIST_PROOF_LEN) throw new Error('allowlist too large for the program');
  }
  return { root: level[0]!.hash, proofs };
}

/** The program's `verify`: a zero root or an over-deep proof never verifies. */
export async function verifyAllowlistProof(root: Uint8Array, owner: Address, proof: Uint8Array[]): Promise<boolean> {
  if (root.every((x) => x === 0) || proof.length > MAX_ALLOWLIST_PROOF_LEN) return false;
  let acc = await allowlistLeaf(owner);
  for (const p of proof) acc = await allowlistNode(acc, p);
  return compare(acc, root) === 0;
}
