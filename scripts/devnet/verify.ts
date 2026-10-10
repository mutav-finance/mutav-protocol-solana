/**
 * Task 12, post-deploy checks (read-only):
 *
 * - upgrade authority == the config's `upgradeAuthority`;
 * - `feature_flags == 0`;
 * - admin, operator, pauser and the allowlist root as configured;
 * - every other `VaultConfig` field equals the config file (c, fee take,
 *   every cap including the NAV-move guard, decimals 6, mint, token program, money accounts, capital wallet);
 * - on devnet, the locked devnet values (lib/compare.ts `DEVNET_LOCKED`);
 * - the treasury and payments accounts hold the reserve mint and are not
 *   owned by the operator;
 * - the reserve mint: owned by `reserveTokenProgram`, 6 decimals;
 * - both Squads multisigs (admin and upgrade): owned by the Squads v4
 *   program, `config_authority == Pubkey::default()`, exactly the configured
 *   members (each able to vote) and threshold, `time_lock >=` the floor.
 *
 *   bun scripts/devnet/verify.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet]
 */
import { buildAllowlist, fetchReserve } from '../../clients/js/src';
import { assertConfigCluster, guardCluster, opt, parseArgs, req, type Args } from './lib/cli';
import { checkReserveMint, postDeployChecks } from './lib/checks';
import { programDataAddress } from './lib/compose';
import { checkDevnetLocked, checkMoneyAccounts, compareConfig } from './lib/compare';
import { loadConfig, type DeployConfig } from './lib/config';
import { accountData, accountInfo, rpcFor, type ReadRpc } from './lib/rpc';
import { checkSquadsAccount, squadsVaultAddress } from './lib/squads';

/** Both multisigs as configured, and each vault where the config says it is. */
export async function multisigChecks(rpc: ReadRpc, cfg: DeployConfig): Promise<string[]> {
  const out: string[] = [];
  for (const [label, m, vault] of [
    ['admin', cfg.squads, cfg.admin],
    ['upgrade', cfg.upgradeSquads, cfg.upgradeAuthority],
  ] as const) {
    const derived = await squadsVaultAddress(m.multisig, m.vaultIndex);
    if (derived !== vault) out.push(`${label} multisig: vault ${m.vaultIndex} is ${derived}, config says ${vault}`);
    out.push(...checkSquadsAccount(await accountInfo(rpc, m.multisig), m, label));
  }
  return out;
}

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
  failures.push(...checkReserveMint(await accountInfo(rpc, cfg.reserveMint), cfg));
  failures.push(...compareConfig(r.config.data, cfg));
  if (cfg.cluster === 'devnet') failures.push(...checkDevnetLocked(r.config.data));
  failures.push(
    ...checkMoneyAccounts(
      { treasury: await accountInfo(rpc, r.config.data.treasuryAccount), payments: await accountInfo(rpc, r.config.data.paymentsAccount) },
      cfg,
      r.config.data.operator,
    ),
  );
  failures.push(...(await multisigChecks(rpc, cfg)));
  if (failures.length) {
    for (const f of failures) console.error(`FAIL ${f}`);
    process.exitCode = 1;
    return failures;
  }
  console.log('all post-deploy checks pass');
  return failures;
}

if (import.meta.main) await main(parseArgs());
