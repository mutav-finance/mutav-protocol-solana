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
 * `feature_flags` and `exit` are carried over unchanged, never set here.
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
