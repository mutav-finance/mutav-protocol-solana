/**
 * Task 12 dry run against a throwaway `solana-test-validator`:
 *
 *   anchor build && bun scripts/devnet/dry-run.ts [--program-keypair <path>]
 *
 * `--program-keypair` defaults to target/deploy/mutav-keypair.json; it must
 * be the keypair of the declared program id (e.g.
 * ~/.config/solana/mutav/mutav-keypair.json). It is only handed to the
 * Solana CLI, which deploys to the local validator.
 *
 * deploy (deploy.ts) → initialize → propose_role / accept_role → set_config (caps) →
 * set_allowlist_root → post-deploy checks, plus one allowlisted
 * `request_deposit` to prove the root and proofs match the program.
 *
 * The Squads vault is stood in for by a throwaway in-memory key (no Squads
 * program locally): the same composers that write the devnet proposals build
 * these instructions, and the stand-in signs them here. Squads checks are
 * unit-tested on fixture data (scripts/test/squads.test.ts) and run for real
 * by verify.ts at the devnet deploy.
 *
 * The script starts the validator in a temp dir outside the repo, and always
 * stops it and deletes the dir, then asserts no validator is left running.
 */
import {
  address,
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import {
  MUTAV_PROGRAM_ADDRESS,
  buildAllowlist,
  fetchReserve,
  fetchVaultConfig,
  findDepositRequestPda,
  findReserveAddresses,
  getRequestDepositInstruction,
} from '../../clients/js/src';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { opt, parseArgs } from './lib/cli';
import { parseConfig, type DeployConfig } from './lib/config';
import {
  associatedTokenAddress,
  composeInitialize,
  composeSetAllowlistRoot,
  composeSetCaps,
  composeAcceptRole,
  composeProposeRoles,
  ROLE_OPERATOR,
  ROLE_PAUSER,
  programDataAddress,
  TOKEN_PROGRAM,
} from './lib/compose';
import { postDeployChecks } from './lib/checks';
import { airdrop, assertNoProcess, LocalCluster, run, send, tempDir } from './lib/local';
import { accountData } from './lib/rpc';
import { deploy } from './deploy';

const RPC_PORT = 28899;
const URL = `http://127.0.0.1:${RPC_PORT}`;
const BRL = 1_000_000n;

const step = (s: string) => console.log(`\n== ${s}`);

/**
 * `spl-token` against the local validator. Its CLI config (in the temp dir)
 * names the deployer keypair file as the default signer: mint authority and
 * fee payer of the test mint.
 */
function splToken(cliConfig: string, deployer: string, args: string[]): string {
  return run(['spl-token', '--config', cliConfig, '--fee-payer', deployer, ...args], { quiet: true });
}

async function newSigners(n: number) {
  return Promise.all(Array.from({ length: n }, () => generateKeyPairSigner()));
}

export async function dryRun(programKeypair?: string) {
  const tmp = tempDir('mutav-dryrun-');
  const deployer = join(tmp.dir, 'deployer.json');
  run(['solana-keygen', 'new', '--no-bip39-passphrase', '--silent', '--force', '-o', deployer], { quiet: true });
  const deployerPubkey = run(['solana-keygen', 'pubkey', deployer], { quiet: true }).trim();
  const cliConfig = join(tmp.dir, 'cli.yml');
  writeFileSync(cliConfig, `json_rpc_url: "${URL}"\nwebsocket_url: ""\nkeypair_path: "${deployer}"\ncommitment: confirmed\n`);

  const validator = new LocalCluster(
    URL,
    [
      'solana-test-validator',
      '--ledger', join(tmp.dir, 'ledger'),
      '--reset',
      '--quiet',
      '--bind-address', '127.0.0.1',
      '--rpc-port', String(RPC_PORT),
      '--faucet-port', '29900',
      '--gossip-port', '28001',
      '--dynamic-port-range', '28002-28040',
      '--mint', deployerPubkey,
    ],
    join(tmp.dir, 'validator.log'),
  );

  try {
    step('start solana-test-validator');
    await validator.start();
    const rpc = validator.rpc;
    console.log(`validator pid ${validator.pid} at ${URL}`);

    // Stand-ins: the Squads vault, roles, money-account owners, investor.
    const [vault, op1, pause1, op2, pause2, capital, treasuryOwner, paymentsOwner, investor] = await newSigners(9);
    for (const s of [vault!, investor!]) await airdrop(rpc, s.address, 10);

    step('test BRS mint (classic SPL, 6 dp) and money accounts');
    const mint = address(
      JSON.parse(splToken(cliConfig, deployer, ['create-token', '--decimals', '6', '--output', 'json'])).commandOutput.address,
    );
    const ata = async (owner: Address) => {
      splToken(cliConfig, deployer, ['create-account', mint, '--owner', owner]);
      return associatedTokenAddress(owner, mint);
    };
    const treasury = await ata(treasuryOwner!.address);
    const payments = await ata(paymentsOwner!.address);

    // The same config shape as devnet.example.json, filled for this run.
    const standIn = { multisig: (await generateKeyPairSigner()).address, vaultIndex: 0, members: [vault!.address], threshold: 1, timeLockFloorSecs: 0 };
    const cfg: DeployConfig = parseConfig({
      cluster: 'localnet',
      programId: MUTAV_PROGRAM_ADDRESS,
      reserveMint: mint,
      reserveTokenProgram: TOKEN_PROGRAM,
      // One throwaway key stands in for both Squads vaults (no Squads program locally).
      squads: standIn,
      upgradeSquads: standIn,
      admin: vault!.address,
      upgradeAuthority: vault!.address,
      operator: op1!.address,
      pauser: pause1!.address,
      mutavCapitalWallet: capital!.address,
      treasuryAccount: treasury,
      paymentsAccount: payments,
      coverageRatioBps: 10_000,
      feeTakeBps: 2_000,
      caps: {
        maxTvl: '50000000000',
        maxCoverPerGuarantee: '30000000000',
        maxClaimPerCall: '10000000000',
        maxClaimPerPeriod: '20000000000',
        minRequest: '1000000000',
        maxRequest: '30000000000',
        maxNavMoveBps: 10_000,
      },
      allowlist: [capital!.address, investor!.address],
    });
    step('deploy (scripts/devnet/deploy.ts)');
    const { programId } = await deploy({
      url: URL,
      confirmCluster: undefined,
      payer: deployer,
      upgradeAuthority: vault!.address,
      cfg,
      localStandIn: true,
      ...(programKeypair ? { programKeypair } : {}),
    });

    const sendAs = (signer: TransactionSigner, ixs: Instruction[]) => send(rpc, signer, ixs);

    step('initialize (signed by the upgrade authority = vault stand-in)');
    await sendAs(vault!, [await composeInitialize(cfg, { upgradeAuthority: vault!, payer: vault! })]);

    step('propose_role + accept_role (rotate operator and pauser, ADR 0020)');
    const a = await findReserveAddresses(mint, { programAddress: programId });
    const rotated = { ...cfg, operator: op2!.address, pauser: pause2!.address };
    const before = (await fetchVaultConfig(rpc, a.config)).data;
    await sendAs(vault!, await composeProposeRoles(rotated, before, vault!));
    for (const s of [op2!, pause2!]) await airdrop(rpc, s.address, 1);
    await sendAs(op2!, [await composeAcceptRole(rotated, before, ROLE_OPERATOR, op2!)]);
    await sendAs(pause2!, [await composeAcceptRole(rotated, before, ROLE_PAUSER, pause2!)]);

    step('set_config (sparse: only the caps that differ from the chain)');
    const current = (await fetchVaultConfig(rpc, a.config)).data;
    const raised = { ...cfg, caps: { ...cfg.caps, maxTvl: 100_000n * BRL } };
    await sendAs(vault!, await composeSetCaps(raised, current, vault!));

    step('set_allowlist_root');
    const tree = await buildAllowlist(cfg.allowlist);
    await sendAs(vault!, [await composeSetAllowlistRoot(cfg, tree.root, vault!)]);

    step('post-deploy checks');
    const pd = await accountData(rpc, await programDataAddress(programId));
    const r = await fetchReserve(rpc, mint, { programAddress: programId });
    const failures = postDeployChecks(pd!, r.config.data, r.state.data, {
      upgradeAuthority: vault!.address,
      admin: vault!.address,
      operator: op2!.address,
      pauser: pause2!.address,
      allowlistRoot: tree.root,
    });
    if (r.config.data.caps.maxTvl !== 100_000n * BRL) failures.push('caps.maxTvl not updated');
    if (r.config.data.caps.maxNavMoveBps !== 10_000) failures.push('caps.maxNavMoveBps not written');
    if (failures.length) throw new Error(`post-deploy checks failed:\n  ${failures.join('\n  ')}`);
    console.log('upgrade authority == vault; feature_flags == 0; roles, caps, root as configured');

    step('allowlisted request_deposit (root and proof accepted by the program)');
    const investorBrs = await ata(investor!.address);
    splToken(cliConfig, deployer, ['mint', mint, '1000', investorBrs]);
    const seq = r.state.data.nextDepositSeq;
    await sendAs(investor!, [
      getRequestDepositInstruction(
        {
          owner: investor!,
          config: a.config,
          state: a.state,
          depositRequest: (await findDepositRequestPda({ config: a.config, seq }, { programAddress: programId }))[0],
          source: investorBrs,
          pendingDeposits: a.pendingDeposits,
          reserveMint: mint,
          tokenProgram: TOKEN_PROGRAM,
          eventAuthority: a.eventAuthority,
          program: programId,
          assets: 1_000n * BRL,
          minSharesOut: 0n,
          eligibility: { __kind: 'Merkle', proof: tree.proofs.get(investor!.address)! },
        },
        { programAddress: programId },
      ),
    ]);
    const after = await fetchReserve(rpc, mint, { programAddress: programId });
    if (after.state.data.pendingDepositsTotal !== 1_000n * BRL) throw new Error('deposit not escrowed');
    console.log('pending_deposits_total = 1,000 BRS');
    console.log('\nDRY RUN PASSED');
  } finally {
    step('stop validator');
    await validator.stop();
    tmp.remove();
    assertNoProcess(`solana-test-validator.*${RPC_PORT}`);
    console.log('validator stopped; no solana-test-validator left on this port');
  }
}

if (import.meta.main) await dryRun(opt(parseArgs(), 'program-keypair'));
