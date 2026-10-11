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
  isAddress,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
} from "@solana/kit";
import {
  buildAllowlist,
  capsInputFromConfig,
  configParamsDiff,
  configParamsNeedRefresh,
  conversionNav,
  getProposeRoleInstruction,
  navBoundsAround,
  solvencyFromAccounts,
  type NavBounds,
  fetchGuarantee,
  getCancelDepositInstruction,
  getCancelRedeemInstruction,
  getClaimAssetsInstruction,
  getRequestRedeemInstruction,
  findClaimFilingPda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findGuaranteePda,
  findIncomeInboxAddress,
  findIncomeReceiptPda,
  isValidIncomePeriod,
  findRedeemRequestPda,
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
  getSetPaymentsAccountInstruction,
  getRevokeOperatorInstruction,
  getSetConfigInstruction,
  getSettlePayoutInstruction,
  getSweepIncomeInstruction,
  getUnpauseInstruction,
  identifyMutavInstruction,
  MutavInstruction,
  type VaultConfig,
} from "@mutav-finance/mutav-protocol-solana";
import { ALLOWLIST_TEXT, checkAllowlist } from "../allowlist";
import { capsError, generalConfigError, rolesError } from "../admin";
import { pendingSetConfig, pendingSetConfigText, setConfigChanges, type ConfigChange } from "../config-diff";
import { fromHex } from "../serde";
import type { TxRequest } from "../tx-kinds";
import { ADMIN_KINDS } from "../tx-kinds";
import type { Ledger, ReserveView } from "../view";
import { READ, rpcFor } from "./chain";
import { serverEnv, type ServerEnv } from "./env";

export const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
export const TOKEN_PROGRAM = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM = address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");

