/**
 * Task 12, step 2: `initialize` as an unsigned Squads proposal.
 *
 *   bun scripts/devnet/init.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] \
 *     --out <proposal.json>
 *
 * `initialize` must be signed by the program's upgrade authority, which
 * deploy.ts hands to the upgrade multisig's vault (`upgradeSquads`), so that
 * vault both signs and pays (fund it with ~0.1 SOL for rent first). The
 * proposal is for the upgrade multisig; it sets `VaultConfig.admin` to the
 * admin multisig's vault (`squads`).
 *
 * Writes caps and params from the config file. Reads the chain first: the
 * reserve mint (owned by `reserveTokenProgram`, 6 decimals) and ProgramData
 * (the upgrade authority). Signs nothing.
 */
import { createNoopSigner, type Address } from '@solana/kit';
import { assertConfigCluster, guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { composeInitialize, programDataAddress } from './lib/compose';
import { loadConfig, type DeployConfig } from './lib/config';
import { checkReserveMint, programDataUpgradeAuthority } from './lib/checks';
import { toPayload, writePayload } from './lib/proposal';
import { accountData, accountInfo, rpcFor } from './lib/rpc';
import { squadsVaultAddress } from './lib/squads';

export async function assertAdminIsVault(cfg: DeployConfig) {
  const vault = await squadsVaultAddress(cfg.squads.multisig, cfg.squads.vaultIndex);
  if (vault !== cfg.admin) throw new Error(`admin ${cfg.admin} is not the vault ${vault} of multisig ${cfg.squads.multisig}`);
}

export async function assertUpgradeAuthorityIsVault(cfg: DeployConfig): Promise<Address> {
  const vault = await squadsVaultAddress(cfg.upgradeSquads.multisig, cfg.upgradeSquads.vaultIndex);
  if (vault !== cfg.upgradeAuthority) {
    throw new Error(`upgradeAuthority ${cfg.upgradeAuthority} is not the vault ${vault} of upgrade multisig ${cfg.upgradeSquads.multisig}`);
  }
  return vault;
}

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  const guarded = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'));
  assertConfigCluster(guarded, cfg.cluster);
  const { url } = guarded;
  await assertAdminIsVault(cfg);
  const vault = await assertUpgradeAuthorityIsVault(cfg);
  const multisig = cfg.upgradeSquads.multisig;
  const rpc = rpcFor(url);
  const mintFailures = checkReserveMint(await accountInfo(rpc, cfg.reserveMint), cfg);
  if (mintFailures.length) throw new Error(`refusing to initialize:\n  ${mintFailures.join('\n  ')}`);
  const pd = await accountData(rpc, await programDataAddress(cfg.programId));
  if (!pd) throw new Error(`program ${cfg.programId} is not deployed at ${url}`);
  const ua = programDataUpgradeAuthority(pd);
  if (ua !== cfg.upgradeAuthority) throw new Error(`upgrade authority is ${ua}, expected ${cfg.upgradeAuthority}; run deploy.ts first`);

  const signer = createNoopSigner(vault);
  const ix = await composeInitialize(cfg, { upgradeAuthority: signer, payer: signer });
  writePayload(
    req(args, 'out'),
    toPayload({ title: `MUTAV: initialize reserve for ${cfg.reserveMint}`, cluster: cfg.cluster, multisig, vaultIndex: cfg.upgradeSquads.vaultIndex, vault }, [ix]),
  );
}

if (import.meta.main) await main(parseArgs());
