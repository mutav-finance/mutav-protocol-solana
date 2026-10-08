/**
 * What a `set_config` changes. `set_config` writes every field (the composer
 * carries the unnamed ones over), so two proposals built from the same
 * on-chain state undo each other when both execute. These helpers let the
 * server refuse an overlapping proposal and let approvers see the diff.
 */
import { getSetConfigInstructionDataDecoder, minSettlementBps, type VaultConfig } from "@mutav-finance/mutav-protocol-solana";
import { bytesToHex } from "./serde";

export type ConfigChange = { field: string; from: string; to: string };

const snake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function show(v: unknown): string {
  if (v instanceof Uint8Array) return bytesToHex(v);
  if (Array.isArray(v)) return `[${v.map(show).join(", ")}]`;
  return String(v);
}

/** Leaf fields of a decoded struct, `reserved` padding skipped. */
function leaves(o: Record<string, unknown>, prefix = ""): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const [k, v] of Object.entries(o)) {
    if (k === "reserved" || k === "discriminator") continue;
    const name = prefix ? `${prefix}.${snake(k)}` : snake(k);
    if (v && typeof v === "object" && !(v instanceof Uint8Array) && !Array.isArray(v)) out.push(...leaves(v as Record<string, unknown>, name));
    else out.push([name, v]);
  }
  return out;
}

/**
 * The fields a `set_config` instruction's data would change against `config`,
 * in program field names (`caps.max_tvl`). `treasury` is the treasury account
 * passed to the instruction, when known.
 */
export function setConfigChanges(data: Uint8Array, config: VaultConfig, treasury?: string): ConfigChange[] {
  const next = getSetConfigInstructionDataDecoder().decode(data) as unknown as Record<string, unknown>;
  const now: Record<string, string> = Object.fromEntries(leaves(config as unknown as Record<string, unknown>).map(([k, v]) => [k, show(v)]));
  // The settlement floor is an argument; the account stores its complement
  // `caps.max_allocated_bps` (ADR 0018), so compare the floor itself.
  now["caps.min_settlement_bps"] = String(minSettlementBps(config));
  const changes: ConfigChange[] = [];
  for (const [k, v] of leaves(next)) {
    const to = show(v);
    if (now[k] !== to) changes.push({ field: k, from: now[k] ?? "—", to });
  }
  if (treasury && treasury !== config.treasuryAccount) changes.push({ field: "treasury_account", from: config.treasuryAccount, to: treasury });
  return changes;
}

/** A proposal as /api/squads lists it. */
type ProposalLike = { index: bigint; status: string; instructions: string[] };

/**
 * The first live proposal (Draft, Active or Approved, not yet executed) that
 * already writes `set_config`, or null. A second one would carry the same
 * on-chain values over and undo the first when both execute.
 */
export function pendingSetConfig(proposals: readonly ProposalLike[]): bigint | null {
  const live = new Set(["Draft", "Active", "Approved", "Executing"]);
  const p = proposals.find((x) => live.has(x.status) && x.instructions.includes("SetConfig"));
  return p ? p.index : null;
}

export const pendingSetConfigText = (index: bigint) =>
  `execute or cancel proposal #${index} first: it also writes set_config, and set_config writes every field, so a second proposal built now would undo it`;