/** `close_guarantee` reason RELEASED and the role ids of `propose_role` (ADR 0020). */
const CLOSE_RELEASED = 1;
const ROLE_OPERATOR = 1;
const ROLE_PAUSER = 2;
/** Default NAV tolerance of a fill or halt-clear proposal: ±1%. */
export const DEFAULT_NAV_TOLERANCE_BPS = 100;

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
  /** The guarantees, for the operator instructions that address one by account. */
  ledger?: Pick<Ledger, "guarantees">;
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
  const refreshIx = () =>
    getRefreshInstruction(
      { ...common, state: a.state, reserve: a.reserve, pendingDeposits: a.pendingDeposits, pendingRedemptions: a.pendingRedemptions, claims: a.claims },
      o,
    );
  // The NAV the admin sees now, ± a tolerance (ADR 0023): a proposal that
  // executes after a larger move is refused with `NavOutOfBounds`.
  const navBounds = (draft?: { min: bigint; max: bigint }): NavBounds => {
    if (draft) {
      if (draft.min > draft.max) throw new ComposeError("NAV bounds: min must be ≤ max");
      return draft;
    }
    const sol = solvencyFromAccounts(r.config, r.state);
    return navBoundsAround(conversionNav(r.state.sharesOutstanding, sol.netAssets), DEFAULT_NAV_TOLERANCE_BPS);
  };

  switch (req.kind) {
    // ── public ──────────────────────────────────────────────────────────────
    case "refresh": {
      // `refresh` takes no remaining accounts (no payout SLA, ADR 0019).
      return [refreshIx()];
    }

    // ── operator ────────────────────────────────────────────────────────────
    case "register_guarantee": {
      const id = bytes32(req.id, "id");
      const agencyId = bytes32(req.agencyId, "agencyId");
      const [guarantee] = await findGuaranteePda({ config, id }, o);
      return [
        getRegisterGuaranteeInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            guarantee,
            reserve: a.reserve,
            payer: signer,
            systemProgram: SYSTEM_PROGRAM,
            id,
            agencyId,
            refsHash: bytes32(req.refsHash, "refsHash"),
            defaultCover: req.defaultCover,
            exitCover: req.exitCover,
          },
          o,
        ),
      ];
    }
    case "close_guarantee": {
      const g = await guaranteeAccount(ctx, req.guarantee);
      return [getCloseGuaranteeInstruction({ ...common, operator: signer, state: a.state, guarantee: g.address, id: g.data.id, reason: req.reason ?? CLOSE_RELEASED }, o)];
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
    case "sweep_income": {
      // ADR 0017: the vault authority moves the statement's amount from the
      // income inbox into the reserve; the operator signs the instruction.
      if (!isValidIncomePeriod(req.period)) throw new ComposeError("period must be a YYYYMM month");
      const incomeRefHash = bytes32(req.incomeRefHash, "incomeRefHash");
      const [incomeReceipt] = await findIncomeReceiptPda({ config, incomeRefHash }, o);
      return [
        getSweepIncomeInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            incomeReceipt,
            incomeInbox: await findIncomeInboxAddress({ vaultAuthority: a.vaultAuthority, reserveMint: mint, tokenProgram }),
            reserve: a.reserve,
            vaultAuthority: a.vaultAuthority,
            reserveMint: mint,
            tokenProgram,
            payer: signer,
            systemProgram: SYSTEM_PROGRAM,
            incomeRefHash,
            period: req.period,
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
      return [
        getPayClaimInstruction(
          {
            ...common,
            operator: signer,
            state: a.state,
            guarantee: g.address,
            claimFiling,
            reserve: a.reserve,
            paymentsAccount: r.config.paymentsAccount,
            vaultAuthority: a.vaultAuthority,
            reserveMint: mint,
            tokenProgram,
            noticeRefHash,
            expectedAmount: req.amount,
          },
          o,
        ),
      ];
    }
    case "settle_payout": {
      const guarantee = address(req.guarantee);
      const noticeRefHash = bytes32(req.noticeRefHash, "noticeRefHash");
      const [claimFiling] = await findClaimFilingPda({ guarantee, noticeRefHash }, o);
      return [
        getSettlePayoutInstruction(
          { ...common, operator: signer, guarantee, claimFiling, noticeRefHash, pixE2eHash: bytes32(req.pixE2eHash, "pixE2eHash") },
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
            source: await associatedTokenAddress(signerAddress, mint, tokenProgram),
            pendingDeposits: a.pendingDeposits,
            reserveMint: mint,
            tokenProgram,
            systemProgram: SYSTEM_PROGRAM,
            assets: req.assets,
            minSharesOut: 0n,
            eligibility: { __kind: "Merkle", proof },
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
            signer,
            owner: signerAddress,
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
            minAssetsOut: 0n,
            eligibility: { __kind: "Merkle", proof },
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
      // The program creates the owner's token account if needed (ADR 0023).
      return [
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
        getClaimSharesInstruction(
          {
            ...common,
            owner: signer,
            depositRequest: (await findDepositRequestPda({ config, seq: req.seq }, o))[0],
            shareMint: a.shareMint,
            ownerShares: await associatedTokenAddress(signerAddress, a.shareMint),
            vaultAuthority: a.vaultAuthority,
            shareTokenProgram: TOKEN_PROGRAM,
          },
          o,
        ),
      ];
    }

    // ── admin (direct on localnet, or inside a Squads proposal) ─────────────
    case "fulfil_deposits": {
      const seqs = queueSeqs(r.state.depositHead, r.state.nextDepositSeq, req.count);
      const ix = getFulfilDepositsInstruction(
        { ...common, admin: signer, state: a.state, pendingDeposits: a.pendingDeposits, reserve: a.reserve, vaultAuthority: a.vaultAuthority, reserveMint: mint, tokenProgram, count: req.count, navBounds: navBounds(req.navBounds) },
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
          navBounds: navBounds(req.navBounds),
        },
        o,
      );
      const pdas = await Promise.all(seqs.map(async (seq) => (await findRedeemRequestPda({ config, seq }, o))[0]));
      return [withRemaining(ix, pdas.map((p) => ({ address: p, role: AccountRole.WRITABLE })))];
    }
    case "pause":
      return [getPauseInstruction({ ...common, signer }, o)];
    case "revoke_operator":
      return [getRevokeOperatorInstruction({ ...common, signer }, o)];
    case "set_roles": {
      const bad = rolesError(req, r.config.admin);
      if (bad) throw new ComposeError(bad);
      // Two-step handover (ADR 0020): propose each changed key; the new key
      // signs `accept_role` itself.
      const out: Instruction[] = [];
      for (const [role, key, now] of [
        [ROLE_OPERATOR, req.operator, r.config.operator],
        [ROLE_PAUSER, req.pauser, r.config.pauser],
      ] as const) {
        if (key !== now) out.push(getProposeRoleInstruction({ ...common, admin: signer, role, key: address(key) }, o));
      }
      if (out.length === 0) throw new ComposeError("operator and pauser already hold these keys");
      return out;
    }
    case "set_payments_account": {
      if (!isAddress(req.paymentsAccount)) throw new ComposeError("payments account is not an address");
      if (req.paymentsAccount === r.config.treasuryAccount) throw new ComposeError("the payments account must differ from the treasury account (spec §2.1)");
      return [getSetPaymentsAccountInstruction({ ...common, admin: signer, paymentsAccount: address(req.paymentsAccount), treasuryAccount: r.config.treasuryAccount }, o)];
    }
    case "unpause":
      return [getUnpauseInstruction({ ...common, admin: signer }, o)];
    case "clear_fulfil_halt":
      return [getClearFulfilHaltInstruction({ ...common, admin: signer, state: a.state, reserve: a.reserve, navBounds: navBounds(req.navBounds) }, o)];
    case "set_config": {
      // Write only what changed; carry every other field over as it is on-chain.
      const c = r.config;
      const caps = capsInputFromConfig(c.caps);
      const bad = generalConfigError(req) ?? capsError({ ...caps, ...(req.caps ?? {}) });
      if (bad) throw new ComposeError(bad);
      // Sparse (ADR 0026): one param per field that differs from on-chain.
      const params = configParamsDiff(c, {
        coverageRatioBps: req.coverageRatioBps ?? c.coverageRatioBps,
        feeTakeBps: req.feeTakeBps ?? c.feeTakeBps,
        featureFlags: c.featureFlags,
        mutavCapitalWallet: c.mutavCapitalWallet,
        caps: { ...caps, ...(req.caps ?? {}), ...(req.maxNavMoveBps !== undefined ? { maxNavMoveBps: req.maxNavMoveBps } : {}) },
      });
      if (params.length === 0) throw new ComposeError("nothing to change: every field already has this value");
      const setConfig = getSetConfigInstruction(
        { ...common, admin: signer, state: a.state, treasuryAccount: c.treasuryAccount, paymentsAccount: c.paymentsAccount, params },
        o,
      );
      // c, the NAV-move bound and the stress buffer need a refresh in the same slot.
      return configParamsNeedRefresh(params) ? [refreshIx(), setConfig] : [setConfig];
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
export function describeInstructions(ixs: Instruction[], config?: VaultConfig) {
  return ixs.map((ix) => {
    const accounts = (ix.accounts ?? []).map((m) => ({
      address: m.address as string,
      writable: m.role === AccountRole.WRITABLE || m.role === AccountRole.WRITABLE_SIGNER,
      signer: m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER,
    }));
    let changes: ConfigChange[] | undefined;
    // Callers pass only MUTAV instructions with a config (the build route's composed set).
    if (config && ix.data && ix.data.length >= 8) {
      try {
        if (identifyMutavInstruction(ix.data) === MutavInstruction.SetConfig) changes = setConfigChanges(new Uint8Array(ix.data), config);
      } catch {
        changes = undefined;
      }
    }
    return { program: ix.programAddress as string, accounts, ...(changes ? { changes } : {}) };
  });
}

/**
 * Refuses a second set_config while one is live in the multisig: set_config
 * writes every field, so the later one would undo the earlier when both run.
 */
export function refuseOverlappingSetConfig(proposals: Parameters<typeof pendingSetConfig>[0]) {
  const pending = pendingSetConfig(proposals);
  if (pending !== null) throw new ComposeError(pendingSetConfigText(pending));
}
