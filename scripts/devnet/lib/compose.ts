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
  getCancelPendingInstruction,
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
export const ROLE_ADMIN = 3;
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
      // ADR 0019 carves left out of the file start off (0).
      caps: {
        ...cfg.caps,
        stressBuffer: cfg.caps.stressBuffer ?? 0n,
        maxQueueWaitSecs: cfg.caps.maxQueueWaitSecs ?? 0n,
        maxReinstateAge: cfg.caps.maxReinstateAge ?? 0n,
      },
    },
    opts(cfg),
  );
}

const DEFAULT_ADDRESS = address('11111111111111111111111111111111');

/**
 * The role proposal that brings the chain to the file, as one proposal
 * (ADR 0020):
 *
 * - `propose_role` for each of operator and pauser whose key differs from
 *   the file. A handover already pending for the requested key is refused
 *   ("awaiting accept_role": the key signs `accept_role`, nothing to
 *   propose). Another unexpired pending key gets `cancel_pending(role)`
 *   first, since `propose_role` refuses while one waits.
 * - When the key already matches, any pending handover of that role (live
 *   or expired) is one the file does not ask for: `cancel_pending(role)`.
 * - A pending admin handover is cancelled (`cancel_pending(ROLE_ADMIN)`)
 *   unless the file names that key as `nextAdmin`. A chain admin other than
 *   the file's is refused: the admin moves only by `propose_admin` /
 *   `accept_admin`.
 */
export async function composeProposeRoles(
  cfg: DeployConfig,
  current: VaultConfig,
  admin: TransactionSigner,
  nowSecs: bigint = BigInt(Math.floor(Date.now() / 1000)),
): Promise<Instruction[]> {
  if (current.admin !== cfg.admin) {
    throw new Error(`the chain admin is ${current.admin}, the config says ${cfg.admin}; the admin moves only through propose_admin / accept_admin`);
  }
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  const base = { admin, config: a.config, eventAuthority: a.eventAuthority, program: cfg.programId };
  const cancel = (role: number) => getCancelPendingInstruction({ ...base, role }, opts(cfg));
  const out: Instruction[] = [];
  for (const [role, name, key, now, pending, expiresAt] of [
    [ROLE_OPERATOR, 'operator', cfg.operator, current.operator, current.pendingOperator, current.pendingOperatorExpiresAt],
    [ROLE_PAUSER, 'pauser', cfg.pauser, current.pauser, current.pendingPauser, current.pendingPauserExpiresAt],
  ] as const) {
    if (key === now) {
      if (pending !== DEFAULT_ADDRESS) out.push(cancel(role));
      continue;
    }
    const live = pending !== DEFAULT_ADDRESS && nowSecs <= expiresAt;
    if (live && pending === key) {
      throw new Error(`${name} ${key} is already proposed, awaiting accept_role (expires at ${expiresAt})`);
    }
    if (live) out.push(cancel(role));
    out.push(getProposeRoleInstruction({ ...base, role, key }, opts(cfg)));
  }
  if (current.pendingAdmin !== DEFAULT_ADDRESS && current.pendingAdmin !== cfg.nextAdmin) out.push(cancel(ROLE_ADMIN));
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
      // The money accounts are checked for the operator only (ADR 0020).
      treasuryAccount: role === ROLE_OPERATOR ? current.treasuryAccount : undefined,
      paymentsAccount: role === ROLE_OPERATOR ? current.paymentsAccount : undefined,
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
 * wallet are never set here; a stress buffer, queue wait or reinstate age
 * missing from the file keeps the chain's value. Empty when nothing differs.
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
    // A carve left out of the file keeps the chain's value (no reset).
    caps: {
      ...cfg.caps,
      stressBuffer: cfg.caps.stressBuffer ?? current.caps.stressBuffer,
      maxQueueWaitSecs: cfg.caps.maxQueueWaitSecs ?? current.caps.maxQueueWaitSecs,
      maxReinstateAge: cfg.caps.maxReinstateAge ?? current.caps.maxReinstateAge,
    },
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
