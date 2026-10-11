/**
 * What a `set_config` changes. `set_config` is sparse (ADR 0026), but two
 * live proposals can still set the same field, and the later one wins; the
 * server refuses an overlapping proposal and approvers see the diff.
 */
import { getSetConfigInstructionDataDecoder, type ConfigParam, type VaultConfig } from "@mutav-finance/mutav-protocol-solana";
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

const FIELD: Record<ConfigParam["__kind"], string> = {
  CoverageRatioBps: "coverage_ratio_bps",
  FeeTakeBps: "fee_take_bps",
  FeatureFlags: "feature_flags",
  MutavCapitalWallet: "mutav_capital_wallet",
  MaxTvl: "caps.max_tvl",
  MaxCoverPerGuarantee: "caps.max_cover_per_guarantee",
  MaxClaimPerCall: "caps.max_claim_per_call",
  MaxClaimPerPeriod: "caps.max_claim_per_period",
  MinRequest: "caps.min_request",
  MaxRequest: "caps.max_request",
  MaxNavMoveBps: "caps.max_nav_move_bps",
  StressBuffer: "caps.stress_buffer",
  MaxQueueWaitSecs: "caps.max_queue_wait_secs",
  MaxReinstateAge: "caps.max_reinstate_age",
};

/**
 * The fields a sparse `set_config` instruction's params would change against
 * `config`, in program field names (`caps.max_tvl`). A param equal to the
 * on-chain value changes nothing and is left out.
 */
export function setConfigChanges(data: Uint8Array, config: VaultConfig): ConfigChange[] {
  const { params } = getSetConfigInstructionDataDecoder().decode(data);
  const now: Record<string, string> = Object.fromEntries(leaves(config as unknown as Record<string, unknown>).map(([k, v]) => [k, show(v)]));
  const changes: ConfigChange[] = [];
  for (const p of params) {
    const field = FIELD[p.__kind];
    const to = show(p.fields[0]);
    if (now[field] !== to) changes.push({ field, from: now[field] ?? "—", to });
  }
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
