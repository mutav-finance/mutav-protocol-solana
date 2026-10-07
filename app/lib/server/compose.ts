/**
 * Instruction composition for every action the app offers, through the
 * protocol client's generated builders. Signer accounts are filled with
 * no-op signers for the *address* that must sign (the connected wallet, or the
 * Squads vault inside a proposal); nothing here holds or reads a key.
 */
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getAddressEncoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  buildAllowlist,
  fetchGuarantee,
  getCancelDepositInstruction,
  getCancelRedeemInstruction,
  getClaimAssetsInstruction,
  getRequestRedeemInstruction,
  findClaimFilingPda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findGuaranteePda,
  findHolderStatePda,
  findPayoutPda,
  findRedeemRequestPda,
  findAgencyExposurePda,
  getClaimSharesInstruction,
  getClearFulfilHaltInstruction,
  getCloseGuaranteeInstruction,
  getContributeFeesInstruction,
  getFileClaimInstruction,
  getFulfilDepositsInstruction,
  getFulfilRedeemsInstruction,
  getPauseInstruction,
  getPayClaimInstruction,
  getRefreshInstruction,
  getRegisterGuaranteeInstruction,
  getRequestDepositInstruction,
  getSetAllowlistRootInstruction,
  getSetConfigInstruction,
  getSettlePayoutInstruction,
  getUnpauseInstruction,
} from "@mutav-finance/mutav-protocol-solana";
import { ALLOWLIST_TEXT, checkAllowlist } from "../allowlist";
import { fromHex } from "../serde";
import type { TxRequest } from "../tx-kinds";
import { ADMIN_KINDS } from "../tx-kinds";
import type { Ledger, ReserveView } from "../view";
import { READ, rpcFor } from "./chain";
import { serverEnv, type ServerEnv } from "./env";

export const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
export const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

export async function associatedTokenAddress(owner: Address, mint: Address, tokenProgram: Address = TOKEN_PROGRAM) {
  const e = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [e.encode(owner), e.encode(tokenProgram), e.encode(mint)],
  });
  return ata;
}

