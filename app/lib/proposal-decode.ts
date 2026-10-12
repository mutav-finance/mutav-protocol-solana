/**
 * What a Squads vault transaction will do, decoded for the approvers (A3):
 * every MUTAV admin instruction with its arguments checked against the chain
 * now, every Compute Budget instruction by name, and anything else flagged as
 * a foreign instruction with its program id. Pure: the server reads the facts
 * (token accounts, NAV, the ALLOWLIST root) and passes them in.
 */
import { getAddressDecoder } from "@solana/kit";
import {
  getAdvanceQueueHeadInstructionDataDecoder,
  getCancelPendingInstructionDataDecoder,
  getClearFulfilHaltInstructionDataDecoder,
  getFulfilDepositsInstructionDataDecoder,
  getFulfilRedeemsInstructionDataDecoder,
  getProposeAdminInstructionDataDecoder,
  getProposeRoleInstructionDataDecoder,
  getSetAllowlistRootInstructionDataDecoder,
  getSetGuardiansInstructionDataDecoder,
  identifyMutavInstruction,
  MutavInstruction,
  type NavBounds,
  type VaultConfig,
} from "@mutav-finance/mutav-protocol-solana";
import { setConfigChanges, setConfigFields } from "./config-diff";
import { fmtBrs, fmtNav } from "./format";
import { bytesToHex } from "./serde";

export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";

/** One fact an approver reads; `warn` ones are shown as red flags. */
export type ProposalDetail = { label: string; value: string; warn?: boolean };

export type DecodedInstruction = {
  /** `foreign`: neither MUTAV nor Compute Budget. */
  program: "mutav" | "compute-budget" | "foreign";
  programId: string;
  name: string;
  details: ProposalDetail[];
};

/** A vault-transaction instruction with its accounts resolved (null: not resolvable, e.g. through a lookup table). */
export type RawInstruction = { programId: string | null; accounts: (string | null)[]; data: Uint8Array };

/** SPL token account facts (layout: mint [0..32), owner [32..64), delegate [72..108), state [108], close authority [129..165)). */
export type TokenAccountFacts = {
  exists: boolean;
  /** The program that owns the account (should be the reserve's token program). */
  programOwner: string | null;
  mint: string | null;
  owner: string | null;
  delegate: string | null;
  closeAuthority: string | null;
  frozen: boolean;
};

export function tokenAccountFacts(info: { owner: string; data: Uint8Array } | null): TokenAccountFacts {
  if (!info || info.data.length < 165) {
    return { exists: !!info, programOwner: info?.owner ?? null, mint: null, owner: null, delegate: null, closeAuthority: null, frozen: false };
  }
  const d = info.data;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const ad = getAddressDecoder();
  return {
    exists: true,
    programOwner: info.owner,
    mint: ad.decode(d.subarray(0, 32)),
    owner: ad.decode(d.subarray(32, 64)),
    delegate: dv.getUint32(72, true) === 1 ? ad.decode(d.subarray(76, 108)) : null,
    frozen: d[108] === 2,
    closeAuthority: dv.getUint32(129, true) === 1 ? ad.decode(d.subarray(133, 165)) : null,
  };
}

export type DecodeContext = {
  programId: string;
  /** The reserve's VaultConfig PDA: an instruction aimed at another config is flagged. */
  configAddress?: string | null;
  /** On-chain config now (set_config diffs, token account checks). */
  config?: VaultConfig;
  /** NAV per share now (NAV_SCALE): fills check `conversion`, clear_fulfil_halt `published`. */
  nav?: { conversion: bigint; published: bigint };
  /** Hex root of the server's ALLOWLIST (null: ALLOWLIST is empty). Undefined: not computed. */
  allowlistRoot?: string | null;
  /** Token accounts named by set_payments_account / set_treasury_account, by address. */
  tokenAccounts?: Record<string, TokenAccountFacts>;
  /** PAYMENTS_OWNER, when set. */
  paymentsOwner?: string | null;
};

const MUTAV_NAMES = Object.fromEntries(
  Object.entries(MutavInstruction).filter(([, v]) => typeof v === "number").map(([k, v]) => [v as number, k]),
) as Record<number, string>;

