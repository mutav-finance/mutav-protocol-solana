/**
 * Task 12, step 1: deploy the program and hand its upgrade authority to the
 * upgrade multisig's Squads vault.
 *
 *   bun scripts/devnet/deploy.ts --config <deploy.json> --url <rpc> [--confirm-cluster devnet] \
 *     --payer <deployer keypair path, outside the repo, chmod 600> \
 *     --upgrade-authority <upgrade multisig vault> \
 *     [--program-keypair target/deploy/mutav-keypair.json] [--so target/deploy/mutav.so]
 *
 * Before any CLI runs it checks:
 * - the cluster (genesis hash) matches the config's;
 * - the payer file has no group or other permission bits;
 * - `--upgrade-authority` equals the config's `upgradeAuthority`, which
 *   equals the vault derived from `upgradeSquads.multisig` + `vaultIndex`
 *   (and `admin` the vault of `squads`), so a typo cannot hand the program
 *   to an unknown key;
 * - both multisigs are owned by the Squads v4 program, autonomous, with
 *   exactly the configured members and threshold and a time lock at or
 *   above the floor.
 *
 * Then it runs the Solana CLI: `solana program deploy` with the deployer as
 * the temporary upgrade authority, and `solana program set-upgrade-authority`
 * to the vault (`--skip-new-upgrade-authority-signer-check`: a vault PDA
 * cannot co-sign). If the handover fails, the deployer still holds the
 * authority: the script prints the exact retry command and exits non-zero;
 * a failed deploy prints how to find and close the leftover buffer. Recovery
 * commands name `--url "$RPC_URL"`, never the URL itself.
 * Finally it re-reads ProgramData at `confirmed` (polling up to ~20 s) and
 * confirms the authority; a read-back that disagrees says to check
 * `solana program show` first, since the handover itself succeeded. The keypair
 * *paths* go to the CLI; this script never opens them.
 *
 * For the real devnet deploy, build with `solana-verify build` first (see
 * .github/workflows/release.yml) so the deployed hash is reproducible.
 */
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { address, type Address } from '@solana/kit';
import { MUTAV_PROGRAM_ADDRESS } from '../../clients/js/src';
import { assertOutsideRepo, opt, parseArgs, REPO_ROOT, req, type Args } from './lib/cli';
import { assertConfigCluster, guardCluster, rpcGenesis, type GenesisSource } from './lib/cluster';
import { programDataUpgradeAuthority } from './lib/checks';
import { programDataAddress } from './lib/compose';
import { loadConfig, type DeployConfig } from './lib/config';
import { run } from './lib/local';
import { accountInfo, rpcFor, type ReadOptions } from './lib/rpc';
import { checkSquadsAccount, squadsVaultAddress } from './lib/squads';

export type DeployDeps = {
  run: (cmd: string[], opts?: { quiet?: boolean }) => string;
  genesis: GenesisSource;
  account: (url: string, a: Address, o?: ReadOptions) => Promise<{ owner: Address; data: Uint8Array } | null>;
  sleep: (ms: number) => Promise<void>;
};

const defaultDeps: DeployDeps = {
  run,
  genesis: rpcGenesis,
  account: (url, a, o) => accountInfo(rpcFor(url), a, o),
  sleep: (ms) => Bun.sleep(ms),
};

/**
 * The CLI confirms the handover at `confirmed`; the read-back uses the same
 * commitment and polls, since an RPC node can lag a slot or two behind.
 */
export const READBACK_ATTEMPTS = 10;
export const READBACK_INTERVAL_MS = 2_000;

export type DeployOptions = {
  url: string | undefined;
  confirmCluster: string | undefined;
  payer: string;
  programKeypair?: string;
  so?: string;
  upgradeAuthority: string;
  cfg: DeployConfig;
  /**
   * Local only (dry run, fork test): the config's vaults are throwaway
   * stand-in keys, not Squads vaults, so the Squads checks are skipped.
   * Refused on any cluster but a local one.
   */
  localStandIn?: boolean;
};

/** Keypair files must be readable by their owner only. */
export function assertOwnerOnly(path: string, what: string) {
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) {
    throw new Error(`${what} (${path}) has mode ${mode.toString(8)}: group or other can read it; run chmod 600 ${path}`);
  }
}

/** The vaults the config names are the ones its multisigs derive, and both multisigs pass the launch checks. */
async function preflightSquads(o: DeployOptions, url: string, deps: DeployDeps) {
  const { cfg } = o;
  const failures: string[] = [];
  for (const [label, m, vault, field] of [
    ['admin', cfg.squads, cfg.admin, 'admin'],
    ['upgrade', cfg.upgradeSquads, cfg.upgradeAuthority, 'upgradeAuthority'],
  ] as const) {
    const derived = await squadsVaultAddress(m.multisig, m.vaultIndex);
    if (derived !== vault) failures.push(`config ${field} ${vault} is not vault ${m.vaultIndex} (${derived}) of the ${label} multisig ${m.multisig}`);
    failures.push(...checkSquadsAccount(await deps.account(url, m.multisig), m, label));
  }
  if (failures.length) throw new Error(`refusing to deploy:\n  ${failures.join('\n  ')}`);
}

