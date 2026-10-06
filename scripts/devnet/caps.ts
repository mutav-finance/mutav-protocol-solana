/**
 * Task 12, step 4: `set_config` with the config file's caps, price bounds,
 * coverage ratio, take rate and SLA, as an unsigned Squads proposal. Every
 * other field (feature flags, exit params, money accounts, capital wallet)
 * is read from the chain and kept as it is.
 *
 *   bun scripts/devnet/caps.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] --out <proposal.json>
 */
import { createNoopSigner } from '@solana/kit';
import { fetchReserve } from '../../clients/js/src';
import { guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { composeSetCaps } from './lib/compose';
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
  const ix = await composeSetCaps(cfg, r.config.data, createNoopSigner(cfg.admin));
  writePayload(
    req(args, 'out'),
    toPayload({ title: 'MUTAV: set caps and parameters', cluster: cfg.cluster, multisig: cfg.squads.multisig, vaultIndex: cfg.squads.vaultIndex, vault: cfg.admin }, [ix]),
  );
}

if (import.meta.main) await main(parseArgs());
