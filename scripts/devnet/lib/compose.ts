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
  findIncomeInboxAddress,
  findReserveAddresses,
  getInitializeInstruction,
  getSetAllowlistRootInstruction,
  getSetConfigInstruction,
  getSetRolesInstruction,
  type VaultConfig,
} from '../../../clients/js/src';
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
      payoutSlaSecs: cfg.payoutSlaSecs,
      caps: cfg.caps,
      price: cfg.price,
    },
    opts(cfg),
  );
}

/** `set_roles(operator, pauser)` from the config. Admin. */
export async function composeSetRoles(cfg: DeployConfig, admin: TransactionSigner): Promise<Instruction> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  return getSetRolesInstruction(
    {
      admin,
      config: a.config,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
      operator: cfg.operator,
      pauser: cfg.pauser,
    },
    opts(cfg),
  );
}

/**
 * `set_config` writing the file's caps, price bounds, coverage ratio, take
 * rate and SLA, and keeping every other field as it is on-chain (`current`).
 * `feature_flags`, `exit` and `income_take_bps` are carried over unchanged,
 * never set here.
 */
export async function composeSetCaps(
  cfg: DeployConfig,
  current: VaultConfig,
  admin: TransactionSigner,
): Promise<Instruction> {
  const a = await findReserveAddresses(cfg.reserveMint, opts(cfg));
  const { reserved: _r, ...exit } = current.exit;
  return getSetConfigInstruction(
    {
      admin,
      config: a.config,
      treasuryAccount: current.treasuryAccount,
      paymentsAccount: current.paymentsAccount,
      eventAuthority: a.eventAuthority,
      program: cfg.programId,
      coverageRatioBps: cfg.coverageRatioBps,
      feeTakeBps: cfg.feeTakeBps,
      payoutSlaSecs: cfg.payoutSlaSecs,
      featureFlags: current.featureFlags,
      mutavCapitalWallet: current.mutavCapitalWallet,
      caps: cfg.caps,
      price: cfg.price,
      exit,
      // Carried over: the take on issuer income is never set from the file
      // (ADR 0017; the program caps it at 0 until §12 Q47 is decided).
      incomeTakeBps: current.incomeTakeBps,
    },
    opts(cfg),
  );
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
