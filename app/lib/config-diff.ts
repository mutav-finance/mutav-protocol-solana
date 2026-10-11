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
/** Every config leaf field, in program names, as shown in a diff. */
export const configFieldValues = (config: VaultConfig): Record<string, string> =>
  Object.fromEntries(leaves(config as unknown as Record<string, unknown>).map(([k, v]) => [k, show(v)]));

/** The program field names a sparse `set_config` writes, in order. */
export function setConfigFields(data: Uint8Array): string[] {
  return getSetConfigInstructionDataDecoder().decode(data).params.map((p) => FIELD[p.__kind]);
}

export function setConfigChanges(data: Uint8Array, config: VaultConfig): ConfigChange[] {
  const { params } = getSetConfigInstructionDataDecoder().decode(data);
  const now = configFieldValues(config);
  const changes: ConfigChange[] = [];
  for (const p of params) {
    const field = FIELD[p.__kind];
    const to = show(p.fields[0]);
    if (now[field] !== to) changes.push({ field, from: now[field] ?? "—", to });
  }
  return changes;
}

/** A proposal as /api/squads lists it. */
type ProposalLike = { index: bigint; status: string; instructions: string[]; stale?: boolean };

/**
 * Can this proposal still execute? Approved (or Executing) always can, even
 * below the multisig's stale index; Draft and Active can be voted on only
 * while not stale (Squads v4).
 */
export function isLiveProposal(p: Pick<ProposalLike, "status" | "stale">): boolean {
  if (p.status === "Approved" || p.status === "Executing") return true;
  return (p.status === "Draft" || p.status === "Active") && !p.stale;
}

/**
 * The first live proposal that already writes `set_config`, or null (A3: the
 * caller passes EVERY live proposal, not the last few). A second one is diffed
 * against the values before the first runs, so it could undo a field the
 * first changes.
 */
export function pendingSetConfig(proposals: readonly ProposalLike[]): bigint | null {
  const p = proposals.find((x) => isLiveProposal(x) && x.instructions.includes("SetConfig"));
  return p ? p.index : null;
}

// ── Stale-carry check (A3) ──────────────────────────────────────────────────
//
// A set_config proposal records, in its Squads memo, the on-chain value of
// each field it writes at the time it was proposed. At execute, a field whose
// on-chain value has moved since means another change landed in between:
// executing would silently overwrite it, so the app refuses.
//
// APP-SIDE ONLY: the Squads program does not know about it. A member who
// executes from the Squads UI (or any other client) bypasses the check, so
// approvers still read the diff before approving.

const MEMO_PREFIX = "mutav set_config|";
/** Keep the memo small: the create transaction must stay under 1,232 bytes. */
export const MAX_BASELINE_MEMO = 240;

/**
 * `mutav set_config|caps.max_tvl=100;fee_take_bps=2000`, or null when the
 * baseline would not fit (the caller refuses to build such a proposal: its
 * execute could never pass the stale-carry check).
 */
export function baselineMemo(fields: string[], config: VaultConfig): string | null {
  const now = configFieldValues(config);
  const memo = MEMO_PREFIX + fields.map((f) => `${f}=${now[f] ?? ""}`).join(";");
  return memo.length <= MAX_BASELINE_MEMO ? memo : null;
}

/** The baseline must name exactly the fields the set_config writes; else it cannot vouch for the proposal. */
export function baselineCovers(baseline: Record<string, string>, fields: string[]): boolean {
  const keys = Object.keys(baseline);
  const want = new Set(fields);
  return fields.length > 0 && keys.length === want.size && keys.every((k) => want.has(k));
}

/** The baseline a memo records, or null when it records none. */
export function parseBaselineMemo(memo: string | null | undefined): Record<string, string> | null {
  if (!memo || !memo.startsWith(MEMO_PREFIX)) return null;
  const out: Record<string, string> = {};
  for (const pair of memo.slice(MEMO_PREFIX.length).split(";")) {
    const i = pair.indexOf("=");
    if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return out;
}

/** Fields whose on-chain value moved since the baseline was recorded. */
export function staleCarry(baseline: Record<string, string>, config: VaultConfig): ConfigChange[] {
  const now = configFieldValues(config);
  return Object.entries(baseline)
    .filter(([f, v]) => (now[f] ?? "") !== v)
    .map(([field, from]) => ({ field, from, to: now[field] ?? "—" }));
}

export const staleCarryText = (index: bigint, moved: ConfigChange[]) =>
  `proposal #${index} was built against older values: ${moved.map((m) => `${m.field} was ${m.from}, is ${m.to} now`).join("; ")}. Executing it would overwrite that change: reject or cancel #${index} and propose again`;

export const pendingSetConfigText = (index: bigint) =>
  `execute, reject or cancel proposal #${index} first: it also writes set_config, and a second proposal built now is diffed against the values before #${index} runs, so it could undo a field #${index} changes`;