/** Associated Token Account program `CreateIdempotent` (instruction 1). */
export async function createAtaIdempotent(payer: Address, owner: Address, mint: Address, tokenProgram: Address = TOKEN_PROGRAM): Promise<Instruction> {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    accounts: [
      { address: payer, role: AccountRole.WRITABLE_SIGNER },
      { address: await associatedTokenAddress(owner, mint, tokenProgram), role: AccountRole.WRITABLE },
      { address: owner, role: AccountRole.READONLY },
      { address: mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: tokenProgram, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}

const bytes32 = (hex: string, what: string) => {
  const b = fromHex(hex);
  if (b.length !== 32) throw new Error(`${what} must be 32 bytes of hex`);
  return b;
};

const withRemaining = (ix: Instruction, accounts: { address: Address; role: AccountRole }[]): Instruction => ({
  ...ix,
  accounts: [...(ix.accounts ?? []), ...accounts],
});

export type ComposeContext = {
  reserve: ReserveView;
  /** Needed for `refresh` (pending payouts) and for `request_deposit` (allowlist). */
  ledger?: Pick<Ledger, "payouts" | "guarantees">;
  /** Allowlisted owners, to build the Merkle proof for `request_deposit` / `request_redeem`. */
  allowlist?: string[];
  /** Server env for re-reads (defaults to process.env). */
  env?: ServerEnv;
};

export class ComposeError extends Error {
  override name = "ComposeError";
}

/**
 * The instructions for `req`, signed by `signer` (the connected wallet, or
 * the Squads vault for an admin action inside a proposal).
 */
export async function composeInstructions(req: TxRequest, signerAddress: Address, ctx: ComposeContext): Promise<Instruction[]> {
  const r = ctx.reserve;
  const programAddress = address(r.programId);
  const o = { programAddress };
  const config = address(r.addresses.config);
  const a = {
    state: address(r.addresses.state),
    reserve: address(r.addresses.reserve),
    pendingDeposits: address(r.addresses.pendingDeposits),
    pendingRedemptions: address(r.addresses.pendingRedemptions),
    claims: address(r.addresses.claims),
    vaultAuthority: address(r.addresses.vaultAuthority),
    shareMint: address(r.addresses.shareMint),
    eventAuthority: address(r.addresses.eventAuthority),
  };
  const mint = r.config.reserveMint;
  const tokenProgram = r.config.reserveTokenProgram;
  const signer = createNoopSigner(signerAddress);
  const common = { config, eventAuthority: a.eventAuthority, program: programAddress };

  switch (req.kind) {
    // ── public ──────────────────────────────────────────────────────────────
    case "refresh": {
      const ix = getRefreshInstruction(
        { ...common, state: a.state, reserve: a.reserve, pendingDeposits: a.pendingDeposits, pendingRedemptions: a.pendingRedemptions, claims: a.claims },
        o,
      );
      // (Guarantee, Payout) pairs for every pending payout, so `refresh` records late flags.
      const pending = (ctx.ledger?.payouts ?? []).filter((p) => p.data.status === 0).slice(0, 10);
      return [
        withRemaining(
          ix,
          pending.flatMap((p) => [
            { address: address(p.data.guarantee), role: AccountRole.READONLY },
            { address: address(p.address), role: AccountRole.WRITABLE },
          ]),
        ),
      ];
    }

    // ── operator ────────────────────────────────────────────────────────────
    case "register_guarantee": {
      const id = bytes32(req.id, "id");
      const agencyId = bytes32(req.agencyId, "agencyId");
      const [guarantee] = await findGuaranteePda({ config, id }, o);
      const [agencyExposure] = await findAgencyExposurePda({ config, agencyId }, o);
      return [
        getRegisterGuaranteeInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            guarantee,
            agencyExposure,
            payer: signer,
            systemProgram: SYSTEM_PROGRAM,
            id,
            agencyId,
            refsHash: bytes32(req.refsHash, "refsHash"),
            rent: req.rent,
            defaultMultiplierBps: req.defaultMultiplierBps,
            exitMultiplierBps: req.exitMultiplierBps,
            defaultCover: req.defaultCover,
            exitCover: req.exitCover,
          },
          o,
        ),
      ];
    }
    case "close_guarantee": {
      const g = await guaranteeAccount(ctx, req.guarantee);
      const [agencyExposure] = await findAgencyExposurePda({ config, agencyId: g.data.agencyId }, o);
      return [getCloseGuaranteeInstruction({ ...common, operator: signer, state: a.state, guarantee: g.address, agencyExposure, id: g.data.id }, o)];
    }
    case "contribute_fees": {
      const invoiceRefHash = bytes32(req.invoiceRefHash, "invoiceRefHash");
      const [feeReceipt] = await findFeeReceiptPda({ config, invoiceRefHash }, o);
      return [
        getContributeFeesInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            feeReceipt,
            source: await associatedTokenAddress(signerAddress, mint, tokenProgram),
            reserve: a.reserve,
            treasuryAccount: r.config.treasuryAccount,
            reserveMint: mint,
            tokenProgram,
            payer: signer,
            systemProgram: SYSTEM_PROGRAM,
            invoiceRefHash,
            amount: req.amount,
          },
          o,
        ),
      ];
    }
    case "file_claim": {
      const guarantee = address(req.guarantee);
      const noticeRefHash = bytes32(req.noticeRefHash, "noticeRefHash");
      const [claimFiling] = await findClaimFilingPda({ guarantee, noticeRefHash }, o);
      return [
        getFileClaimInstruction(
          { ...common, operator: signer, state: a.state, guarantee, claimFiling, payer: signer, systemProgram: SYSTEM_PROGRAM, leg: req.leg, amount: req.amount, noticeRefHash },
          o,
        ),
      ];
    }
    case "pay_claim": {
      const g = await guaranteeAccount(ctx, req.guarantee);
      const noticeRefHash = bytes32(req.noticeRefHash, "noticeRefHash");
      const [claimFiling] = await findClaimFilingPda({ guarantee: g.address, noticeRefHash }, o);
      const [payout] = await findPayoutPda({ guarantee: g.address, noticeRefHash }, o);
      const [agencyExposure] = await findAgencyExposurePda({ config, agencyId: g.data.agencyId }, o);
      return [
        getPayClaimInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            guarantee: g.address,
            agencyExposure,
            claimFiling,
            payout,
            reserve: a.reserve,
            paymentsAccount: r.config.paymentsAccount,
            vaultAuthority: a.vaultAuthority,
            reserveMint: mint,
            tokenProgram,
            payer: signer,
            systemProgram: SYSTEM_PROGRAM,
            leg: req.leg,
            amount: req.amount,
            noticeRefHash,
          },
          o,
        ),
      ];
    }
    case "settle_payout": {
      const guarantee = address(req.guarantee);
      const noticeRefHash = bytes32(req.noticeRefHash, "noticeRefHash");
      const [payout] = await findPayoutPda({ guarantee, noticeRefHash }, o);
      return [
        getSettlePayoutInstruction(
          { ...common, operator: signer, guarantee, payout, noticeRefHash, pixE2eHash: bytes32(req.pixE2eHash, "pixE2eHash") },
          o,
        ),
      ];
    }

    // ── investor (allowlisted owner; MUTAV's capital wallet in the pilot) ───
    case "request_deposit": {
      const proof = await allowlistProof(ctx, signerAddress);
      const seq = r.state.nextDepositSeq;
      return [
        getRequestDepositInstruction(
          {
            ...common,
            owner: signer,
            state: a.state,
            depositRequest: (await findDepositRequestPda({ config, seq }, o))[0],
            holderState: (await findHolderStatePda({ config, owner: signerAddress }, o))[0],
            source: await associatedTokenAddress(signerAddress, mint, tokenProgram),
            pendingDeposits: a.pendingDeposits,
            reserveMint: mint,
            tokenProgram,
            systemProgram: SYSTEM_PROGRAM,
            assets: req.assets,
            proof,
          },
          o,
        ),
      ];
    }
    case "cancel_deposit": {
      return [
        getCancelDepositInstruction(
          {
            ...common,
            owner: signer,
            state: a.state,
            depositRequest: (await findDepositRequestPda({ config, seq: req.seq }, o))[0],
            destination: await associatedTokenAddress(signerAddress, mint, tokenProgram),
            pendingDeposits: a.pendingDeposits,
            vaultAuthority: a.vaultAuthority,
            reserveMint: mint,
            tokenProgram,
          },
          o,
        ),
      ];
    }
    case "request_redeem": {
      const proof = await allowlistProof(ctx, signerAddress);
      const seq = r.state.nextRedeemSeq;
      return [
        getRequestRedeemInstruction(
          {
            ...common,
            owner: signer,
            state: a.state,
            redeemRequest: (await findRedeemRequestPda({ config, seq }, o))[0],
            ownerShares: await associatedTokenAddress(signerAddress, a.shareMint),
            pendingRedemptions: a.pendingRedemptions,
            shareMint: a.shareMint,
            shareTokenProgram: TOKEN_PROGRAM,
            systemProgram: SYSTEM_PROGRAM,
            shares: req.shares,
            proof,
          },
          o,
        ),
      ];
    }
    case "cancel_redeem": {
      return [
        getCancelRedeemInstruction(
          {
            ...common,
            owner: signer,
            state: a.state,
            redeemRequest: (await findRedeemRequestPda({ config, seq: req.seq }, o))[0],
            ownerShares: await associatedTokenAddress(signerAddress, a.shareMint),
            pendingRedemptions: a.pendingRedemptions,
            vaultAuthority: a.vaultAuthority,
            shareMint: a.shareMint,
            shareTokenProgram: TOKEN_PROGRAM,
          },
          o,
        ),
      ];
    }
    case "claim_assets": {
      return [
        await createAtaIdempotent(signerAddress, signerAddress, mint, tokenProgram),
        getClaimAssetsInstruction(
          {
            ...common,
            owner: signer,
            state: a.state,
            redeemRequest: (await findRedeemRequestPda({ config, seq: req.seq }, o))[0],
            destination: await associatedTokenAddress(signerAddress, mint, tokenProgram),
            claims: a.claims,
            vaultAuthority: a.vaultAuthority,
            reserveMint: mint,
            tokenProgram,
          },
          o,
        ),
      ];
    }
    case "claim_shares": {
      return [
        await createAtaIdempotent(signerAddress, signerAddress, a.shareMint),
        getClaimSharesInstruction(
          {
            ...common,
            owner: signer,
            depositRequest: (await findDepositRequestPda({ config, seq: req.seq }, o))[0],
            holderState: (await findHolderStatePda({ config, owner: signerAddress }, o))[0],
            shareMint: a.shareMint,
            ownerShares: await associatedTokenAddress(signerAddress, a.shareMint),
            vaultAuthority: a.vaultAuthority,
            shareTokenProgram: TOKEN_PROGRAM,
            systemProgram: SYSTEM_PROGRAM,
          },
          o,
        ),
      ];
    }

    // ── admin (direct on localnet, or inside a Squads proposal) ─────────────
    case "fulfil_deposits": {
      const seqs = queueSeqs(r.state.depositHead, r.state.nextDepositSeq, req.count);
      const ix = getFulfilDepositsInstruction(
        { ...common, admin: signer, state: a.state, pendingDeposits: a.pendingDeposits, reserve: a.reserve, vaultAuthority: a.vaultAuthority, reserveMint: mint, tokenProgram, count: req.count },
        o,
      );
      const pdas = await Promise.all(seqs.map(async (seq) => (await findDepositRequestPda({ config, seq }, o))[0]));
      return [withRemaining(ix, pdas.map((p) => ({ address: p, role: AccountRole.WRITABLE })))];
    }
    case "fulfil_redeems": {
      const seqs = queueSeqs(r.state.redeemHead, r.state.nextRedeemSeq, req.count);
      const ix = getFulfilRedeemsInstruction(
        {
          ...common,
          admin: signer,
          state: a.state,
          reserve: a.reserve,
          claims: a.claims,
          pendingRedemptions: a.pendingRedemptions,
          shareMint: a.shareMint,
          vaultAuthority: a.vaultAuthority,
          reserveMint: mint,
          tokenProgram,
          shareTokenProgram: TOKEN_PROGRAM,
          count: req.count,
          maxAssets: req.maxAssets,
        },
        o,
      );
      const pdas = await Promise.all(seqs.map(async (seq) => (await findRedeemRequestPda({ config, seq }, o))[0]));
      return [withRemaining(ix, pdas.map((p) => ({ address: p, role: AccountRole.WRITABLE })))];
    }
    case "pause":
      return [getPauseInstruction({ ...common, signer }, o)];
    case "unpause":
      return [getUnpauseInstruction({ ...common, admin: signer }, o)];
    case "clear_fulfil_halt":
      return [getClearFulfilHaltInstruction({ ...common, admin: signer, state: a.state }, o)];
    case "set_config": {
      // Write only what changed; carry every other field over as it is on-chain.
      const c = r.config;
      const { reserved: _c, ...caps } = c.caps;
      const { reserved: _p, ...price } = c.price;
      const { reserved: _e, ...exit } = c.exit;
      void _c;
      void _p;
      void _e;
      return [
        getSetConfigInstruction(
          {
            ...common,
            admin: signer,
            treasuryAccount: c.treasuryAccount,
            paymentsAccount: c.paymentsAccount,
            coverageRatioBps: req.coverageRatioBps ?? c.coverageRatioBps,
            feeTakeBps: c.feeTakeBps,
            payoutSlaSecs: c.payoutSlaSecs,
            featureFlags: c.featureFlags,
            mutavCapitalWallet: c.mutavCapitalWallet,
            caps: { ...caps, ...(req.caps ?? {}) },
            price,
            exit,
          },
          o,
        ),
      ];
    }
    case "set_allowlist_root": {
      const tree = await buildAllowlist(req.owners.map((x) => address(x)));
      return [getSetAllowlistRootInstruction({ ...common, admin: signer, root: tree.root }, o)];
    }
  }
}