const ROLE_NAMES: Record<number, string> = { 1: "operator", 2: "pauser", 3: "admin" };
const roleName = (r: number) => ROLE_NAMES[r] ?? `unknown role ${r}`;

const COMPUTE_BUDGET_NAMES = ["RequestUnits", "RequestHeapFrame", "SetComputeUnitLimit", "SetComputeUnitPrice", "SetLoadedAccountsDataSizeLimit"];

/**
 * The MUTAV instructions the admin vault signs, with the index of their
 * `config` account (1, or 0 for advance_queue_head). Any other MUTAV
 * instruction in a proposal is flagged.
 */
const CONFIG_AT = new Map<MutavInstruction, number>([
  [MutavInstruction.AcceptAdmin, 1],
  [MutavInstruction.ProposeRole, 1],
  [MutavInstruction.CancelPending, 1],
  [MutavInstruction.ProposeAdmin, 1],
  [MutavInstruction.SetPaymentsAccount, 1],
  [MutavInstruction.SetTreasuryAccount, 1],
  [MutavInstruction.SetAllowlistRoot, 1],
  [MutavInstruction.SetConfig, 1],
  [MutavInstruction.SetGuardians, 1],
  [MutavInstruction.FulfilDeposits, 1],
  [MutavInstruction.FulfilRedeems, 1],
  [MutavInstruction.ClearFulfilHalt, 1],
  [MutavInstruction.Pause, 1],
  [MutavInstruction.Unpause, 1],
  [MutavInstruction.RevokeOperator, 1],
  [MutavInstruction.RevokePauser, 1],
  [MutavInstruction.AdvanceQueueHead, 0],
]);

/** The token account a set_payments_account / set_treasury_account points at (accounts[2]), or null. */
export function newMoneyAccount(ix: RawInstruction, programId: string): string | null {
  if (ix.programId !== programId) return null;
  try {
    const k = identifyMutavInstruction(ix.data);
    if (k !== MutavInstruction.SetPaymentsAccount && k !== MutavInstruction.SetTreasuryAccount) return null;
  } catch {
    return null;
  }
  return ix.accounts[2] ?? null;
}

function navCheck(bounds: NavBounds, nav: bigint | undefined, which: string): ProposalDetail[] {
  const out: ProposalDetail[] = [{ label: "NAV bounds", value: `${fmtNav(bounds.min)} – ${fmtNav(bounds.max)}` }];
  if (nav === undefined) return out;
  const inside = nav >= bounds.min && nav <= bounds.max;
  out.push({ label: `${which} NAV now`, value: `${fmtNav(nav)} (${inside ? "inside the bounds" : "OUTSIDE the bounds: execute fails with NavOutOfBounds"})`, warn: !inside });
  return out;
}

function moneyAccountDetails(account: string | null, side: "payments" | "treasury", ctx: DecodeContext): ProposalDetail[] {
  if (!account) return [{ label: `new ${side} account`, value: "not resolvable", warn: true }];
  const out: ProposalDetail[] = [{ label: `new ${side} account`, value: account }];
  const c = ctx.config;
  const other = side === "payments" ? c?.treasuryAccount : c?.paymentsAccount;
  if (other && account === other) out.push({ label: "same account", value: `it is also the ${side === "payments" ? "treasury" : "payments"} account`, warn: true });
  const f = ctx.tokenAccounts?.[account];
  if (!f) return out;
  if (!f.exists) return [...out, { label: "account", value: "does not exist", warn: true }];
  if (f.mint === null) return [...out, { label: "account", value: `not an SPL token account (owned by ${f.programOwner})`, warn: true }];
  if (c && f.programOwner !== c.reserveTokenProgram) out.push({ label: "token program", value: `${f.programOwner}, not the reserve's ${c.reserveTokenProgram}`, warn: true });
  const ownerIsOperator = !!c && f.owner === c.operator;
  out.push({ label: "SPL owner", value: ownerIsOperator ? `${f.owner} (the operator key: a compromised operator could take these funds)` : (f.owner ?? "—"), warn: ownerIsOperator });
  if (side === "payments" && ctx.paymentsOwner && f.owner !== ctx.paymentsOwner) out.push({ label: "expected owner", value: `${ctx.paymentsOwner} (PAYMENTS_OWNER)`, warn: true });
  const wrongMint = !!c && f.mint !== c.reserveMint;
  out.push({ label: "mint", value: wrongMint ? `${f.mint} (not the reserve mint ${c!.reserveMint})` : f.mint, warn: wrongMint });
  out.push({ label: "delegate", value: f.delegate ?? "none", warn: f.delegate !== null });
  if (f.closeAuthority) out.push({ label: "close authority", value: f.closeAuthority, warn: true });
  if (f.frozen) out.push({ label: "state", value: "frozen", warn: true });
  return out;
}

