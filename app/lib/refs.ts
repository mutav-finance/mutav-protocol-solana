/**
 * 32-byte references the program stores as commitments (guarantee ids, agency
 * ids, notice / invoice refs, PIX end-to-end ids). The pilot app derives them
 * as SHA-256 of a human label, so the demo can show "lease-001" while the
 * chain holds only the hash. Works in the browser and on the server.
 */
import { bytesToHex } from "./serde";

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export const refHex = async (label: string) => bytesToHex(await sha256(label));

/** Namespaced so a lease label and an agency label never collide. */
export const REF = {
  guaranteeId: (lease: string) => refHex(`mutav:guarantee:${lease}`),
  agencyId: (agency: string) => refHex(`mutav:agency:${agency}`),
  refsHash: (lease: string) => refHex(`mutav:refs:${lease}`),
  notice: (notice: string) => refHex(`mutav:notice:${notice}`),
  invoice: (invoice: string) => refHex(`mutav:invoice:${invoice}`),
  /** An issuer income statement (ADR 0017). */
  income: (statement: string) => refHex(`mutav:income:${statement}`),
  pixE2e: (e2eId: string) => refHex(`pix:e2e:${e2eId}`),
};
