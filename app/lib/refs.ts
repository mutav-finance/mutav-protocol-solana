/**
 * 32-byte references the program stores as commitments (guarantee ids, notice
 * / invoice refs, PIX end-to-end ids). The pilot app derives most of them as
 * SHA-256 of a human label, so the demo can show "lease-001" while the chain
 * holds only the hash. Works in the browser and on the server.
 *
 * Data minimization (ADR 0019 decision 8): an agency id is an OPAQUE RANDOM
 * id the operator assigns and keeps (never a hash of the agency's name, which
 * anyone could recompute), and `refs_hash` is salted with a random salt the
 * operator keeps.
 */
import { bytesToHex } from "./serde";

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export const refHex = async (label: string) => bytesToHex(await sha256(label));

/** Namespaced so a lease label and an agency label never collide. */
export const REF = {
  guaranteeId: (lease: string) => refHex(`mutav:guarantee:${lease}`),
  /** Salted with `salt` (hex, held by the operator), so the hash cannot be recomputed from the lease alone. */
  refsHash: (lease: string, salt: string) => refHex(`mutav:refs:${salt}:${lease}`),
  notice: (notice: string) => refHex(`mutav:notice:${notice}`),
  invoice: (invoice: string) => refHex(`mutav:invoice:${invoice}`),
  /** An issuer income statement (ADR 0017). */
  income: (statement: string) => refHex(`mutav:income:${statement}`),
  pixE2e: (e2eId: string) => refHex(`pix:e2e:${e2eId}`),
};

/** 32 random bytes as hex: an opaque agency id, or a salt. */
export const randomRef = () => bytesToHex(crypto.getRandomValues(new Uint8Array(32)));

/**
 * The label after `label`: its trailing number plus one, zero-padded to the
 * same width (`MTV-PF-0009` → `MTV-PF-0010`). Without a trailing number, the
 * demo default `lease-demo-NNN` for entry `n`.
 */
export function nextRef(label: string, n: number): string {
  const m = /^(.*?)(\d+)$/.exec(label.trim());
  if (!m) return `lease-demo-${String(n).padStart(3, "0")}`;
  const next = String(Number(m[2]) + 1);
  return `${m[1]}${next.padStart(m[2]!.length, "0")}`;
}
