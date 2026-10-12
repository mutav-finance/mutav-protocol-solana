import { describe, expect, it } from "vitest";
import { address, createNoopSigner, getAddressEncoder, type Address, type Instruction } from "@solana/kit";
import {
  buildAllowlist,
  getAdvanceQueueHeadInstruction,
  getApproveClaimInstruction,
  getCancelDepositInstruction,
  getCancelRedeemInstruction,
  getCancelPendingInstruction,
  getClearFulfilHaltInstruction,
  getFulfilDepositsInstruction,
  getFulfilRedeemsInstruction,
  getProposeAdminInstruction,
  getProposeRoleInstruction,
  getSetAllowlistRootInstruction,
  getSetConfigInstruction,
  getSetPaymentsAccountInstruction,
  getSetTreasuryAccountInstruction,
  MUTAV_PROGRAM_ADDRESS,
  NAV_SCALE,
  REFRESH_DISCRIMINATOR,
  type VaultConfig,
} from "@mutav-finance/mutav-protocol-solana";
import { COMPUTE_BUDGET_PROGRAM, decodeInstruction, squadsConfigChange, foreignPrograms, newMoneyAccount, tokenAccountFacts, type DecodeContext, type RawInstruction, type TokenAccountFacts } from "../proposal-decode";
import { bytesToHex } from "../serde";
import { config as baseConfig } from "./fixtures";

