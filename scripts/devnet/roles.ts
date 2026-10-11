/**
 * Task 12, step 3: `propose_role` for the config's operator and pauser, as an
 * unsigned Squads proposal (ADR 0020). It also cancels any pending handover
 * the config does not ask for (`cancel_pending`), including a pending admin
 * other than the config's `nextAdmin`, since verify.ts fails while one waits.
 * A pending admin handover is cancelled only with `--cancel-admin`; without
 * it the script refuses. Every cancellation is logged and named in the
 * proposal title. `initialize` already sets both roles;
 * use this to rotate them (e.g. from a devnet test key to mutav-app's KMS
 * key). Each proposed key then signs `accept_role` itself within 72 hours.
 *
 *   bun scripts/devnet/roles.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] [--cancel-admin] --out <proposal.json>
 */
import { createNoopSigner } from '@solana/kit';
import { fetchReserve } from '../../clients/js/src';
import { assertConfigCluster, guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { composeRoleChanges, type RoleCancel } from './lib/compose';
import { loadConfig } from './lib/config';
import { toPayload, writePayload } from './lib/proposal';
import { rpcFor } from './lib/rpc';
import { assertAdminIsVault } from './init';

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  // The cluster guard runs before any RPC call or file write.
  const guarded = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'));
  assertConfigCluster(guarded, cfg.cluster);
  const { url } = guarded;
  await assertAdminIsVault(cfg);
  const r = await fetchReserve(rpcFor(url), cfg.reserveMint, { programAddress: cfg.programId });
  const { instructions: ixs, cancelled } = await composeRoleChanges(cfg, r.config.data, createNoopSigner(cfg.admin), undefined, {
    cancelAdmin: args['cancel-admin'] === true,
  });
  if (ixs.length === 0) {
    console.log('roles already match the config; nothing to propose');
    return;
  }
  for (const c of cancelled) console.log(`cancel_pending(${c}): the pending ${c} handover is cancelled in this proposal`);
  writePayload(req(args, 'out'), toPayload({ title: rolesTitle(cfg, cancelled), cluster: cfg.cluster, multisig: cfg.squads.multisig, vaultIndex: cfg.squads.vaultIndex, vault: cfg.admin }, ixs));
}

/** The proposal title names every role whose pending handover it cancels. */
export function rolesTitle(cfg: { operator: string; pauser: string }, cancelled: readonly RoleCancel[]): string {
  const cancels = cancelled.length ? `; cancel_pending: ${cancelled.join(', ')}` : '';
  return `MUTAV: roles to the config (operator ${cfg.operator}, pauser ${cfg.pauser}${cancels})`;
}

if (import.meta.main) await main(parseArgs());
