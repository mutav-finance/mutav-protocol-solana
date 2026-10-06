/**
 * Task 12, step 3: `set_roles(operator, pauser)` from the config, as an
 * unsigned Squads proposal. `initialize` already sets both roles; use this to
 * rotate them (e.g. from a devnet test key to mutav-app's KMS key).
 *
 *   bun scripts/devnet/roles.ts --config <deploy.json> --out <proposal.json>
 */
import { createNoopSigner } from '@solana/kit';
import { parseArgs, req, type Args } from './lib/cli';
import { composeSetRoles } from './lib/compose';
import { loadConfig } from './lib/config';
import { toPayload, writePayload } from './lib/proposal';
import { assertAdminIsVault } from './init';

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  await assertAdminIsVault(cfg);
  const ix = await composeSetRoles(cfg, createNoopSigner(cfg.admin));
  writePayload(
    req(args, 'out'),
    toPayload({ title: `MUTAV: set operator ${cfg.operator}, pauser ${cfg.pauser}`, cluster: cfg.cluster, multisig: cfg.squads.multisig, vaultIndex: cfg.squads.vaultIndex, vault: cfg.admin }, [ix]),
  );
}

if (import.meta.main) await main(parseArgs());
