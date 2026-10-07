import { describe, expect, it, vi } from "vitest";
import { address, AccountRole } from "@solana/kit";
import { findReserveAddresses, MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { composeInstructions, describeInstructions, queueSeqs, unsignedTransaction } from "../server/compose";
import { assertRelayable, invokedPrograms, isFullySigned, RelayRefusedError } from "../server/relay";
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
      price: { tesouroPriceAccount: address("11111111111111111111111111111111"), p0: 1n, t0: 0n, yMaxBps: 0, maxStalenessSecs: 0n, maxDeviationBps: 0, maxNavMoveBps: 10_000, reserved: new Uint8Array(32) },
      exit: { bufferTargetBps: 0, bufferHeadroomBps: 0, bufferReleaseAfterSecs: 0n, curveVersion: 0, hMinBps: 0, hPegBps: 0, hMaxBps: 0, pressureEpochSecs: 0n, minInstantAssets: 0n, maxInstantPerTx: 0n, maxInstantPerWallet: 0n, maxInstantPerPeriod: 0n, instantPeriodSecs: 0n, minHoldSecs: 0n, maxPriceAgeSecs: 0n, allowlistRoot: new Uint8Array(32), barred: Array(4).fill(address("11111111111111111111111111111111")), reserved: new Uint8Array(32) },
    } as never,
    state: state({ depositHead: 2n, nextDepositSeq: 5n } as never),
    solvency: {} as never,
    now: 0n,
    slot: 0n,
    token: { mint: MINT, mintOwner: null, freezeAuthority: null, supply: null, reserveFrozen: false },
  };
}

const lifetime = { blockhash: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", lastValidBlockHeight: 10n };

describe("compose", () => {
  it("fills queue seqs from the head, bounded by the next seq", () => {
    expect(queueSeqs(2n, 5n, 8)).toEqual([2n, 3n, 4n]);
    expect(queueSeqs(2n, 5n, 1)).toEqual([2n]);
    expect(queueSeqs(5n, 5n, 3)).toEqual([]);
  });

  it("refresh passes (guarantee, payout) pairs for pending payouts only", async () => {
    const r = await reserve();
    const payouts = [
      { address: "P1", data: { status: 0, guarantee: "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo" } },
      { address: "P2", data: { status: 1, guarantee: "HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo" } },
    ].map((p) => ({ ...p, address: p.address === "P1" ? "9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU" : "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf" }));
    const [ix] = await composeInstructions({ kind: "refresh" }, WALLET, { reserve: r, ledger: { payouts: payouts as never, guarantees: [] } });
    const tail = ix!.accounts!.slice(-2);
    expect(tail.map((a) => [a.address, a.role])).toEqual([
      ["HnDdop5PFqvVKZNujsuakwm2K5GskAUk1GxzbDSdGuMo", AccountRole.READONLY],
      ["9b4N73CtqN6PWE9tvocRvGjJnSfiy94oev4wbR31xMeU", AccountRole.WRITABLE],
    ]);
  });

  it("fulfil_deposits appends the request PDAs from the head, writable", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "fulfil_deposits", count: 8 }, WALLET, { reserve: r });
    const d = describeInstructions([ix!])[0]!;
    expect(d.accounts.slice(-3).every((a) => a.writable && !a.signer)).toBe(true);
    expect(d.accounts.filter((a) => a.signer).map((a) => a.address)).toEqual([WALLET]);
  });

  it("set_config writes only the requested change and carries the rest", async () => {
    const r = await reserve();
    const [ix] = await composeInstructions({ kind: "set_config", coverageRatioBps: 15_000 }, WALLET, { reserve: r });
    expect(ix!.programAddress).toBe(MUTAV_PROGRAM_ADDRESS);
    expect(ix!.data!.length).toBeGreaterThan(8);
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
    expect(() => assertRelayable(tx, [MUTAV_PROGRAM_ADDRESS])).toThrow(/not fully signed/);
    expect(() => assertRelayable(tx, [])).toThrow(RelayRefusedError);
  });
});
