//! Investor allowlist Merkle proofs (spec §5.5): every `request_*` carries a
//! proof of `owner` against `VaultConfig.investor_allowlist_root`.
//!
//! Encoding (domain-separated SHA-256, sorted pairs, so a proof is a plain
//! list of sibling hashes):
//!
//! ```text
//! leaf(owner) = sha256(0x00 || owner)
//! node(a, b)  = sha256(0x01 || min(a, b) || max(a, b))
//! ```
//!
//! A zero root allowlists nobody (the state after `initialize`).

use anchor_lang::prelude::*;
use solana_sha256_hasher::hashv;

use crate::constants::MAX_ALLOWLIST_PROOF_LEN;

const LEAF_PREFIX: &[u8] = &[0];
const NODE_PREFIX: &[u8] = &[1];

/// The leaf of `owner`.
pub fn leaf(owner: &Pubkey) -> [u8; 32] {
    hashv(&[LEAF_PREFIX, owner.as_ref()]).to_bytes()
}

/// The parent of two nodes, order-independent.
pub fn node(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    hashv(&[NODE_PREFIX, lo, hi]).to_bytes()
}

/// `true` when `proof` proves `owner` against `root`. A zero root or a proof
/// deeper than `MAX_ALLOWLIST_PROOF_LEN` never verifies.
pub fn verify(root: &[u8; 32], owner: &Pubkey, proof: &[[u8; 32]]) -> bool {
    if *root == [0; 32] || proof.len() > MAX_ALLOWLIST_PROOF_LEN {
        return false;
    }
    let computed = proof.iter().fold(leaf(owner), |acc, p| node(&acc, p));
    computed == *root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_leaf_tree() {
        let a = Pubkey::new_unique();
        assert!(verify(&leaf(&a), &a, &[]));
        assert!(!verify(&leaf(&a), &Pubkey::new_unique(), &[]));
    }

    #[test]
    fn two_level_tree_in_either_order() {
        let (a, b, c) = (
            Pubkey::new_unique(),
            Pubkey::new_unique(),
            Pubkey::new_unique(),
        );
        let ab = node(&leaf(&a), &leaf(&b));
        let root = node(&ab, &leaf(&c));
        assert!(verify(&root, &a, &[leaf(&b), leaf(&c)]));
        assert!(verify(&root, &b, &[leaf(&a), leaf(&c)]));
        assert!(verify(&root, &c, &[ab]));
        assert!(!verify(&root, &c, &[leaf(&a)]));
        // A leaf cannot pose as an inner node (domain separation).
        assert_ne!(leaf(&a), node(&leaf(&a), &leaf(&a)));
    }

    #[test]
    fn zero_root_and_deep_proofs_fail() {
        let a = Pubkey::new_unique();
        assert!(!verify(&[0; 32], &a, &[]));
        let deep = vec![[1u8; 32]; MAX_ALLOWLIST_PROOF_LEN + 1];
        assert!(!verify(&leaf(&a), &a, &deep));
    }
}
