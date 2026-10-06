/**
 * Task 12, step 2: `initialize` as an unsigned Squads proposal.
 *
 *   bun scripts/devnet/init.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] \
 *     --out <proposal.json> [--multisig <upgrade multisig>]
 *
 * `initialize` must be signed by the program's upgrade authority, which
 * deploy.ts hands to the Squads vault, so the vault both signs and pays
 * (fund the vault with ~0.1 SOL for rent first). Under spec §12 Q15 option
 * (b) the upgrade authority is a separate multisig's vault: pass that
 * multisig with --multisig.
 *
 * Writes caps and params from the config file. Reads the chain (ProgramData)
 * only to check the upgrade authority first. Signs nothing.
 */
import { createNoopSigner, type Address } from '@solana/kit';
import { guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { composeInitialize, programDataAddress } from './lib/compose';
import { loadConfig, type DeployConfig } from './lib/config';
import { programDataUpgradeAuthority } from './lib/checks';
import { toPayload, writePayload } from './lib/proposal';
import { accountData, rpcFor } from './lib/rpc';
import { squadsVaultAddress } from './lib/squads';

export async function assertAdminIsVault(cfg: DeployConfig) {
  const vault = await squadsVaultAddress(cfg.squads.multisig, cfg.squads.vaultIndex);
  if (vault !== cfg.admin) throw new Error(`admin ${cfg.admin} is not the vault ${vault} of multisig ${cfg.squads.multisig}`);
}

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  const url = req(args, 'url');
  guardCluster(url, opt(args, 'confirm-cluster'));
  await assertAdminIsVault(cfg);
  const multisig = (opt(args, 'multisig') as Address | undefined) ?? cfg.squads.multisig;
  const vault = await squadsVaultAddress(multisig, cfg.squads.vaultIndex);
  if (vault !== cfg.upgradeAuthority) {
    throw new Error(`upgradeAuthority ${cfg.upgradeAuthority} is not the vault of ${multisig}; pass --multisig <upgrade multisig>`);
  }
  const pd = await accountData(rpcFor(url), await programDataAddress(cfg.programId));
  if (!pd) throw new Error(`program ${cfg.programId} is not deployed at ${url}`);
  const ua = programDataUpgradeAuthority(pd);
  if (ua !== cfg.upgradeAuthority) throw new Error(`upgrade authority is ${ua}, expected ${cfg.upgradeAuthority}; run deploy.ts first`);

  const signer = createNoopSigner(vault);
  const ix = await composeInitialize(cfg, { upgradeAuthority: signer, payer: signer });
  writePayload(
    req(args, 'out'),
    toPayload({ title: `MUTAV: initialize reserve for ${cfg.reserveMint}`, cluster: cfg.cluster, multisig, vaultIndex: cfg.squads.vaultIndex, vault }, [ix]),
  );
}

if (import.meta.main) await main(parseArgs());
