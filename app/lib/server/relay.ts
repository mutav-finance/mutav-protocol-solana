/**
 * Relay of wallet-signed transactions, LOCALNET ONLY (the e2e smoke and local
 * demos). On devnet the connected wallet sends through its own RPC with
 * `solana:signAndSendTransaction`, and /api/tx/send refuses.
 *
 * The relay holds no key and adds no signature. It refuses anything that is
 * not a pilot transaction, so it cannot serve as an open relay (A1):
 * - every top-level instruction is MUTAV, Squads or Compute Budget (bare
 *   System and Token transfers are refused);
 * - at least one instruction is MUTAV or Squads;
 * - every Squads instruction acts on the configured multisig;
 * - the body is small, and every signature slot is filled.
 */
import {
  getBase64Encoder,
  getCompiledTransactionMessageDecoder,
  getTransactionDecoder,
  type Address,
} from "@solana/kit";

export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

/** A wire transaction is at most 1,232 bytes (≈1,644 base64 chars); the JSON body adds little. */
export const MAX_RELAY_BODY_BYTES = 4096;

export class RelayRefusedError extends Error {
  override name = "RelayRefusedError";
}

type CompiledIx = { programAddressIndex: number; accountIndices?: number[] };

function decodeMessage(wireBase64: string) {
  const bytes = getBase64Encoder().encode(wireBase64);
  const tx = getTransactionDecoder().decode(bytes);
  const msg = getCompiledTransactionMessageDecoder().decode(tx.messageBytes) as unknown as {
    instructions?: CompiledIx[];
    staticAccounts: string[];
  };
  // The app composes legacy/v0 messages; anything else is refused.
  if (!msg.instructions) throw new RelayRefusedError("unsupported transaction message version");
  return { tx, msg: msg as { instructions: CompiledIx[]; staticAccounts: string[] } };
}

/** Programs the transaction invokes (top-level instructions). */
export function invokedPrograms(wireBase64: string): string[] {
  const { msg } = decodeMessage(wireBase64);
  return msg.instructions.map((ix) => msg.staticAccounts[ix.programAddressIndex] as string);
}

/** Every signature slot is filled (no all-zero signature). */
export function isFullySigned(wireBase64: string): boolean {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wireBase64));
  return Object.values(tx.signatures).every((s) => s !== null && !(s as Uint8Array).every((b) => b === 0));
}

export type RelayRules = {
  /** The MUTAV program id. */
  mutav: string | Address;
  /** The Squads v4 program id. */
  squadsProgram: string;
  /** The configured multisig; Squads instructions on any other one are refused. Null: no Squads instruction is relayed. */
  squadsMultisig: string | Address | null;
};

export function assertRelayable(wireBase64: string, rules: RelayRules) {
  const { msg } = decodeMessage(wireBase64);
  const mutav = String(rules.mutav);
  let pilot = 0;
  for (const ix of msg.instructions) {
    const program = msg.staticAccounts[ix.programAddressIndex];
    if (program === mutav) {
      pilot++;
    } else if (program === rules.squadsProgram) {
      // Every Squads v4 instruction the app composes takes the multisig as its first account.
      const first = ix.accountIndices?.[0];
      const target = first === undefined ? undefined : msg.staticAccounts[first];
      if (!rules.squadsMultisig || target !== String(rules.squadsMultisig)) {
        throw new RelayRefusedError(`refusing to relay a Squads instruction for multisig ${target ?? "(none)"}: only the configured multisig`);
      }
      pilot++;
    } else if (program !== COMPUTE_BUDGET_PROGRAM) {
      throw new RelayRefusedError(`refusing to relay a transaction for program ${program}`);
    }
  }
  if (pilot === 0) throw new RelayRefusedError("refusing to relay a transaction with no MUTAV or Squads instruction");
  if (!isFullySigned(wireBase64)) throw new RelayRefusedError("transaction is not fully signed");
}

/** Read a request body, refusing one larger than `max` bytes (declared or actual). */
export async function boundedBody(req: Request, max = MAX_RELAY_BODY_BYTES): Promise<string> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > max) throw new RelayRefusedError(`request body over ${max} bytes`);
  const text = await req.text();
  if (new TextEncoder().encode(text).length > max) throw new RelayRefusedError(`request body over ${max} bytes`);
  return text;
}