export async function deploy(o: DeployOptions, deps: DeployDeps = defaultDeps): Promise<{ programId: Address }> {
  const { cfg } = o;
  const guarded = await guardCluster(o.url, o.confirmCluster, deps.genesis);
  assertConfigCluster(guarded, cfg.cluster);
  const { url } = guarded;
  const payer = assertOutsideRepo(o.payer, '--payer');
  assertOwnerOnly(payer, '--payer');
  const programKeypair = assertOutsideRepo(o.programKeypair ?? join(REPO_ROOT, 'target', 'deploy', 'mutav-keypair.json'), '--program-keypair');
  const so = o.so ?? join(REPO_ROOT, 'target', 'deploy', 'mutav.so');

  const authority = address(o.upgradeAuthority);
  if (authority !== cfg.upgradeAuthority) {
    throw new Error(`--upgrade-authority ${authority} is not the config's upgradeAuthority ${cfg.upgradeAuthority}`);
  }
  if (o.localStandIn) {
    if (guarded.cluster !== 'local') throw new Error('a stand-in upgrade authority is allowed on a local cluster only');
  } else {
    await preflightSquads(o, url, deps);
  }

  const programId = address(deps.run(['solana-keygen', 'pubkey', programKeypair], { quiet: true }).trim());
  if (programId !== MUTAV_PROGRAM_ADDRESS || programId !== cfg.programId) {
    // The binary's declare_id! must match, or every instruction fails with
    // DeclaredProgramIdMismatch.
    throw new Error(`${programKeypair} is ${programId}; the program declares ${MUTAV_PROGRAM_ADDRESS} and the config says ${cfg.programId}`);
  }

  // Recovery text never prints the RPC URL (it may carry an API key); the
  // operator sets RPC_URL in their shell instead. CLI errors can echo the URL
  // (`error sending request for url (…)`), so it is scrubbed from them too.
  const secrets = [url, url.replace(/\/$/, ''), o.url?.trim()].filter((v): v is string => !!v);
  const fail = (msg: string) => {
    for (const v of secrets) msg = msg.split(v).join('$RPC_URL');
    console.error(msg);
    return new Error(msg);
  };

  try {
    deps.run(['solana', 'program', 'deploy', so, '--program-id', programKeypair, '--keypair', payer,
      '--upgrade-authority', payer, '--url', url, '--commitment', 'confirmed']);
  } catch (e) {
    throw fail(
      `solana program deploy failed: ${(e as Error).message}\n` +
        `A failed deploy can leave a buffer account holding the program's rent. List the deployer's buffers with:\n\n` +
        `  solana program show --buffers --keypair ${payer} --url "$RPC_URL"\n\n` +
        `then reclaim one with:\n\n` +
        `  solana program close <BUFFER> --keypair ${payer} --url "$RPC_URL"\n`,
    );
  }

  const handover = (u: string) => ['solana', 'program', 'set-upgrade-authority', programId, '--upgrade-authority', payer,
    '--new-upgrade-authority', authority, '--skip-new-upgrade-authority-signer-check',
    '--keypair', payer, '--url', u, '--commitment', 'confirmed'];
  try {
    deps.run(handover(url));
  } catch (e) {
    throw fail(
      `set-upgrade-authority failed: ${(e as Error).message}\n` +
        `The deployer ${payer} still holds the upgrade authority of ${programId}. Retry the handover with:\n\n` +
        `  ${handover('"$RPC_URL"').join(' ')}\n`,
    );
  }

  const pdAddr = await programDataAddress(programId);
  let ua: Address | null | undefined;
  for (let i = 0; i < READBACK_ATTEMPTS; i++) {
    if (i > 0) await deps.sleep(READBACK_INTERVAL_MS);
    const pd = await deps.account(url, pdAddr, { commitment: 'confirmed' });
    ua = pd ? programDataUpgradeAuthority(pd.data) : undefined;
    if (ua === authority) break;
  }
  if (ua !== authority) {
    // The handover command succeeded; only the read-back disagrees, so it
    // may be stale. Never tell the operator the deployer still holds it.
    const seen = ua === undefined ? 'ProgramData was not found' : `the upgrade authority read back as ${ua ?? 'none'}`;
    throw fail(
      `set-upgrade-authority succeeded, but after ${READBACK_ATTEMPTS} reads at confirmed ${seen}, expected ${authority}.\n` +
        `Check \`solana program show ${programId} --url "$RPC_URL"\` first; if the authority is already the vault ${authority}, nothing to do.\n`,
    );
  }
  console.log(`deployed ${programId}; upgrade authority ${ua}`);
  return { programId };
}

export async function main(args: Args) {
  return deploy({
    url: opt(args, 'url'),
    confirmCluster: opt(args, 'confirm-cluster'),
    payer: req(args, 'payer'),
    programKeypair: opt(args, 'program-keypair'),
    so: opt(args, 'so'),
    upgradeAuthority: req(args, 'upgrade-authority'),
    cfg: loadConfig(req(args, 'config')),
  });
}

if (import.meta.main) await main(parseArgs());