function mutavDetails(kind: MutavInstruction, ix: RawInstruction, ctx: DecodeContext): ProposalDetail[] {
  const d = ix.data;
  switch (kind) {
    case MutavInstruction.ProposeRole: {
      const a = getProposeRoleInstructionDataDecoder().decode(d);
      return [
        { label: "role", value: roleName(a.role) },
        { label: "new key", value: a.key },
      ];
    }
    case MutavInstruction.CancelPending:
      return [{ label: "role", value: roleName(getCancelPendingInstructionDataDecoder().decode(d).role) }];
    case MutavInstruction.ProposeAdmin:
      return [
        { label: "role", value: "admin" },
        { label: "new key", value: getProposeAdminInstructionDataDecoder().decode(d).key, warn: true },
      ];
    case MutavInstruction.SetPaymentsAccount:
      return moneyAccountDetails(ix.accounts[2] ?? null, "payments", ctx);
    case MutavInstruction.SetTreasuryAccount:
      return moneyAccountDetails(ix.accounts[2] ?? null, "treasury", ctx);
    case MutavInstruction.SetAllowlistRoot: {
      const root = bytesToHex(Uint8Array.from(getSetAllowlistRootInstructionDataDecoder().decode(d).root));
      const out: ProposalDetail[] = [{ label: "root", value: root }];
      if (ctx.allowlistRoot === undefined) return out;
      const match = ctx.allowlistRoot !== null && ctx.allowlistRoot === root;
      out.push({
        label: "server ALLOWLIST",
        value: match ? "matches this root" : ctx.allowlistRoot === null ? "ALLOWLIST is empty: no proof can be built for this root" : `DIFFERS: ALLOWLIST hashes to ${ctx.allowlistRoot}`,
        warn: !match,
      });
      return out;
    }
    case MutavInstruction.FulfilDeposits: {
      const a = getFulfilDepositsInstructionDataDecoder().decode(d);
      return [
        { label: "count", value: String(a.count) },
        { label: "queue accounts", value: String(Math.max(0, ix.accounts.length - 10)) },
        ...navCheck(a.navBounds, ctx.nav?.conversion, "conversion"),
      ];
    }
    case MutavInstruction.FulfilRedeems: {
      const a = getFulfilRedeemsInstructionDataDecoder().decode(d);
      return [
        { label: "count", value: String(a.count) },
        { label: "max assets", value: fmtBrs(a.maxAssets) },
        { label: "queue accounts", value: String(Math.max(0, ix.accounts.length - 13)) },
        ...navCheck(a.navBounds, ctx.nav?.conversion, "conversion"),
      ];
    }
    case MutavInstruction.ClearFulfilHalt:
      return navCheck(getClearFulfilHaltInstructionDataDecoder().decode(d).navBounds, ctx.nav?.published, "published");
    case MutavInstruction.SetConfig: {
      if (!ctx.config) return setConfigFields(d).map((f) => ({ label: f, value: "(on-chain value not read)" }));
      const changes = setConfigChanges(d, ctx.config);
      if (changes.length === 0) return [{ label: "changes", value: "no field differs from on-chain now" }];
      return changes.map((c) => ({ label: c.field, value: `${c.from} → ${c.to}` }));
    }
    case MutavInstruction.SetGuardians:
      return [{ label: "guardians", value: getSetGuardiansInstructionDataDecoder().decode(d).guardians.join(", ") || "none" }];
    case MutavInstruction.AdvanceQueueHead: {
      const a = getAdvanceQueueHeadInstructionDataDecoder().decode(d);
      return [
        { label: "queue", value: String(a.queue) },
        { label: "max", value: String(a.max) },
      ];
    }
    default:
      return [];
  }
}