const a = (s: string) => address(s);
const PROGRAM = MUTAV_PROGRAM_ADDRESS as Address;
const CONFIG = a("HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo");
const OTHER_CONFIG = a("9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU");
const VAULT = a("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
const MINT = a("BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4");
const TOKEN = a("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const OPERATOR = a("4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T");
const OWNER = a("7EYnhQoR9YM3N7UoaKRoA44Uy8JeaZV3qyouov87awMs");
const NEW_KEY = a("Vote111111111111111111111111111111111111111");
const TREASURY = a("SysvarRent111111111111111111111111111111111");
const PAYMENTS = a("SysvarC1ock11111111111111111111111111111111");
const NEW_ACCOUNT = a("Stake11111111111111111111111111111111111111");
const ANY = a("11111111111111111111111111111111");

const config = { ...baseConfig(), reserveMint: MINT, reserveTokenProgram: TOKEN, operator: OPERATOR, treasuryAccount: TREASURY, paymentsAccount: PAYMENTS } as unknown as VaultConfig;
const admin = createNoopSigner(VAULT);
const common = { config: CONFIG, eventAuthority: ANY, program: PROGRAM };
const o = { programAddress: PROGRAM };
const raw = (ix: Instruction): RawInstruction => ({ programId: ix.programAddress, accounts: (ix.accounts ?? []).map((m) => m.address), data: new Uint8Array(ix.data ?? []) });
const ctx = (over: Partial<DecodeContext> = {}): DecodeContext => ({ programId: PROGRAM, configAddress: CONFIG, config, ...over });
const detail = (d: ReturnType<typeof decodeInstruction>, label: string) => d.details.find((x) => x.label === label);
const warns = (d: ReturnType<typeof decodeInstruction>) => d.details.filter((x) => x.warn).map((x) => x.label);

const NAV = NAV_SCALE;
const bounds = { min: NAV - NAV / 100n, max: NAV + NAV / 100n };

function splAccount(f: { mint: Address; owner: Address; delegate?: Address; closeAuthority?: Address; frozen?: boolean }): Uint8Array {
  const d = new Uint8Array(165);
  const e = getAddressEncoder();
  const dv = new DataView(d.buffer);
  d.set(e.encode(f.mint), 0);
  d.set(e.encode(f.owner), 32);
  if (f.delegate) {
    dv.setUint32(72, 1, true);
    d.set(e.encode(f.delegate), 76);
  }
  d[108] = f.frozen ? 2 : 1;
  if (f.closeAuthority) {
    dv.setUint32(129, 1, true);
    d.set(e.encode(f.closeAuthority), 133);
  }
  return d;
}

describe("A3 proposal decoding: roles", () => {
  it("propose_role shows the role and the new key", () => {
    const d = decodeInstruction(raw(getProposeRoleInstruction({ ...common, admin, role: 2, key: NEW_KEY }, o)), ctx());
    expect(d).toMatchObject({ program: "mutav", name: "ProposeRole" });
    expect(detail(d, "role")?.value).toBe("pauser");
    expect(detail(d, "new key")?.value).toBe(NEW_KEY);
    expect(warns(d)).toEqual([]);
  });
  it("cancel_pending shows the role", () => {
    const d = decodeInstruction(raw(getCancelPendingInstruction({ ...common, admin, role: 1 }, o)), ctx());
    expect(detail(d, "role")?.value).toBe("operator");
  });
  it("propose_admin shows the new admin key as a red flag", () => {
    const d = decodeInstruction(raw(getProposeAdminInstruction({ ...common, admin, key: NEW_KEY }, o)), ctx());
    expect(detail(d, "role")?.value).toBe("admin");
    expect(detail(d, "new key")).toEqual({ label: "new key", value: NEW_KEY, warn: true });
  });
  it("flags an instruction aimed at another reserve's config", () => {
    const d = decodeInstruction(raw(getCancelPendingInstruction({ ...common, config: OTHER_CONFIG, admin, role: 1 }, o)), ctx());
    expect(warns(d)).toContain("config");
  });
});

describe("A3 proposal decoding: payments and treasury accounts", () => {
  const payments = raw(getSetPaymentsAccountInstruction({ ...common, admin, paymentsAccount: NEW_ACCOUNT, treasuryAccount: TREASURY }, o));
  const treasury = raw(getSetTreasuryAccountInstruction({ ...common, admin, treasuryAccount: NEW_ACCOUNT, paymentsAccount: PAYMENTS }, o));
  const facts = (f: Parameters<typeof splAccount>[0], programOwner: string = TOKEN): Record<string, TokenAccountFacts> => ({
    [NEW_ACCOUNT]: tokenAccountFacts({ owner: programOwner, data: splAccount(f) }),
  });

  it("names the account to read for both instructions", () => {
    expect(newMoneyAccount(payments, PROGRAM)).toBe(NEW_ACCOUNT);
    expect(newMoneyAccount(treasury, PROGRAM)).toBe(NEW_ACCOUNT);
    expect(newMoneyAccount(raw(getCancelPendingInstruction({ ...common, admin, role: 1 }, o)), PROGRAM)).toBeNull();
  });
  it("shows the SPL owner, mint and delegate of a clean account with no flag", () => {
    const d = decodeInstruction(payments, ctx({ tokenAccounts: facts({ mint: MINT, owner: OWNER }), paymentsOwner: OWNER }));
    expect(d.name).toBe("SetPaymentsAccount");
    expect(detail(d, "new payments account")?.value).toBe(NEW_ACCOUNT);
    expect(detail(d, "SPL owner")?.value).toBe(OWNER);
    expect(detail(d, "mint")?.value).toBe(MINT);
    expect(detail(d, "delegate")?.value).toBe("none");
    expect(warns(d)).toEqual([]);
  });
  it("flags a delegate, a close authority, a foreign mint, an operator owner and a freeze", () => {
    const d = decodeInstruction(treasury, ctx({ tokenAccounts: facts({ mint: ANY, owner: OPERATOR, delegate: NEW_KEY, closeAuthority: NEW_KEY, frozen: true }) }));
    expect(d.name).toBe("SetTreasuryAccount");
    expect(warns(d)).toEqual(expect.arrayContaining(["SPL owner", "mint", "delegate", "close authority", "state"]));
  });
  it("flags an owner other than PAYMENTS_OWNER, a missing account and the wrong token program", () => {
    expect(warns(decodeInstruction(payments, ctx({ tokenAccounts: facts({ mint: MINT, owner: NEW_KEY }), paymentsOwner: OWNER })))).toContain("expected owner");
    expect(warns(decodeInstruction(payments, ctx({ tokenAccounts: { [NEW_ACCOUNT]: tokenAccountFacts(null) } })))).toContain("account");
    expect(warns(decodeInstruction(payments, ctx({ tokenAccounts: facts({ mint: MINT, owner: OWNER }, ANY) })))).toContain("token program");
  });
  it("flags payments set to the treasury account", () => {
    const same = raw(getSetPaymentsAccountInstruction({ ...common, admin, paymentsAccount: TREASURY, treasuryAccount: TREASURY }, o));
    expect(warns(decodeInstruction(same, ctx()))).toContain("same account");
  });
});

describe("A3 proposal decoding: allowlist root", () => {
  it("compares the root with the server's ALLOWLIST root", async () => {
    const tree = await buildAllowlist([OWNER]);
    const ix = raw(getSetAllowlistRootInstruction({ ...common, admin, root: tree.root }, o));
    const root = bytesToHex(tree.root);
    const match = decodeInstruction(ix, ctx({ allowlistRoot: root }));
    expect(detail(match, "root")?.value).toBe(root);
    expect(detail(match, "server ALLOWLIST")).toEqual({ label: "server ALLOWLIST", value: "matches this root", warn: false });
    const other = decodeInstruction(ix, ctx({ allowlistRoot: bytesToHex((await buildAllowlist([NEW_KEY])).root) }));
    expect(detail(other, "server ALLOWLIST")?.warn).toBe(true);
    expect(detail(other, "server ALLOWLIST")?.value).toMatch(/^DIFFERS/);
    expect(detail(decodeInstruction(ix, ctx({ allowlistRoot: null })), "server ALLOWLIST")?.warn).toBe(true);
  });
});

describe("A3 proposal decoding: fills", () => {
  const accounts = { ...common, admin, state: ANY, reserve: ANY, vaultAuthority: ANY, reserveMint: MINT, tokenProgram: TOKEN };
  it("fulfil_deposits: count and NAV bounds against the conversion NAV now", () => {
    const ix = raw(getFulfilDepositsInstruction({ ...accounts, pendingDeposits: ANY, count: 3, navBounds: bounds }, o));
    const inside = decodeInstruction(ix, ctx({ nav: { conversion: NAV, published: 0n } }));
    expect(detail(inside, "count")?.value).toBe("3");
    expect(detail(inside, "conversion NAV now")?.warn).toBe(false);
    const outside = decodeInstruction(ix, ctx({ nav: { conversion: 2n * NAV, published: NAV } }));
    expect(detail(outside, "conversion NAV now")).toMatchObject({ warn: true });
    expect(detail(outside, "conversion NAV now")?.value).toMatch(/OUTSIDE/);
  });
  it("fulfil_redeems: count, max assets and NAV bounds", () => {
    const ix = raw(getFulfilRedeemsInstruction({ ...accounts, claims: ANY, pendingRedemptions: ANY, shareMint: ANY, shareTokenProgram: TOKEN, count: 2, maxAssets: 5_000_000n, navBounds: bounds }, o));
    const d = decodeInstruction(ix, ctx({ nav: { conversion: NAV, published: NAV } }));
    expect(detail(d, "count")?.value).toBe("2");
    expect(detail(d, "max assets")?.value).toMatch(/^R\$ 5/);
    expect(detail(d, "NAV bounds")).toBeDefined();
  });
  it("clear_fulfil_halt checks the published NAV", () => {
    const ix = raw(getClearFulfilHaltInstruction({ ...common, admin, state: ANY, reserve: ANY, navBounds: bounds }, o));
    const d = decodeInstruction(ix, ctx({ nav: { conversion: NAV, published: 3n * NAV } }));
    expect(detail(d, "published NAV now")?.warn).toBe(true);
  });
});

describe("A3 proposal decoding: set_config", () => {
  it("lists each changed field old → new", () => {
    const ix = raw(getSetConfigInstruction({ ...common, admin, state: ANY, treasuryAccount: TREASURY, paymentsAccount: PAYMENTS, params: [{ __kind: "FeeTakeBps", fields: [1_500] }] }, o));
    const d = decodeInstruction(ix, ctx());
    expect(d.name).toBe("SetConfig");
    expect(detail(d, "fee_take_bps")?.value).toBe("2000 → 1500");
  });
});

describe("A3 proposal decoding: foreign instructions", () => {
  it("flags a non-MUTAV, non-Compute Budget instruction with its program id", () => {
    const transfer: RawInstruction = { programId: ANY, accounts: [VAULT, OWNER], data: new Uint8Array([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]) };
    const d = decodeInstruction(transfer, ctx());
    expect(d).toMatchObject({ program: "foreign", programId: ANY, name: "foreign instruction" });
    expect(foreignPrograms([d])).toEqual([ANY]);
  });
  it("flags an instruction whose program sits behind a lookup table", () => {
    expect(decodeInstruction({ programId: null, accounts: [], data: new Uint8Array() }, ctx()).program).toBe("foreign");
  });
  it("decodes Compute Budget instructions without flagging them", () => {
    const data = new Uint8Array(5);
    data[0] = 2;
    new DataView(data.buffer).setUint32(1, 200_000, true);
    const d = decodeInstruction({ programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data }, ctx());
    expect(d).toMatchObject({ program: "compute-budget", name: "SetComputeUnitLimit" });
    expect(detail(d, "units")?.value).toBe("200000");
    expect(foreignPrograms([d])).toEqual([]);
  });
  it("flags data the MUTAV program does not know", () => {
    expect(warns(decodeInstruction({ programId: PROGRAM, accounts: [], data: new Uint8Array(8) }, ctx()))).toEqual(["data"]);
  });
});

describe("A3 proposal decoding: outside the admin set", () => {
  it("flags a MUTAV instruction the admin vault does not normally sign", () => {
    const d = decodeInstruction({ programId: PROGRAM, accounts: [CONFIG], data: new Uint8Array(REFRESH_DISCRIMINATOR) }, ctx());
    expect(d.name).toBe("Refresh");
    expect(warns(d)).toContain("instruction");
  });
  it("flags an unknown Compute Budget instruction", () => {
    const d = decodeInstruction({ programId: COMPUTE_BUDGET_PROGRAM, accounts: [], data: new Uint8Array([9]) }, ctx());
    expect(d.name).toBe("unknown");
    expect(warns(d)).toEqual(["data"]);
  });
  it("flags a Squads config change as foreign, pointing to the Squads UI", () => {
    const d = squadsConfigChange("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf", ["AddMember", "ChangeThreshold"]);
    expect(d.program).toBe("foreign");
    expect(d.details[0]).toEqual({ label: "changes", value: "members/threshold — review in the Squads UI", warn: true });
    expect(d.details[1]?.value).toBe("AddMember, ChangeThreshold");
  });
});

describe("A3 proposal decoding: claims and the capital queue (ADR 0021, ADR 0030)", () => {
  const FILING = a("Stake11111111111111111111111111111111111111");
  const GUARANTEE = a("Vote111111111111111111111111111111111111111");
  const REQUEST = a("SysvarRent111111111111111111111111111111111");
  it("approve_claim is an admin instruction: amount, revision and filing shown, nothing flagged", () => {
    const ix = getApproveClaimInstruction({ ...common, admin, guarantee: GUARANTEE, claimFiling: FILING, noticeRefHash: new Uint8Array(32).fill(7), amount: 20_000_000_000n, expectedRevision: 3 }, o);
    const d = decodeInstruction(raw(ix), ctx());
    expect(d).toMatchObject({ program: "mutav", name: "ApproveClaim" });
    expect(warns(d)).toEqual([]);
    expect(detail(d, "claim filing")?.value).toBe(FILING);
    expect(detail(d, "expected revision")?.value).toBe("3");
    expect(detail(d, "notice ref hash")?.value).toBe("07".repeat(32));
  });
  it("the admin's cancel_deposit / cancel_redeem park the request: owner shown, config checked at index 2", () => {
    const acc = { ...common, signer: admin, owner: OWNER, state: ANY, pendingDeposits: ANY, pendingRedemptions: ANY, vaultAuthority: ANY, reserveMint: MINT, tokenProgram: TOKEN, destination: ANY, ownerShares: ANY, shareMint: ANY, shareTokenProgram: TOKEN };
    for (const ix of [getCancelDepositInstruction({ ...acc, depositRequest: REQUEST }, o), getCancelRedeemInstruction({ ...acc, redeemRequest: REQUEST }, o)]) {
      const d = decodeInstruction(raw(ix), ctx());
      expect(warns(d)).toEqual([]);
      expect(detail(d, "owner")?.value).toBe(OWNER);
      expect(detail(d, "request")?.value).toBe(REQUEST);
      const other = decodeInstruction(raw({ ...ix, accounts: ix.accounts.map((m, i) => (i === 2 ? { ...m, address: OTHER_CONFIG } : m)) } as Instruction), ctx());
      expect(warns(other)).toContain("config");
    }
  });
  it("advance_queue_head is accepted with its config at index 0", () => {
    const d = decodeInstruction(raw(getAdvanceQueueHeadInstruction({ ...common, state: ANY, queue: 2, max: 4 }, o)), ctx());
    expect(warns(d)).toEqual([]);
    expect(detail(d, "queue")?.value).toBe("2");
  });
});
