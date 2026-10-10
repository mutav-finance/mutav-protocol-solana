/**
 * Task 12, post-deploy checks (read-only):
 *
 * - upgrade authority == the config's `upgradeAuthority`;
 * - `feature_flags == 0` and `buffer_earmark == 0`;
 * - admin, operator, pauser and the allowlist root as configured;
 * - the Squads multisig: `config_authority == Pubkey::default()`,
 *   `time_lock >= squads.timeLockFloorSecs`, a sane threshold.
 *
 *   bun scripts/devnet/verify.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet]
 */
import { buildAllowlist, fetchReserve } from '../../clients/js/src';
import { assertConfigCluster, guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { postDeployChecks } from './lib/checks';
import { programDataAddress } from './lib/compose';
import { loadConfig } from './lib/config';
import { accountData, rpcFor } from './lib/rpc';
import { checkSquadsMultisig, decodeSquadsMultisig } from './lib/squads';

export async function main(args: Args) {
  const cfg = loadConfig(req(args, 'config'));
  const guarded = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'));
  assertConfigCluster(guarded, cfg.cluster);
  const { url } = guarded;
  const rpc = rpcFor(url);
  const pd = await accountData(rpc, await programDataAddress(cfg.programId));
  if (!pd) throw new Error(`program ${cfg.programId} is not deployed at ${url}`);
  const r = await fetchReserve(rpc, cfg.reserveMint, { programAddress: cfg.programId });
  const failures = postDeployChecks(pd, r.config.data, r.state.data, {
    upgradeAuthority: cfg.upgradeAuthority,
    admin: cfg.admin,
    operator: cfg.operator,
    pauser: cfg.pauser,
    allowlistRoot: (await buildAllowlist(cfg.allowlist)).root,
  });
  const ms = await accountData(rpc, cfg.squads.multisig);
  if (!ms) failures.push(`Squads multisig ${cfg.squads.multisig} not found`);
  else failures.push(...checkSquadsMultisig(decodeSquadsMultisig(ms), cfg.squads.timeLockFloorSecs));
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exitCode = 1;
    return failures;
  }
  console.log('all post-deploy checks pass');
  return failures;
}

if (import.meta.main) await main(parseArgs());
