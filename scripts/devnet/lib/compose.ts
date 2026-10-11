/**
 * Instruction composers for the deploy steps. Each takes the signer *roles*
 * as `TransactionSigner`s: for a Squads proposal they are no-op signers for
 * the vault address (the vault signs when the proposal executes); in the
 * local dry run they are throwaway in-memory keys. Nothing here signs.
 */
import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import {
  configParamsDiff,
  configParamsNeedRefresh,
  findIncomeInboxAddress,
  findReserveAddresses,
  getAcceptRoleInstruction,
  getInitializeInstruction,
  getProposeRoleInstruction,
  getRefreshInstruction,
  getSetAllowlistRootInstruction,
  getSetConfigInstruction,
  type VaultConfig,
} from '../../../clients/js/src';

/** Role ids of `propose_role` / `accept_role` (ADR 0020). */
export const ROLE_OPERATOR = 1;
export const ROLE_PAUSER = 2;
import type { DeployConfig } from './config';

export const BPF_LOADER_UPGRADEABLE = address('BPFLoaderUpgradeab1e11111111111111111111111');
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
export const TOKEN_PROGRAM = address('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

export const ASSOCIATED_TOKEN_PROGRAM = address('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

/** The associated token account of `owner` for `mint` (classic SPL Token). */
export async function associatedTokenAddress(owner: Address, mint: Address, tokenProgram = TOKEN_PROGRAM): Promise<Address> {
  const e = getAddressEncoder();
  const [ata] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM,
    seeds: [e.encode(owner), e.encode(tokenProgram), e.encode(mint)],
  });
  return ata;
}

export async function programDataAddress(programId: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: BPF_LOADER_UPGRADEABLE,
    seeds: [getAddressEncoder().encode(programId)],
  });
  return pda;
}

const opts = (cfg: DeployConfig) => ({ programAddress: cfg.programId });

/** `initialize`: signed by the program's upgrade authority, which also pays. */
export async function composeInitialize(
  cfg: DeployConfig,
  s: { upgradeAuthority: TransactionSigner; payer: TransactionSigner },
): Promise<Instruction> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  return getInitializeInstruction(
    {
      payer: s.payer,
      upgradeAuthority: s.upgradeAuthority,
      programData: await programDataAddress(cfg.programId),
      reserveMint: cfg.reserveMint,
      config: a.config,
      state: a.state,
      vaultAuthority: a.vaultAuthority,
      shareMint: a.shareMint,
      reserve: a.reserve,
      pendingDeposits: a.pendingDeposits,
      pendingRedemptions: a.pendingRedemptions,
      claims: a.claims,
      unsolicited: a.unsolicited,
      // ADR 0017: the income inbox Nora pays, created idempotently.
      incomeInbox: await findIncomeInboxAddress({
        vaultAuthority: a.vaultAuthority,
        reserveMint: cfg.reserveMint,
        tokenProgram: cfg.reserveTokenProgram,
      }),
      treasuryAccount: cfg.treasuryAccount,
      paymentsAccount: cfg.paymentsAccount,
      reserveTokenProgram: cfg.reserveTokenProgram,
      shareTokenProgram: TOKEN_PROGRAM,
      systemProgram: SYSTEM_PROGRAM,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
      admin: cfg.admin,
      operator: cfg.operator,
      pauser: cfg.pauser,
      mutavCapitalWallet: cfg.mutavCapitalWallet,
      coverageRatioBps: cfg.coverageRatioBps,
      feeTakeBps: cfg.feeTakeBps,
      caps: cfg.caps,
    },
    opts(cfg),
  );
}

/**
 * `propose_role` for the config's operator and pauser where they differ from
 * the chain (`current`) (ADR 0020). Admin. Each proposed key then accepts
 * with `accept_role` within 72 hours (`composeAcceptRole`).
 */
export async function composeProposeRoles(
  cfg: DeployConfig,
  current: VaultConfig,
  admin: TransactionSigner,
): Promise<Instruction[]> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  const out: Instruction[] = [];
  for (const [role, key, now] of [
    [ROLE_OPERATOR, cfg.operator, current.operator],
    [ROLE_PAUSER, cfg.pauser, current.pauser],
  ] as const) {
    if (key === now) continue;
    out.push(
      getProposeRoleInstruction(
        { admin, config: a.config, eventAuthority: a.eventAuthority, program: cfg.programId, role, key },
        opts(cfg),
      ),
    );
  }
  return out;
}

/** `accept_role(role)`, signed by the proposed key. */
export async function composeAcceptRole(
  cfg: DeployConfig,
  current: VaultConfig,
  role: number,
  newKey: TransactionSigner,
): Promise<Instruction> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  return getAcceptRoleInstruction(
    {
      newKey,
      config: a.config,
      treasuryAccount: current.treasuryAccount,
      paymentsAccount: current.paymentsAccount,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
      role,
    },
    opts(cfg),
  );
}

/**
 * `set_config` with only the fields where the file's caps, coverage ratio
 * and take rate differ from the chain (`current`), sparse (ADR 0026), with
 * `refresh` first when a change needs it. `feature_flags` and the capital
 * wallet are never set here. Empty when nothing differs.
 */
export async function composeSetCaps(
  cfg: DeployConfig,
  current: VaultConfig,
  admin: TransactionSigner,
): Promise<Instruction[]> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  const params = configParamsDiff(current, {
    coverageRatioBps: cfg.coverageRatioBps,
    feeTakeBps: cfg.feeTakeBps,
    featureFlags: current.featureFlags,
    mutavCapitalWallet: current.mutavCapitalWallet,
    caps: cfg.caps,
  });
  if (params.length === 0) return [];
  const setConfig = getSetConfigInstruction(
    {
      admin,
      config: a.config,
      state: a.state,
      treasuryAccount: current.treasuryAccount,
      paymentsAccount: current.paymentsAccount,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
      params,
    },
    opts(cfg),
  );
  if (!configParamsNeedRefresh(params)) return [setConfig];
  const refresh = getRefreshInstruction(
    {
      config: a.config,
      state: a.state,
      reserve: a.reserve,
      pendingDeposits: a.pendingDeposits,
      pendingRedemptions: a.pendingRedemptions,
      claims: a.claims,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
    },
    opts(cfg),
  );
  return [refresh, setConfig];
}

/** `set_allowlist_root(root)`. Admin. */
export async function composeSetAllowlistRoot(
  cfg: DeployConfig,
  root: Uint8Array,
  admin: TransactionSigner,
): Promise<Instruction> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  return getSetAllowlistRootInstruction(
    { admin, config: a.config, eventAuthority: a.eventAuthority, program: cfg.programId, root },
    opts(cfg),
  );
}
