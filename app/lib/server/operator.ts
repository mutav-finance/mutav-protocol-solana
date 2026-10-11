/**
 * Recent operator activity, read from transaction history: the operator
 * key's last signatures, each decoded to the MUTAV instructions it called,
 * and the last operator acceptance (`accept_role`) found among VaultConfig's
 * recent transactions (ADR 0020).
 * Read-only. Confirmed transactions never change, so each is decoded once.
 */
import { getBase58Encoder, type Address } from "@solana/kit";
import {
  CLOSE_GUARANTEE_DISCRIMINATOR,
  CONTRIBUTE_FEES_DISCRIMINATOR,
  FILE_CLAIM_DISCRIMINATOR,
  PAY_CLAIM_DISCRIMINATOR,
  REFRESH_DISCRIMINATOR,
  REGISTER_GUARANTEE_DISCRIMINATOR,
  REVOKE_OPERATOR_DISCRIMINATOR,
  ACCEPT_ROLE_DISCRIMINATOR,
  PROPOSE_ROLE_DISCRIMINATOR,
  SETTLE_PAYOUT_DISCRIMINATOR,
  SWEEP_INCOME_DISCRIMINATOR,
} from "@mutav-finance/mutav-protocol-solana";
import { instructionName, type OperatorActivity } from "../operator";
import type { ReserveView } from "../view";
import { READ, rpcFor } from "./chain";
import type { ServerEnv } from "./env";

const TABLE = [
  ["register_guarantee", REGISTER_GUARANTEE_DISCRIMINATOR],
  ["close_guarantee", CLOSE_GUARANTEE_DISCRIMINATOR],
  ["contribute_fees", CONTRIBUTE_FEES_DISCRIMINATOR],
  ["sweep_income", SWEEP_INCOME_DISCRIMINATOR],
  ["file_claim", FILE_CLAIM_DISCRIMINATOR],
  ["pay_claim", PAY_CLAIM_DISCRIMINATOR],
  ["settle_payout", SETTLE_PAYOUT_DISCRIMINATOR],
  ["refresh", REFRESH_DISCRIMINATOR],
  ["propose_role", PROPOSE_ROLE_DISCRIMINATOR],
  ["accept_role", ACCEPT_ROLE_DISCRIMINATOR],
  ["revoke_operator", REVOKE_OPERATOR_DISCRIMINATOR],
] as const;

/** How far back each history read goes. */
export const ACTIVITY_LIMIT = 20;
export const ROLES_SCAN_LIMIT = 50;

type JsonTx = {
  blockTime: bigint | null;
  transaction: { message: { accountKeys: string[]; instructions: { programIdIndex: number; data: string }[] } };
  meta: { err: unknown; loadedAddresses?: { writable: string[]; readonly: string[] }; innerInstructions?: { instructions: { programIdIndex: number; data: string }[] }[] } | null;
};

const b58 = getBase58Encoder();
const decoded = new Map<string, { names: string[]; blockTime: bigint | null; ok: boolean }>();

/** MUTAV instructions (top-level and inner, so Squads-executed ones count) of one transaction. */
async function namesOf(env: ServerEnv, signature: string) {
  const hit = decoded.get(signature);
  if (hit) return hit;
  const tx = (await rpcFor(env)
    .getTransaction(signature as never, { ...READ, encoding: "json", maxSupportedTransactionVersion: 0 } as never)
    .send()) as unknown as JsonTx | null;
  if (!tx) return { names: [], blockTime: null, ok: false };
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable ?? []), ...(tx.meta?.loadedAddresses?.readonly ?? [])];
  const ixs = [...tx.transaction.message.instructions, ...(tx.meta?.innerInstructions ?? []).flatMap((g) => g.instructions)];
  const names = ixs.filter((ix) => keys[ix.programIdIndex] === env.programId).map((ix) => instructionName(b58.encode(ix.data) as Uint8Array, TABLE));
  // Anchor's self-CPI event instructions decode as "unknown"; drop them.
  const out = { names: names.filter((n) => n !== "unknown"), blockTime: tx.blockTime === null ? null : BigInt(tx.blockTime), ok: !tx.meta?.err };
  decoded.set(signature, out);
  return out;
}

export type OperatorHistory = {
  activity: OperatorActivity[];
  /** Last accept_role among VaultConfig's last ROLES_SCAN_LIMIT transactions, or null if none there. */
  rolesChanged: { signature: string; blockTime: bigint | null } | null;
  rolesScanned: number;
};

export async function readOperatorHistory(env: ServerEnv, r: ReserveView): Promise<OperatorHistory> {
  const rpc = rpcFor(env);
  const [mine, cfg] = await Promise.all([
    rpc.getSignaturesForAddress(r.config.operator as Address, { ...READ, limit: ACTIVITY_LIMIT }).send(),
    rpc.getSignaturesForAddress(r.addresses.config as Address, { ...READ, limit: ROLES_SCAN_LIMIT }).send(),
  ]);
  const activity = await Promise.all(
    mine.map(async (s) => {
      const d = await namesOf(env, s.signature);
      return { signature: s.signature, blockTime: s.blockTime === null ? d.blockTime : BigInt(s.blockTime), ok: s.err === null, instructions: d.names };
    }),
  );
  let rolesChanged: OperatorHistory["rolesChanged"] = null;
  for (const s of cfg.filter((x) => x.err === null)) {
    const d = await namesOf(env, s.signature);
    if (d.names.includes("accept_role")) {
      rolesChanged = { signature: s.signature, blockTime: s.blockTime === null ? null : BigInt(s.blockTime) };
      break;
    }
  }
  return { activity: activity.filter((a) => a.instructions.length > 0), rolesChanged, rolesScanned: cfg.length };
}
