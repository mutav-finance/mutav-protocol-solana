/**
 * Task 12, step 1: deploy the program and hand its upgrade authority to the
 * Squads vault.
 *
 *   bun scripts/devnet/deploy.ts --url <rpc> [--confirm-cluster devnet] \
 *     --payer <deployer keypair path, outside the repo> \
 *     --upgrade-authority <Squads vault pubkey> \
 *     [--program-keypair target/deploy/mutav-keypair.json] [--so target/deploy/mutav.so]
 *
 * Runs the Solana CLI: `solana program deploy` with the deployer as the
 * temporary upgrade authority, then `solana program set-upgrade-authority`
 * to the vault (`--skip-new-upgrade-authority-signer-check`: a vault PDA
 * cannot co-sign). The keypair *paths* go to the CLI; this script never
 * opens them. Then it reads ProgramData and checks the authority.
 *
 * For the real devnet deploy, build with `solana-verify build` first (see
 * .github/workflows/release.yml) so the deployed hash is reproducible.
 */
import { join } from 'node:path';
import { address, type Address } from '@solana/kit';
import { MUTAV_PROGRAM_ADDRESS } from '../../clients/js/src';
import { assertOutsideRepo, guardCluster, opt, parseArgs, REPO_ROOT, req, type Args } from './lib/cli';
import { programDataUpgradeAuthority } from './lib/checks';
import { programDataAddress } from './lib/compose';
import { run } from './lib/local';
import { accountData, rpcFor } from './lib/rpc';

export async function main(args: Args): Promise<{ programId: Address }> {
  const { url } = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'));
  const payer = assertOutsideRepo(req(args, 'payer'), '--payer');
  const programKeypair = assertOutsideRepo(
    opt(args, 'program-keypair') ?? join(REPO_ROOT, 'target', 'deploy', 'mutav-keypair.json'),
    '--program-keypair',
  );
  const so = opt(args, 'so') ?? join(REPO_ROOT, 'target', 'deploy', 'mutav.so');
  const authority = address(req(args, 'upgrade-authority'));
  const programId = address(run(['solana-keygen', 'pubkey', programKeypair], { quiet: true }).trim());
  if (programId !== MUTAV_PROGRAM_ADDRESS) {
    // The binary's declare_id! must match, or every instruction fails with
    // DeclaredProgramIdMismatch.
    throw new Error(`${programKeypair} is ${programId}, but the program declares ${MUTAV_PROGRAM_ADDRESS}`);
  }

  run(['solana', 'program', 'deploy', so, '--program-id', programKeypair, '--keypair', payer,
    '--upgrade-authority', payer, '--url', url, '--commitment', 'confirmed']);
  run(['solana', 'program', 'set-upgrade-authority', programId, '--upgrade-authority', payer,
    '--new-upgrade-authority', authority, '--skip-new-upgrade-authority-signer-check',
    '--keypair', payer, '--url', url, '--commitment', 'confirmed']);

  const pd = await accountData(rpcFor(url), await programDataAddress(programId));
  if (!pd) throw new Error('ProgramData not found after deploy');
  const ua = programDataUpgradeAuthority(pd);
  if (ua !== authority) throw new Error(`upgrade authority is ${ua}, expected ${authority}`);
  console.log(`deployed ${programId}; upgrade authority ${ua}`);
  return { programId };
}

if (import.meta.main) await main(parseArgs());
