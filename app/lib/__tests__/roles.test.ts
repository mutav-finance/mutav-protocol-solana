import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACCOUNT_ROLES, FLOW_ROLES, INSTRUCTION_ROLE, instructionsBy, roleOf, rolesOfWallet } from "../roles";
import { expectedSigner, type TxKind } from "../tx-kinds";

const PROGRAM = join(__dirname, "../../../programs/mutav/src");

/** `pub fn <name>(` entries of the program module in lib.rs: the pilot binary's instructions. */
const programInstructions = () =>
  [...readFileSync(join(PROGRAM, "lib.rs"), "utf8").matchAll(/pub fn (\w+)\s*\(\s*ctx: Context</g)].map((m) => m[1]!).sort();

/** The signer constraint in an instruction's accounts struct, as the program states it. */
/** Where each instruction's accounts struct lives, when the file or struct is shared. */
const SOURCE: Record<string, { file: string; struct: string }> = {
  pause: { file: "pause", struct: "Pause" },
  unpause: { file: "pause", struct: "Unpause" },
  propose_role: { file: "roles", struct: "AdminRoleUpdate" },
  propose_admin: { file: "roles", struct: "AdminRoleUpdate" },
  cancel_pending: { file: "roles", struct: "AdminRoleUpdate" },
  set_guardians: { file: "roles", struct: "AdminRoleUpdate" },
  accept_role: { file: "roles", struct: "AcceptRole" },
  accept_admin: { file: "roles", struct: "AcceptAdmin" },
  revoke_operator: { file: "revoke_operator", struct: "RevokeOperator" },
  revoke_pauser: { file: "revoke_operator", struct: "RevokePauser" },
};

function signerCheck(ix: string): "admin" | "operator" | "pauser-or-admin" | "owner" | "upgrade-authority" | "proposed" | "none" {
  const { file, struct } = SOURCE[ix] ?? { file: ix, struct: null };
  const dir = ["admin", "operator", "capital", "public"].find((d) => readdirSync(join(PROGRAM, "instructions", d)).includes(`${file}.rs`));
  const whole = readFileSync(join(PROGRAM, "instructions", dir!, `${file}.rs`), "utf8");
  let src = whole;
  if (struct) {
    const at = whole.indexOf(`pub struct ${struct}<`);
    const end = whole.indexOf("\n}\n", at);
    src = whole.slice(at, end);
  }
  if (/is_pauser_or_admin|can_pause/.test(src)) return "pauser-or-admin";
  if (/is_operator\(/.test(src)) return "operator";
  if (/upgrade_authority/.test(src)) return "upgrade-authority";
  if (/pub new_key: Signer|pub new_admin: Signer/.test(src)) return "proposed";
  // `cancel_deposit`: the request's owner, or the admin (ADR 0023).
  if (/pub owner: Signer|signer\.key\(\) == deposit_request\.owner/.test(src)) return "owner";
  if (/config\.admin == admin\.key\(\)|admin\.key\(\) == config\.admin/.test(src)) return "admin";
  return "none";
}

describe("role map", () => {
  it("covers exactly the instructions in the pilot binary", () => {
    expect(Object.keys(INSTRUCTION_ROLE).sort()).toEqual(programInstructions());
  });

  it("matches each instruction's signer check in the program", () => {
    const expected = { admin: "admin", "upgrade-authority": "admin", "pauser-or-admin": "admin", operator: "operator", owner: "investor", proposed: "admin", none: "anyone" } as const;
    for (const ix of programInstructions()) {
      expect([ix, INSTRUCTION_ROLE[ix as keyof typeof INSTRUCTION_ROLE]]).toEqual([ix, expected[signerCheck(ix)]]);
    }
  });

  it("agrees with the signer the UI warns about for every composable kind", () => {
    const kinds: TxKind[] = ["register_guarantee", "contribute_fees", "sweep_income", "file_claim", "pay_claim", "settle_payout", "close_guarantee", "fulfil_deposits", "fulfil_redeems", "set_config", "set_allowlist_root", "set_roles", "set_payments_account", "revoke_operator", "unpause", "clear_fulfil_halt", "pause", "request_deposit", "cancel_deposit", "claim_shares", "request_redeem", "cancel_redeem", "claim_assets", "refresh"];
    const map = { operator: "operator", admin: "admin", "pauser-or-admin": "admin", investor: "investor", anyone: "anyone" } as const;
    for (const k of kinds) expect([k, roleOf(k)]).toEqual([k, map[expectedSigner(k)]]);
  });

  it("lists each role's instructions", () => {
    expect(instructionsBy("operator")).toEqual(["register_guarantee", "close_guarantee", "contribute_fees", "sweep_income", "file_claim", "pay_claim", "settle_payout"]);
    expect(instructionsBy("investor")).toEqual(["request_deposit", "cancel_deposit", "claim_shares", "request_redeem", "cancel_redeem", "claim_assets"]);
    expect(instructionsBy("anyone")).toEqual(["refresh", "advance_queue_head"]);
  });

  it("maps a wallet to its configured roles; the pauser counts as the admin side", () => {
    const c = { admin: "A", operator: "O", pauser: "P", mutavCapitalWallet: "C" } as never;
    expect(rolesOfWallet("A", c)).toEqual(["admin"]);
    expect(rolesOfWallet("P", c)).toEqual(["admin"]);
    expect(rolesOfWallet("O", c)).toEqual(["operator"]);
    expect(rolesOfWallet("C", c)).toEqual(["investor"]);
    expect(rolesOfWallet("X", c)).toEqual([]);
    expect(rolesOfWallet(null, c)).toEqual([]);
  });

  it("attributes money flows and accounts", () => {
    expect(FLOW_ROLES.fee.by).toBe("operator");
    expect(FLOW_ROLES.income.by).toBe("operator");
    expect(ACCOUNT_ROLES.incomeInbox.role).toBeNull();
    expect(FLOW_ROLES.deposit).toEqual({ by: "admin", requestedBy: "investor" });
    expect(ACCOUNT_ROLES.config.role).toBe("admin");
    expect(ACCOUNT_ROLES.capital.role).toBe("investor");
    expect(ACCOUNT_ROLES.program.role).toBeNull();
  });
});