/** One vault-transaction instruction, decoded for the approvers. */
export function decodeInstruction(ix: RawInstruction, ctx: DecodeContext): DecodedInstruction {
  if (ix.programId === null) {
    return { program: "foreign", programId: "(address lookup table)", name: "foreign instruction", details: [{ label: "program", value: "not resolvable from the proposal", warn: true }] };
  }
  if (ix.programId === COMPUTE_BUDGET_PROGRAM) {
    const tag = ix.data[0];
    const known = tag !== undefined && tag >= 1 && tag < COMPUTE_BUDGET_NAMES.length;
    const name = known ? COMPUTE_BUDGET_NAMES[tag]! : "unknown";
    const details: ProposalDetail[] = known ? [] : [{ label: "data", value: `unknown Compute Budget instruction${tag === undefined ? "" : ` (tag ${tag})`}`, warn: true }];
    if (tag === 2 && ix.data.length >= 5) details.push({ label: "units", value: String(new DataView(ix.data.buffer, ix.data.byteOffset).getUint32(1, true)) });
    if (tag === 3 && ix.data.length >= 9) details.push({ label: "micro-lamports per unit", value: String(new DataView(ix.data.buffer, ix.data.byteOffset).getBigUint64(1, true)) });
    return { program: "compute-budget", programId: ix.programId, name, details };
  }
  if (ix.programId !== ctx.programId) {
    return { program: "foreign", programId: ix.programId, name: "foreign instruction", details: [{ label: "program", value: ix.programId, warn: true }] };
  }
  let kind: MutavInstruction;
  try {
    kind = identifyMutavInstruction(ix.data);
  } catch {
    return { program: "mutav", programId: ix.programId, name: "unknown", details: [{ label: "data", value: "not a known MUTAV instruction", warn: true }] };
  }
  const name = MUTAV_NAMES[kind] ?? "unknown";
  const details: ProposalDetail[] = [];
  const at = CONFIG_AT.get(kind);
  if (at === undefined) details.push({ label: "instruction", value: "not an admin instruction: the reserve admin vault does not normally sign it", warn: true });
  if (ctx.configAddress && at !== undefined && ix.accounts[at] !== ctx.configAddress) {
    details.push({ label: "config", value: `${ix.accounts[at] ?? "not resolvable"}, not this reserve's ${ctx.configAddress}`, warn: true });
  }
  if (ix.accounts.some((a) => a === null)) details.push({ label: "accounts", value: "some are not resolvable (address lookup table)", warn: true });
  try {
    details.push(...mutavDetails(kind, ix, ctx));
  } catch {
    details.push({ label: "arguments", value: "could not be decoded", warn: true });
  }
  return { program: "mutav", programId: ix.programId, name, details };
}

export const SQUADS_CONFIG_CHANGE = "Squads config change";

/**
 * A proposal whose transaction is a Squads ConfigTransaction (not a vault
 * transaction): it changes the multisig itself (members, threshold, time
 * lock), so it is flagged and left to the Squads UI.
 */
export function squadsConfigChange(squadsProgram: string, actions: string[] | null): DecodedInstruction {
  return {
    program: "foreign",
    programId: squadsProgram,
    name: SQUADS_CONFIG_CHANGE,
    details: [
      { label: "changes", value: "members/threshold — review in the Squads UI", warn: true },
      ...(actions && actions.length > 0 ? [{ label: "actions", value: actions.join(", "), warn: true }] : []),
    ],
  };
}

/** Program ids of the foreign instructions in a decoded proposal. */
export const foreignPrograms = (ixs: DecodedInstruction[]): string[] => ixs.filter((i) => i.program === "foreign").map((i) => i.programId);
