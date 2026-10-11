/**
 * Task 12, step 3: `propose_role` for the config's operator and pauser, as an
 * unsigned Squads proposal (ADR 0020). `initialize` already sets both roles;
 * use this to rotate them (e.g. from a devnet test key to mutav-app's KMS
 * key). Each proposed key then signs `accept_role` itself within 72 hours.
 *
 *   bun scripts/devnet/roles.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] --out <proposal.json>
 */
import { createNoopSigner } from '@solana/kit';
import { fetchReserve } from '../../clients/js/src';
import { guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { composeProposeRoles } from './lib/compose';
import { loadConfig } from './lib/config';
import { toPayload, writePayload } from './lib/proposal';
import { rpcFor } from './lib/rpc';
import { assertAdminIsVault } from './init';

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  const url = req(args, 'url');
  guardCluster(url, opt(args, 'confirm-cluster'));
  await assertAdminIsVault(cfg);
  const r = await fetchReserve(rpcFor(url), cfg.reserveMint, { programAddress: cfg.programId });
  const ixs = await composeProposeRoles(cfg, r.config.data, createNoopSigner(cfg.admin));
  if (ixs.length === 0) {
    console.log('roles already match the config; nothing to propose');
    return;
  }
  writePayload(
    req(args, 'out'),
    toPayload({ title: `MUTAV: propose operator ${cfg.operator}, pauser ${cfg.pauser}`, cluster: cfg.cluster, multisig: cfg.squads.multisig, vaultIndex: cfg.squads.vaultIndex, vault: cfg.admin }, ixs),
  );
}

if (import.meta.main) await main(parseArgs());
