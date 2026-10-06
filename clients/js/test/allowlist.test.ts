import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { address } from '@solana/kit';
import { allowlistLeaf, allowlistNode, buildAllowlist, verifyAllowlistProof, MAX_ALLOWLIST_PROOF_LEN } from '../src';
import { hex, unhex, vectors } from './vectors';

const fixturePath = join(import.meta.dir, '..', '..', '..', 'tests', 'fixtures', 'client', 'allowlist-proofs.json');

describe('allowlist encoding matches the program', () => {
  test('leaf = sha256(0x00 || owner)', async () => {
    for (const { owner, leaf } of vectors.allowlist.leaves) {
      expect(hex(await allowlistLeaf(address(owner)))).toBe(leaf);
    }
  });

  test('node = sha256(0x01 || min || max), order-independent', async () => {
    for (const { a, b, node } of vectors.allowlist.nodes) {
      expect(hex(await allowlistNode(unhex(a), unhex(b)))).toBe(node);
      expect(hex(await allowlistNode(unhex(b), unhex(a)))).toBe(node);
    }
    expect(MAX_ALLOWLIST_PROOF_LEN).toBe(vectors.constants.maxAllowlistProofLen);
  });
});

describe('buildAllowlist', () => {
  const owners = vectors.allowlist.leaves.map((l: { owner: string }) => address(l.owner));

  test.each([1, 2, 3, 4, 5])('every proof verifies in a tree of %i', async (n) => {
    const t = await buildAllowlist(owners.slice(0, n));
    for (const o of owners.slice(0, n)) {
      expect(await verifyAllowlistProof(t.root, o, t.proofs.get(o)!)).toBe(true);
    }
    if (n < owners.length) {
      expect(await verifyAllowlistProof(t.root, owners[n]!, t.proofs.get(owners[0]!)!)).toBe(false);
    }
  });

  test('a single owner: root is its leaf, proof is empty', async () => {
    const t = await buildAllowlist([owners[0]!]);
    expect(hex(t.root)).toBe(hex(await allowlistLeaf(owners[0]!)));
    expect(t.proofs.get(owners[0]!)).toEqual([]);
  });

  test('order and duplicates do not change the root', async () => {
    const a = await buildAllowlist(owners);
    const b = await buildAllowlist([...owners].reverse().concat(owners[0]!));
    expect(hex(a.root)).toBe(hex(b.root));
  });

  test('an empty list is refused (a zero root allowlists nobody)', async () => {
    expect(buildAllowlist([])).rejects.toThrow();
  });

  test('a zero root never verifies', async () => {
    expect(await verifyAllowlistProof(new Uint8Array(32), owners[0]!, [])).toBe(false);
  });

  test('reproduces the committed fixture the program verifies', async () => {
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    for (const tree of fixture.trees) {
      const t = await buildAllowlist(tree.proofs.map((p: { owner: string }) => address(p.owner)));
      expect(hex(t.root)).toBe(tree.root);
      for (const p of tree.proofs) {
        expect(t.proofs.get(address(p.owner))!.map(hex)).toEqual(p.proof);
      }
    }
  });
});