/**
 * The Merkle proof for `request_deposit` / `request_redeem`, built from
 * ALLOWLIST and verified against the on-chain root. Refuses otherwise: the
 * program would reject the request with `NotAllowlisted`.
 */
async function allowlistProof(ctx: ComposeContext, owner: Address): Promise<Uint8Array[]> {
  const listed = ctx.allowlist ?? [];
  const check = await checkAllowlist(ctx.reserve.config.investorAllowlistRoot, listed, owner);
  if (check.state === "not-listed" || !listed.includes(owner)) throw new ComposeError("the connected wallet is not in ALLOWLIST, so no Merkle proof can be built");
  if (!check.proof) throw new ComposeError(ALLOWLIST_TEXT[check.state]);
  return check.proof;
}

/** Seqs from the head, skipping none, at most `count`. */
export function queueSeqs(head: bigint, next: bigint, count: number): bigint[] {
  const n = Math.max(0, Math.min(count, Number(next - head)));
  return Array.from({ length: n }, (_, i) => head + BigInt(i));
}

/** Re-read the guarantee so its id and agency come from the chain, not from the browser. */
async function guaranteeAccount(ctx: ComposeContext, guarantee: string) {
  return fetchGuarantee(rpcFor(ctx.env ?? serverEnv()), address(guarantee), READ);
}

/** Is this kind an admin action (so it may be wrapped in a Squads proposal)? */
export const isAdminKind = (req: TxRequest) => ADMIN_KINDS.has(req.kind);

/**
 * An unsigned v0 transaction paid by `feePayer`, as base64 wire bytes. The
 * wallet adds every signature.
 */
export function unsignedTransaction(feePayer: Address, ixs: Instruction[], lifetime: { blockhash: string; lastValidBlockHeight: bigint }): string {
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(lifetime as never, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  return getBase64EncodedWireTransaction(compileTransaction(msg));
}

/** For the UI: which accounts an instruction touches, and how. */
export function describeInstructions(ixs: Instruction[]) {
  return ixs.map((ix) => ({
    program: ix.programAddress as string,
    accounts: (ix.accounts ?? []).map((m) => ({
      address: m.address as string,
      writable: m.role === AccountRole.WRITABLE || m.role === AccountRole.WRITABLE_SIGNER,
      signer: m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER,
    })),
  }));
}
