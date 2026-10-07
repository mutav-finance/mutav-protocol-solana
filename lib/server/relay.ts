/**
 * Relay of wallet-signed transactions to the configured cluster. The relay
 * holds no key and adds no signature; it refuses a transaction that touches a
 * program outside the pilot's set, so it cannot be used as an open relay.
 */
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from "@solana/kit";

export const SYSTEM_PROGRAMS = [
  "11111111111111111111111111111111",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
] as const;

export class RelayRefusedError extends Error {
  override name = "RelayRefusedError";
}

/** Programs the transaction invokes (top-level instructions). */
export function invokedPrograms(wireBase64: string): string[] {
  const bytes = getBase64Encoder().encode(wireBase64);
  const tx = getTransactionDecoder().decode(bytes);
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as {
    instructions?: { programAddressIndex: number }[];
    staticAccounts: string[];
  };
  // The app composes legacy/v0 messages; anything else is refused.
  if (!msg.instructions) throw new RelayRefusedError("unsupported transaction message version");
  return msg.instructions.map((ix) => msg.staticAccounts[ix.programAddressIndex] as string);
}

/** Every signature slot is filled (no all-zero signature). */
export function isFullySigned(wireBase64: string): boolean {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wireBase64));
  return Object.values(tx.signatures).every((s) => s !== null && !(s as Uint8Array).every((b) => b === 0));
}

export function assertRelayable(wireBase64: string, allowed: (string | Address)[]) {
  const ok = new Set<string>([...SYSTEM_PROGRAMS, ...allowed.map(String)]);
  const programs = invokedPrograms(wireBase64);
  const bad = programs.filter((p) => !ok.has(p));
  if (bad.length) throw new RelayRefusedError(`refusing to relay a transaction for program(s) ${bad.join(", ")}`);
  if (!isFullySigned(wireBase64)) throw new RelayRefusedError("transaction is not fully signed");
}
