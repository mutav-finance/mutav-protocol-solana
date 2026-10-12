import { describe, expect, it, vi } from "vitest";
import { address, type Address } from "@solana/kit";
import { conversionNav, findIncomeInboxAddress, findIncomeReceiptPda, findReserveAddresses, getClearFulfilHaltInstructionDataDecoder, getFulfilDepositsInstructionDataDecoder, getSetConfigInstructionDataDecoder, navBoundsAround, publishedNav, coverageFromAccounts, identifyMutavInstruction, MutavInstruction, MUTAV_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { fromHex } from "../serde";
import { composeInstructions, COMPUTE_UNIT_LIMITS, DEFAULT_NAV_TOLERANCE_BPS, describeInstructions, MAX_COMPUTE_UNIT_LIMIT, queueSeqs, refuseOverlappingSetConfig, setComputeUnitLimitInstruction, SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT, unsignedTransaction, withComputeUnitLimit } from "../server/compose";
import { assertRelayable, COMPUTE_BUDGET_PROGRAM, invokedPrograms, isFullySigned, RelayRefusedError } from "../server/relay";
import type { ReserveView } from "../view";
import { config, state } from "./fixtures";

vi.mock("../server/chain", () => ({ rpcFor: () => { throw new Error("no rpc in unit tests"); } }));

const MINT = address("BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4");
const WALLET = address("9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU");
const TREASURY = address("HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo");
const PAYMENTS = address("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

async function reserve(): Promise<ReserveView> {
  const addresses = await findReserveAddresses(MINT);
  return {
    cluster: "localnet",
    programId: MUTAV_PROGRAM_ADDRESS,
    explorerRpc: "http://127.0.0.1:8899",
    addresses,
    config: {
      ...config(),
      reserveMint: MINT,
      reserveTokenProgram: address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
      treasuryAccount: TREASURY,
      paymentsAccount: PAYMENTS,
      mutavCapitalWallet: WALLET,
      investorAllowlistRoot: new Uint8Array(32),
    } as never,
    state: state({ depositHead: 2n, nextDepositSeq: 5n } as never),
    coverage: {} as never,
    now: 0n,
    slot: 0n,
    token: { mint: MINT, mintOwner: null, freezeAuthority: null, supply: null, reserveFrozen: false },
    incomeInbox: { address: await findIncomeInboxAddress({ vaultAuthority: addresses.vaultAuthority, reserveMint: MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS }), exists: true, amount: 0n },
  };
}

const lifetime = { blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", lastValidBlockHeight: 10n };

describe("compose", () => {
  it("fills queue seqs from the head, bounded by the next seq", () => {
    expect(queueSeqs(2n, 5n, 8)).toEqual([2n, 3n, 4n]);
    expect(queueSeqs(2n, 5n, 1)).toEqual([2n]);
    expect(queueSeqs(5n, 5n, 3)).toEqual([]);
  });

  it("refresh takes no remaining accounts (no payout SLA, ADR 0019)", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "refresh" }, WALLET, { reserve: r });
    // config, state, the four token accounts, event authority, program.
    expect(ix!.accounts!.length).toBe(8);
  });

  it("fulfil_deposits appends the request PDAs from the head, writable", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r });
    const d = describeInstructions([ix!])[0]!;
    expect(d.accounts.slice(-3).every((a) => a.writable && !a.signer)).toBe(true);
    expect(d.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([WALLET]);
  });

  it("set_config is sparse: one param per changed field, a refresh before and after when c changes", async () => {
    const r = await reserve();
    const ixs = await composeInstructions({ kind: "set_config", coverageRatioBps: 5_000 }, WALLET, { reserve: r });
    expect(ixs.map((ix) => identifyMutavInstruction(ix.data!))).toEqual([MutavInstruction.Refresh, MutavInstruction.SetConfig, MutavInstruction.Refresh]);
    const d = getSetConfigInstructionDataDecoder().decode(ixs[1]!.data!);
    expect(d.params).toEqual([{ __kind: "CoverageRatioBps", fields: [5_000] }]);
    // A change that needs no refresh is set_config alone.
    const only = await composeInstructions({ kind: "set_config", feeTakeBps: 1_500 }, WALLET, { reserve: r });
    expect(only.map((ix) => identifyMutavInstruction(ix.data!))).toEqual([MutavInstruction.SetConfig]);
  });

  it("set_roles handles a pending handover: refuses the same key, cancels another one first", async () => {
    const r = await reserve();
    const op = address("HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo");
    const other = address("BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4");
    const pa = address("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");
    const req = { kind: "set_roles", operator: op, pauser: pa } as const;
    const pendingFor = (key: Address, expiresAt: bigint): ReserveView => ({
      ...r,
      now: 100n,
      config: { ...r.config, admin: WALLET, pauser: pa, pendingOperator: key, pendingOperatorExpiresAt: expiresAt, pendingPauser: address("11111111111111111111111111111111"), pendingPauserExpiresAt: 0n },
    });
    await expect(composeInstructions(req, WALLET, { reserve: pendingFor(op, 200n) })).rejects.toThrow(/awaiting accept_role/);
    const kinds = async (v: ReserveView) => (await composeInstructions(req, WALLET, { reserve: v })).map((ix) => identifyMutavInstruction(ix.data!));
    expect(await kinds(pendingFor(other, 200n))).toEqual([MutavInstruction.CancelPending, MutavInstruction.ProposeRole]);
    // Expired: simply replaced.
    expect(await kinds(pendingFor(other, 99n))).toEqual([MutavInstruction.ProposeRole]);
    expect(await kinds(pendingFor(op, 99n))).toEqual([MutavInstruction.ProposeRole]);
  });

  it("clear_fulfil_halt defaults to bounds around the published NAV, fills around the conversion NAV", async () => {
    const base = await reserve();
    const halt = async (v: ReserveView) => getClearFulfilHaltInstructionDataDecoder().decode((await composeInstructions({ kind: "clear_fulfil_halt" }, WALLET, { reserve: v }))[0]!.data!).navBounds;
    // No shares: the published NAV is 0, so the default bounds are [0, 0].
    expect(await halt(base)).toEqual({ min: 0n, max: 0n });
    const v: ReserveView = { ...base, state: { ...base.state, brsBalance: 2_000n * 1_000_000n, sharesOutstanding: 1_000n * 1_000_000n } };
    const sol = coverageFromAccounts(v.config, v.state);
    expect(await halt(v)).toEqual(navBoundsAround(publishedNav(sol.netAssets, v.state.sharesOutstanding), DEFAULT_NAV_TOLERANCE_BPS));
    const fill = (await composeInstructions({ kind: "fulfil_deposits", count: 1 }, WALLET, { reserve: v }))[0]!;
    expect(getFulfilDepositsInstructionDataDecoder().decode(fill.data!).navBounds).toEqual(navBoundsAround(conversionNav(v.state.sharesOutstanding, sol.netAssets), DEFAULT_NAV_TOLERANCE_BPS));
  });

  it("cancel_redeem is signed by the investor and returns the shares to it", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "cancel_redeem", seq: 0n }, WALLET, { reserve: r });
    const d = describeInstructions([ix!])[0]!;
    expect(d.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([WALLET]);
    expect(d.accounts[1]!.address).toBe(WALLET);
  });

  it("set_config writes the NAV-move bound, after a refresh", async () => {
    const r = await reserve();
    const ixs = await composeInstructions({ kind: "set_config", maxNavMoveBps: 500 }, WALLET, { reserve: r });
    expect(ixs.map((x) => identifyMutavInstruction(x.data!))).toEqual([MutavInstruction.Refresh, MutavInstruction.SetConfig, MutavInstruction.Refresh]);
    const ix = ixs[1]!;
    const d = getSetConfigInstructionDataDecoder().decode(ix.data!);
    expect(d.params).toEqual([{ __kind: "MaxNavMoveBps", fields: [500] }]);
    // set_config takes the state account, for the cached coverage_required (#29).
    expect(ix.accounts![2]!.address).toBe((await findReserveAddresses(MINT)).state);
    await expect(composeInstructions({ kind: "set_config", maxNavMoveBps: 10_001 }, WALLET, { reserve: r })).rejects.toThrow(/max_nav_move_bps/);
  });

  it("composes the general admin instructions, each signed by the right key", async () => {
    const r = await reserve();
    const op = "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo";
    const pa = "BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4";
    for (const req of [
      { kind: "set_roles", operator: op, pauser: pa },
      { kind: "set_payments_account", paymentsAccount: pa },
      { kind: "revoke_operator" },
    ] as const) {
      const [ix] = await composeInstructions(req, WALLET, { reserve: r });
      const d = describeInstructions([ix!])[0]!;
      expect([req.kind, d.accounts.filter((a) => a.signer).map((a) => a.address)]).toEqual([req.kind, [WALLET]]);
    }
    await expect(composeInstructions({ kind: "set_roles", operator: op, pauser: op }, WALLET, { reserve: r })).rejects.toThrow(/distinct/);
    await expect(composeInstructions({ kind: "set_payments_account", paymentsAccount: r.config.treasuryAccount }, WALLET, { reserve: r })).rejects.toThrow(/treasury/);
  });

  it("set_config writes each flow's own fields and refuses merged caps out of bound", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "set_config", feeTakeBps: 1_500, caps: { maxClaimPerPeriod: 30_000_000_000n } }, WALLET, { reserve: r });
    const d = getSetConfigInstructionDataDecoder().decode(ix!.data!);
    expect(d.params).toEqual([
      { __kind: "FeeTakeBps", fields: [1_500] },
      { __kind: "MaxClaimPerPeriod", fields: [30_000_000_000n] },
    ]);
    await expect(composeInstructions({ kind: "set_config", feeTakeBps: 3_001 }, WALLET, { reserve: r })).rejects.toThrow(/fee_take_bps/);
    await expect(composeInstructions({ kind: "set_config", caps: { minRequest: r.config.caps.maxRequest + 1n } }, WALLET, { reserve: r })).rejects.toThrow(/min_request/);
  });

  it("set_config shows approvers exactly which fields differ from on-chain", async () => {
    const r = await reserve();
    const ixs = await composeInstructions({ kind: "set_config", caps: { maxTvl: r.config.caps.maxTvl + 1n } }, WALLET, { reserve: r });
    const [d] = describeInstructions(ixs, r.config);
    expect(d!.changes).toEqual([{ field: "caps.max_tvl", from: String(r.config.caps.maxTvl), to: String(r.config.caps.maxTvl + 1n) }]);
    // Nothing to change: refused, so no empty proposal is made.
    await expect(composeInstructions({ kind: "set_config" }, WALLET, { reserve: r })).rejects.toThrow(/nothing to change/);
    // Other instructions carry no diff.
    expect(describeInstructions(await composeInstructions({ kind: "unpause" }, WALLET, { reserve: r }), r.config)[0]!.changes).toBeUndefined();
  });

  it("refuses a second set_config while one is live in the multisig", () => {
    const p = (index: bigint, status: string, instructions: string[]) => ({ index, status, instructions });
    expect(() => refuseOverlappingSetConfig([p(4n, "Executed", ["SetConfig"]), p(3n, "Active", ["SetConfig"])])).toThrow(/execute, reject or cancel proposal #3 first/);
    expect(() => refuseOverlappingSetConfig([p(5n, "Approved", ["Unpause", "SetConfig"])])).toThrow(/#5/);
    expect(() => refuseOverlappingSetConfig([p(3n, "Executed", ["SetConfig"]), p(2n, "Cancelled", ["SetConfig"]), p(1n, "Active", ["FulfilDeposits"])])).not.toThrow();
    // A3: a stale Active one can no longer pass; a stale Approved one still executes.
    expect(() => refuseOverlappingSetConfig([{ ...p(2n, "Active", ["SetConfig"]), stale: true }])).not.toThrow();
    expect(() => refuseOverlappingSetConfig([{ ...p(2n, "Approved", ["SetConfig"]), stale: true }])).toThrow(/#2/);
  });

  it("sweep_income moves the statement from the income inbox, signed by the operator only", async () => {
    const r = await reserve();
    const incomeRefHash = "17".repeat(32);
    const [ix] = await composeInstructions({ kind: "sweep_income", incomeRefHash, period: 202_610, amount: 1_500_000_000n }, WALLET, { reserve: r });
    const d = describeInstructions([ix!])[0]!;
    // The operator signs (and pays rent for the receipt); nobody else does.
    expect(new Set(d.accounts.filter((a) => a.signer).map((a) => a.address))).toEqual(new Set([WALLET]));
    const addrs = d.accounts.map((a) => a.address);
    const [receipt] = await findIncomeReceiptPda({ config: r.addresses.config as never, incomeRefHash: fromHex(incomeRefHash) });
    expect(addrs).toContain(receipt);
    expect(addrs).toContain(r.incomeInbox.address);
    expect(addrs).toContain(r.addresses.reserve);
    // Inbox and reserve are written; the vault authority signs the transfer by CPI, not here.
    expect(d.accounts.find((a) => a.address === r.incomeInbox.address)).toMatchObject({ writable: true, signer: false });
    expect(d.accounts.find((a) => a.address === r.addresses.vaultAuthority)).toMatchObject({ signer: false });
    await expect(composeInstructions({ kind: "sweep_income", incomeRefHash, period: 202_613, amount: 1n }, WALLET, { reserve: r })).rejects.toThrow(/YYYYMM/);
  });

  it("request_deposit refuses a wallet outside the allowlist", async () => {
    const r = await reserve();
    await expect(composeInstructions({ kind: "request_deposit", assets: 1n }, WALLET, { reserve: r, allowlist: [] })).rejects.toThrow(/not in ALLOWLIST/);
  });

  it("request_redeem carries a proof that verifies against the on-chain root", async () => {
    const r = await reserve();
    const { buildAllowlist } = await import("@mutav-finance/mutav-protocol-solana");
    const tree = await buildAllowlist([WALLET, TREASURY]);
    r.config = { ...r.config, investorAllowlistRoot: tree.root };
    r.state = { ...r.state, nextRedeemSeq: 4n };
    const [ix] = await composeInstructions({ kind: "request_redeem", shares: 2_000_000_000n }, WALLET, { reserve: r, allowlist: [WALLET, TREASURY] });
    const d = describeInstructions([ix!])[0]!;
    expect(d.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([WALLET]);
    await expect(composeInstructions({ kind: "request_redeem", shares: 1n }, PAYMENTS, { reserve: r, allowlist: [WALLET, TREASURY] })).rejects.toThrow(/not in ALLOWLIST/);
    await expect(composeInstructions({ kind: "request_redeem", shares: 1n }, WALLET, { reserve: r, allowlist: [WALLET] })).rejects.toThrow(/does not hash/);
  });

  it("request_redeem: a holder outside the allowlist composes with an empty proof (ADR 0023)", async () => {
    const r = await reserve();
    const { buildAllowlist, getRequestRedeemInstructionDataDecoder } = await import("@mutav-finance/mutav-protocol-solana");
    r.config = { ...r.config, investorAllowlistRoot: (await buildAllowlist([WALLET, TREASURY])).root };
    r.state = { ...r.state, nextRedeemSeq: 4n };
    const listed = [WALLET, TREASURY];
    // PAYMENTS is not listed: with shares it may exit, as the program skips the eligibility check.
    const [ix] = await composeInstructions({ kind: "request_redeem", shares: 1_000n }, PAYMENTS, { reserve: r, allowlist: listed, ownerShares: 5_000n });
    const data = getRequestRedeemInstructionDataDecoder().decode(ix!.data!);
    expect(data.eligibility).toEqual({ __kind: "Merkle", proof: [] });
    expect(data.shares).toBe(1_000n);
    expect(describeInstructions([ix!])[0]!.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([PAYMENTS]);
    // Without shares (or no share account) it still needs a proof, which a non-listed wallet cannot build.
    await expect(composeInstructions({ kind: "request_redeem", shares: 1n }, PAYMENTS, { reserve: r, allowlist: listed, ownerShares: 0n })).rejects.toThrow(/not in ALLOWLIST/);
    await expect(composeInstructions({ kind: "request_redeem", shares: 1n }, PAYMENTS, { reserve: r, allowlist: listed, ownerShares: null })).rejects.toThrow(/not in ALLOWLIST/);
  });

  it("cancels and claims are signed by the owner only, with no proof", async () => {
    const r = await reserve();
    for (const kind of ["cancel_deposit", "cancel_redeem", "claim_assets"] as const) {
      const ixs = await composeInstructions({ kind, seq: 3n }, WALLET, { reserve: r });
      const signers = describeInstructions(ixs).flatMap((d) => d.accounts.filter((a) => a.signer).map((a) => a.address));
      expect(new Set(signers)).toEqual(new Set([WALLET]));
    }
  });

  it("composes an unsigned transaction that the relay refuses until signed", async () => {
    const r = await reserve();
    const ixs = await composeInstructions({ kind: "refresh" }, WALLET, { reserve: r });
    const tx = unsignedTransaction(WALLET, ixs, lifetime);
    expect(invokedPrograms(tx)).toEqual([MUTAV_PROGRAM_ADDRESS]);
    expect(isFullySigned(tx)).toBe(false);
    const policy = { mutav: MUTAV_PROGRAM_ADDRESS, squadsProgram: "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf", squadsMultisig: null };
    expect(() => assertRelayable(tx, policy)).toThrow(/not fully signed/);
    expect(() => assertRelayable(tx, { ...policy, mutav: WALLET })).toThrow(RelayRefusedError);
  });

  it("puts SetComputeUnitLimit first for the kinds that can come near 200k CU (opt-level z)", async () => {
    const r = await reserve();
    const fill = await composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r });
    const ixs = withComputeUnitLimit({ kind: "fulfil_deposits", count: 8 }, fill);
    expect(ixs).toHaveLength(fill.length + 1);
    expect(ixs[0]!.programAddress).toBe(COMPUTE_BUDGET_PROGRAM);
    // SetComputeUnitLimit = 2, then the u32 units.
    expect(Array.from(ixs[0]!.data!)).toEqual([2, ...new Uint8Array(new Uint32Array([COMPUTE_UNIT_LIMITS.fulfil_deposits!]).buffer)]);
    expect(ixs.slice(1)).toEqual(fill);
    const tx = unsignedTransaction(WALLET, ixs, lifetime);
    expect(invokedPrograms(tx)).toEqual([COMPUTE_BUDGET_PROGRAM, MUTAV_PROGRAM_ADDRESS]);
    // Kinds well under the default go unchanged.
    const claim = await composeInstructions({ kind: "claim_shares", seq: 3n }, WALLET, { reserve: r });
    expect(withComputeUnitLimit({ kind: "claim_shares", seq: 3n }, claim)).toBe(claim);
    for (const k of ["fulfil_deposits", "fulfil_redeems", "refresh", "set_config", "pay_claim"] as const) {
      expect(COMPUTE_UNIT_LIMITS[k]).toBeGreaterThan(0);
    }
    for (const units of [...Object.values(COMPUTE_UNIT_LIMITS), SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT]) {
      expect(units).toBeLessThanOrEqual(MAX_COMPUTE_UNIT_LIMIT);
    }
    expect(() => setComputeUnitLimitInstruction(MAX_COMPUTE_UNIT_LIMIT + 1)).toThrow(/compute-unit limit/);
    expect(() => setComputeUnitLimitInstruction(0)).toThrow(/compute-unit limit/);
  });

  it("request_deposit and request_redeem carry the owner's price limits (0 = none)", async () => {
    const r = await reserve();
    const { buildAllowlist, getRequestDepositInstructionDataDecoder, getRequestRedeemInstructionDataDecoder } = await import("@mutav-finance/mutav-protocol-solana");
    r.config = { ...r.config, investorAllowlistRoot: (await buildAllowlist([WALLET])).root };
    r.state = { ...r.state, nextRedeemSeq: 4n };
    const ctx = { reserve: r, allowlist: [WALLET] };
    const [dep] = await composeInstructions({ kind: "request_deposit", assets: 5n, minSharesOut: 4n }, WALLET, ctx);
    expect(getRequestDepositInstructionDataDecoder().decode(dep!.data!).minSharesOut).toBe(4n);
    const [dep0] = await composeInstructions({ kind: "request_deposit", assets: 5n }, WALLET, ctx);
    expect(getRequestDepositInstructionDataDecoder().decode(dep0!.data!).minSharesOut).toBe(0n);
    const [red] = await composeInstructions({ kind: "request_redeem", shares: 5n, minAssetsOut: 3n }, WALLET, ctx);
    expect(getRequestRedeemInstructionDataDecoder().decode(red!.data!).minAssetsOut).toBe(3n);
    await expect(composeInstructions({ kind: "request_redeem", shares: 5n, minAssetsOut: -1n }, WALLET, ctx)).rejects.toThrow(/price limit/);
  });

  it("accept_role is signed by the proposed key itself, before it expires", async () => {
    const r = await reserve();
    const { getAcceptRoleInstructionDataDecoder } = await import("@mutav-finance/mutav-protocol-solana");
    r.now = 100n;
    r.config = { ...r.config, pendingOperator: WALLET, pendingOperatorExpiresAt: 200n, pendingPauser: address("11111111111111111111111111111111"), pendingPauserExpiresAt: 0n } as never;
    const [ix] = await composeInstructions({ kind: "accept_role", role: 1 }, WALLET, { reserve: r });
    expect(getAcceptRoleInstructionDataDecoder().decode(ix!.data!).role).toBe(1);
    const d = describeInstructions([ix!])[0]!;
    expect(d.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([WALLET]);
    // The operator acceptance carries both money accounts for the ownership check.
    expect(d.accounts.map((a) => a.address)).toEqual(expect.arrayContaining([TREASURY, PAYMENTS]));
    await expect(composeInstructions({ kind: "accept_role", role: 1 }, PAYMENTS, { reserve: r })).rejects.toThrow(/not the proposed operator/);
    await expect(composeInstructions({ kind: "accept_role", role: 2 }, WALLET, { reserve: r })).rejects.toThrow(/no pauser handover/);
    r.now = 201n;
    await expect(composeInstructions({ kind: "accept_role", role: 1 }, WALLET, { reserve: r })).rejects.toThrow(/expired/);
  });

  it("cancel_pending is an admin instruction", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "cancel_pending", role: 3 }, WALLET, { reserve: r });
    expect(identifyMutavInstruction(ix!.data!)).toBe(MutavInstruction.CancelPending);
  });

  it("A9: set_allowlist_root composes the server's ALLOWLIST and refuses a different list", async () => {
    const r = await reserve();
    const { buildAllowlist, getSetAllowlistRootInstructionDataDecoder } = await import("@mutav-finance/mutav-protocol-solana");
    const [ix] = await composeInstructions({ kind: "set_allowlist_root" }, WALLET, { reserve: r, allowlist: [WALLET, TREASURY] });
    expect(Array.from(getSetAllowlistRootInstructionDataDecoder().decode(ix!.data!).root)).toEqual(Array.from((await buildAllowlist([WALLET, TREASURY])).root));
    await expect(composeInstructions({ kind: "set_allowlist_root", owners: [TREASURY, WALLET] }, WALLET, { reserve: r, allowlist: [WALLET, TREASURY] })).resolves.toHaveLength(1);
    await expect(composeInstructions({ kind: "set_allowlist_root", owners: [WALLET] }, WALLET, { reserve: r, allowlist: [WALLET, TREASURY] })).rejects.toThrow(/differ from the server's ALLOWLIST/);
    await expect(composeInstructions({ kind: "set_allowlist_root" }, WALLET, { reserve: r, allowlist: [] })).rejects.toThrow(/ALLOWLIST is empty/);
  });

  it("fulfil_deposits stops before a head owner who is off the current allowlist", async () => {
    const r = await reserve();
    const { buildAllowlist } = await import("@mutav-finance/mutav-protocol-solana");
    r.config = { ...r.config, investorAllowlistRoot: (await buildAllowlist([WALLET])).root };
    const dep = (seq: bigint, owner: string) => ({ address: `D${seq}`, data: { status: 0, seq, owner, assets: 1n, minSharesOut: 0n } });
    const ledger = (owners: string[]) => ({ guarantees: [], deposits: owners.map((o, i) => dep(2n + BigInt(i), o)) }) as never;
    // Seqs 2, 3 listed; 4 de-listed: fill 2, with the PDAs of seqs 2 and 3 only.
    const [ix] = await composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r, allowlist: [WALLET], ledger: ledger([WALLET, WALLET, TREASURY]) });
    expect(getFulfilDepositsInstructionDataDecoder().decode(ix!.data!).count).toBe(2);
    expect(describeInstructions([ix!])[0]!.accounts.filter((a) => a.writable && !a.signer).length).toBeGreaterThanOrEqual(2);
    const all = await composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r, allowlist: [WALLET], ledger: ledger([WALLET, WALLET, WALLET]) });
    expect(getFulfilDepositsInstructionDataDecoder().decode(all[0]!.data!).count).toBe(8);
    await expect(composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r, allowlist: [WALLET], ledger: ledger([TREASURY]) })).rejects.toThrow(/seq 2 at the head .* not on the current allowlist/);
    await expect(composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r, allowlist: [TREASURY], ledger: ledger([WALLET]) })).rejects.toThrow(/does not hash/);
  });
});
