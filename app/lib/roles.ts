/**
 * Who does what. The three roles the pilot site separates, and which of them
 * the program accepts as signer for each instruction.
 *
 * Source of truth: the program's instruction accounts (`programs/mutav/src/
 * instructions/*`: the `Signer` and its `config.admin` / `is_operator` /
 * `is_pauser_or_admin` / `has_one = owner` constraints) and spec §2 "Roles and
 * keys". Only instructions in the pilot binary (`programs/mutav/src/lib.rs`)
 * are listed. The program checks signers; this map only labels the UI.
 */
import type { VaultConfig } from "@mutav-finance/mutav-protocol-solana";
import type { TxKind } from "./tx-kinds";

/**
 * - `admin`: the Reserve Admin, a Squads v4 multisig vault (`config.admin`).
 *   The pauser key (`config.pauser`) sits on this side: it may `pause` and
 *   `revoke_operator`, nothing else.
 * - `operator`: MUTAV's operator key (`config.operator`).
 * - `investor`: the capital provider, an allowlisted wallet that owns its
 *   requests. In the pilot it is MUTAV's capital wallet (`config.mutav_capital_wallet`).
 * - `anyone`: permissionless cranks.
 */
export type Role = "admin" | "operator" | "investor" | "anyone";

export const ROLES: readonly Role[] = ["admin", "operator", "investor", "anyone"];

export type RoleMeta = {
  label: string;
  /** Who holds it, in one line. */
  holder: string;
  /** What it is for, in one line. */
  duty: string;
  /** CSS custom property of the role colour (defined per front in globals.css). */
  color: string;
  /** Shape marker: the secondary encoding, so a role never reads from colour alone. */
  marker: "square" | "diamond" | "triangle" | "ring";
};

export const ROLE_META: Record<Role, RoleMeta> = {
  admin: {
    label: "Reserve Admin",
    holder: "Squads v4 multisig, time-locked (plus a separate pauser key)",
    duty: "Sets config and caps, fulfils the capital queue, pauses and unpauses.",
    color: "var(--color-role-admin)",
    marker: "square",
  },
  operator: {
    label: "Operator",
    holder: "MUTAV's operator key",
    duty: "Issues guarantees, books guarantee fees, files, pays and settles claims.",
    color: "var(--color-role-operator)",
    marker: "diamond",
  },
  investor: {
    label: "Investor",
    holder: "An allowlisted capital wallet; in the pilot, MUTAV's own",
    duty: "Requests deposits and redemptions, then claims its shares or assets.",
    color: "var(--color-role-investor)",
    marker: "triangle",
  },
  anyone: {
    label: "Anyone",
    holder: "Any wallet",
    duty: "Runs the permissionless cranks.",
    color: "var(--color-text-3)",
    marker: "ring",
  },
};

/** Every instruction in the pilot binary, by the role whose signature the program checks. */
export const INSTRUCTION_ROLE = {
  // Admin (`config.admin == signer`), spec §5.1 / §5.6. `initialize` is signed by the upgrade authority.
  initialize: "admin",
  set_config: "admin",
  set_roles: "admin",
  set_payments_account: "admin",
  set_allowlist_root: "admin",
  clear_fulfil_halt: "admin",
  unpause: "admin",
  fulfil_deposits: "admin",
  fulfil_redeems: "admin",
  // Pauser or admin (`is_pauser_or_admin`): the admin side, no time lock.
  pause: "admin",
  revoke_operator: "admin",
  // Operator (`is_operator`), spec §5.2–5.4.
  register_guarantee: "operator",
  close_guarantee: "operator",
  contribute_fees: "operator",
  file_claim: "operator",
  pay_claim: "operator",
  settle_payout: "operator",
  // Owner of the request (allowlisted), spec §5.5.
  request_deposit: "investor",
  cancel_deposit: "investor",
  claim_shares: "investor",
  request_redeem: "investor",
  cancel_redeem: "investor",
  claim_assets: "investor",
  // Permissionless, spec §5.8.
  refresh: "anyone",
  advance_queue_heads: "anyone",
} as const satisfies Record<string, Role>;

export type Instruction = keyof typeof INSTRUCTION_ROLE;

/** Instructions signed only by the pauser key or the admin (no time lock). */
export const PAUSER_OR_ADMIN: ReadonlySet<Instruction> = new Set(["pause", "revoke_operator"]);

export const roleOf = (ix: Instruction | TxKind): Role => INSTRUCTION_ROLE[ix as Instruction];

/** The instructions each role may sign, in the order above. */
export function instructionsBy(role: Role): Instruction[] {
  return (Object.keys(INSTRUCTION_ROLE) as Instruction[]).filter((ix) => INSTRUCTION_ROLE[ix] === role);
}

/** The roles a wallet holds in this config. The pauser key counts as the admin side. */
export function rolesOfWallet(address: string | null, c: Pick<VaultConfig, "admin" | "operator" | "pauser" | "mutavCapitalWallet">): Role[] {
  if (!address) return [];
  const out: Role[] = [];
  if (address === c.admin || address === c.pauser) out.push("admin");
  if (address === c.operator) out.push("operator");
  if (address === c.mutavCapitalWallet) out.push("investor");
  return out;
}

/**
 * Who moves money in each kind of flow on /reserve: the role that signs the
 * instruction that moved it, and the role that started it, when different.
 */
export const FLOW_ROLES = {
  fee: { by: "operator" },
  claim: { by: "operator" },
  deposit: { by: "admin", requestedBy: "investor" },
  redemption: { by: "admin", requestedBy: "investor" },
} as const satisfies Record<string, { by: Role; requestedBy?: Role }>;

/** The role behind each address listed on /reserve and /admin; null for program-owned accounts. */
export type AccountRole = { role: Role | null; note: string };

export const ACCOUNT_ROLES = {
  admin: { role: "admin", note: "signs every admin instruction" },
  pauser: { role: "admin", note: "pause and revoke_operator only" },
  operator: { role: "operator", note: "signs every operator instruction" },
  capital: { role: "investor", note: "allowlisted capital wallet" },
  /** Written only by admin instructions (spec §3.1). */
  config: { role: "admin", note: "written only by admin instructions" },
  /** Set by the admin; receives the take of the operator's contribute_fees. */
  treasury: { role: "operator", note: "receives the fee take of contribute_fees" },
  /** Set by the admin; receives the operator's pay_claim. */
  payments: { role: "operator", note: "receives pay_claim" },
  program: { role: null, note: "program-owned" },
} as const satisfies Record<string, AccountRole>;
