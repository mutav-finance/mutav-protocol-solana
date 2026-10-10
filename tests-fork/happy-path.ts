/**
 * Task 13 (cut to one happy path): a Surfpool fork of devnet with Nora's
 * real BRS mint `BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4`.
 *
 *   anchor build && bun tests-fork/happy-path.ts [--program-keypair <path>]
 *
 * 1. deploy the program into the fork and `initialize` with the real mint
 *    (the mint guard must accept it: classic SPL Token, 6 dp);
 * 2. deposit → fulfil → claim shares;
 * 3. register → guarantee fee → file → pay → settle.
 *
 * Surfpool reads devnet accounts lazily over RPC and executes everything
 * locally: no devnet transaction is sent. BRS balances come from the
 * `surfnet_setTokenAccount` cheatcode (nobody can mint real BRS). Every
 * signer is a throwaway in-memory key; the vault, operator and investor are
 * stand-ins. The script starts Surfpool in a temp dir and always stops it.
 *
 * Built later (plan, Rescheduled): admin fulfil through a Squads proposal,
 * partial head fills, allocate/deallocate (adapters), and the no-op upgrade
 * through a timelocked proposal.
 */
import { join } from 'node:path';
import {
  AccountRole,
  address,
  fetchEncodedAccount,
  generateKeyPairSigner,
  type Address,
  type Instruction,
  type TransactionSigner,
} from '@solana/kit';
import {
  buildAllowlist,
  fetchReserve,
  findClaimFilingPda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findGuaranteePda,
  findReserveAddresses,
  getClaimSharesInstruction,
  getContributeFeesInstruction,
  getFileClaimInstruction,
  getFulfilDepositsInstruction,
  getPayClaimInstruction,
  getRegisterGuaranteeInstruction,
  getRequestDepositInstruction,
  getSettlePayoutInstruction,
  fetchClaimFiling,
  fetchGuarantee,
} from '../clients/js/src';
import { opt, parseArgs } from '../scripts/devnet/lib/cli';
import {
  associatedTokenAddress,
  composeInitialize,
  composeSetAllowlistRoot,
  TOKEN_PROGRAM,
} from '../scripts/devnet/lib/compose';
import { parseConfig } from '../scripts/devnet/lib/config';
import { airdrop, assertNoProcess, LocalCluster, run, send, tempDir, type LocalRpc } from '../scripts/devnet/lib/local';
import { main as deploy } from '../scripts/devnet/deploy';

export const BRS_DEVNET_MINT = address('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4');
const PORT = 38899;
const URL = `http://127.0.0.1:${PORT}`;
const BRL = 1_000_000n;
const step = (s: string) => console.log(`\n== ${s}`);

function check(cond: boolean, what: string) {
  if (!cond) throw new Error(`check failed: ${what}`);
  console.log(`  ok: ${what}`);
}

/** Surfpool cheatcode: create or overwrite `owner`'s ATA for `mint` with `amount`. */
async function setTokenBalance(owner: Address, mint: Address, amount: bigint): Promise<Address> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'surfnet_setTokenAccount',
      params: [owner, mint, { amount: Number(amount) }, TOKEN_PROGRAM],
    }),
  });
  const body = (await res.json()) as { error?: { message: string } };
  if (body.error) throw new Error(`surfnet_setTokenAccount: ${body.error.message}`);
  return associatedTokenAddress(owner, mint);
}

async function tokenAmount(rpc: LocalRpc, account: Address): Promise<bigint> {
  const { value } = await rpc.getTokenAccountBalance(account).send();
  return BigInt(value.amount);
}

const bytes32 = (label: string) => {
  const b = new Uint8Array(32);
  b.set(new TextEncoder().encode(label).subarray(0, 32));
  return b;
};

export async function forkHappyPath(programKeypair?: string) {
  const tmp = tempDir('mutav-fork-');
  const deployer = join(tmp.dir, 'deployer.json');
  run(['solana-keygen', 'new', '--no-bip39-passphrase', '--silent', '--force', '-o', deployer], { quiet: true });
  const deployerPubkey = run(['solana-keygen', 'pubkey', deployer], { quiet: true }).trim();

  const surfpool = new LocalCluster(
    URL,
    [
      'surfpool', 'start',
      '--network', 'devnet',
      '--port', String(PORT),
      '--ws-port', String(PORT + 1),
      '--no-tui', '--no-studio', '--no-deploy', '--yes',
      '--airdrop', deployerPubkey,
      '--airdrop-amount', String(100_000_000_000),
    ],
    join(tmp.dir, 'surfpool.log'),
    tmp.dir, // run outside the repo, so Surfpool finds no Anchor workspace or runbooks
  );

  try {
    step('start Surfpool (fork of devnet)');
    await surfpool.start();
    const rpc = surfpool.rpc;
    console.log(`surfpool pid ${surfpool.pid} at ${URL}`);

    step("Nora's devnet BRS mint, read through the fork");
    const mintAcc = await fetchEncodedAccount(rpc, BRS_DEVNET_MINT);
    check(mintAcc.exists, 'mint exists on devnet');
    if (!mintAcc.exists) return;
    check(mintAcc.programAddress === TOKEN_PROGRAM, 'mint is owned by the classic SPL Token program');
    const { value: parsed } = await rpc.getAccountInfo(BRS_DEVNET_MINT, { encoding: 'jsonParsed' }).send();
    const info = (parsed!.data as { parsed: { info: Record<string, unknown> } }).parsed.info;
    console.log(`  mint authority ${info.mintAuthority}, freeze authority ${info.freezeAuthority}, decimals ${info.decimals}`);
    check(info.decimals === 6, 'BRS has 6 decimals');

    const [vault, operator, pauser, capital, treasuryOwner, paymentsOwner, investor] = await Promise.all(
      Array.from({ length: 7 }, () => generateKeyPairSigner()),
    );
    for (const s of [vault!, operator!, investor!]) await airdrop(rpc, s.address, 10);

    step('deploy into the fork');
    const { programId } = await deploy({
      url: URL,
      payer: deployer,
      'upgrade-authority': vault!.address,
      ...(programKeypair ? { 'program-keypair': programKeypair } : {}),
    });
    const po = { programAddress: programId };

    step('initialize with the real BRS mint (mint guard)');
    const treasury = await setTokenBalance(treasuryOwner!.address, BRS_DEVNET_MINT, 0n);
    const payments = await setTokenBalance(paymentsOwner!.address, BRS_DEVNET_MINT, 0n);
    const cfg = parseConfig({
      cluster: 'localnet',
      programId,
      reserveMint: BRS_DEVNET_MINT,
      reserveTokenProgram: TOKEN_PROGRAM,
      squads: { multisig: (await generateKeyPairSigner()).address, vaultIndex: 0, timeLockFloorSecs: 86_400 },
      admin: vault!.address,
      upgradeAuthority: vault!.address,
      operator: operator!.address,
      pauser: pauser!.address,
      mutavCapitalWallet: capital!.address,
      treasuryAccount: treasury,
      paymentsAccount: payments,
      coverageRatioBps: 10_000,
      feeTakeBps: 2_000,
      caps: {
        maxTvl: '100000000000', maxCoverPerGuarantee: '30000000000', maxClaimPerCall: '10000000000',
        maxClaimPerPeriod: '20000000000', minRequest: '1000000000', maxRequest: '30000000000', maxNavMoveBps: 10_000,
      },
      allowlist: [capital!.address, investor!.address],
    });
    const sendAs = (s: TransactionSigner, ixs: Instruction[]) => send(rpc, s, ixs);
    await sendAs(vault!, [await composeInitialize(cfg, { upgradeAuthority: vault!, payer: vault! })]);
    const a = await findReserveAddresses(BRS_DEVNET_MINT, po);
    let r = await fetchReserve(rpc, BRS_DEVNET_MINT, po);
    check(r.config.data.reserveMint === BRS_DEVNET_MINT, 'initialized with the real BRS mint');

    const tree = await buildAllowlist(cfg.allowlist);
    await sendAs(vault!, [await composeSetAllowlistRoot(cfg, tree.root, vault!)]);

    step('deposit → fulfil → claim shares');
    const deposit = 2_000n * BRL;
    const investorBrs = await setTokenBalance(investor!.address, BRS_DEVNET_MINT, deposit);
    const seq = r.state.data.nextDepositSeq;
    const [depositRequest] = await findDepositRequestPda({ config: a.config, seq }, po);
    await sendAs(investor!, [
      getRequestDepositInstruction(
        {
          owner: investor!, config: a.config, state: a.state, depositRequest, source: investorBrs,
          pendingDeposits: a.pendingDeposits, reserveMint: BRS_DEVNET_MINT, tokenProgram: TOKEN_PROGRAM,
          eventAuthority: a.eventAuthority, program: programId, assets: deposit, proof: tree.proofs.get(investor!.address)!,
        },
        po,
      ),
    ]);
    const fulfil = getFulfilDepositsInstruction(
      {
        admin: vault!, config: a.config, state: a.state, pendingDeposits: a.pendingDeposits, reserve: a.reserve,
        vaultAuthority: a.vaultAuthority, reserveMint: BRS_DEVNET_MINT, tokenProgram: TOKEN_PROGRAM,
        eventAuthority: a.eventAuthority, program: programId, count: 1,
      },
      po,
    );
    await sendAs(vault!, [{ ...fulfil, accounts: [...fulfil.accounts, { address: depositRequest, role: AccountRole.WRITABLE }] }]);
    const investorShares = await setTokenBalance(investor!.address, a.shareMint, 0n);
    await sendAs(investor!, [
      getClaimSharesInstruction(
        {
          owner: investor!, config: a.config, depositRequest, shareMint: a.shareMint,
          ownerShares: investorShares, vaultAuthority: a.vaultAuthority, eventAuthority: a.eventAuthority, program: programId,
        },
        po,
      ),
    ]);
    r = await fetchReserve(rpc, BRS_DEVNET_MINT, po);
    check((await tokenAmount(rpc, investorShares)) === deposit, 'investor holds 2,000 shares (NAV 1.0)');
    check(r.state.data.brsBalance === deposit, 'reserve tracks 2,000 BRS');
    check((await tokenAmount(rpc, a.reserve)) === deposit, 'reserve token account holds 2,000 BRS');

    step('register → guarantee fee → file → pay → settle');
    const id = bytes32('fork-guarantee-1');
    const agencyId = bytes32('fork-agency-1');
    const [guarantee] = await findGuaranteePda({ config: a.config, id }, po);
    const op = { operator: operator!, config: a.config, eventAuthority: a.eventAuthority, program: programId };
    await sendAs(operator!, [
      getRegisterGuaranteeInstruction(
        {
          ...op, state: a.state, guarantee, payer: operator!,
          id, agencyId, refsHash: bytes32('refs'), rent: 1_000n * BRL, defaultMultiplierBps: 10_000,
          exitMultiplierBps: 5_000, defaultCover: 1_000n * BRL, exitCover: 500n * BRL,
        },
        po,
      ),
    ]);
    const fee = 100n * BRL;
    const operatorBrs = await setTokenBalance(operator!.address, BRS_DEVNET_MINT, fee);
    const invoice = bytes32('invoice-1');
    await sendAs(operator!, [
      getContributeFeesInstruction(
        {
          ...op, state: a.state, feeReceipt: (await findFeeReceiptPda({ config: a.config, invoiceRefHash: invoice }, po))[0],
          source: operatorBrs, reserve: a.reserve, treasuryAccount: treasury, reserveMint: BRS_DEVNET_MINT,
          tokenProgram: TOKEN_PROGRAM, payer: operator!, invoiceRefHash: invoice, amount: fee,
        },
        po,
      ),
    ]);
    check((await tokenAmount(rpc, treasury)) === 20n * BRL, 'take (20%) went to the treasury');

    const notice = bytes32('notice-1');
    const claim = 400n * BRL;
    const [claimFiling] = await findClaimFilingPda({ guarantee, noticeRefHash: notice }, po);
    await sendAs(operator!, [
      getFileClaimInstruction(
        { ...op, state: a.state, guarantee, claimFiling, payer: operator!, leg: 0, amount: claim, noticeRefHash: notice },
        po,
      ),
    ]);
    await sendAs(operator!, [
      getPayClaimInstruction(
        {
          ...op, state: a.state, guarantee, claimFiling, reserve: a.reserve,
          paymentsAccount: payments, vaultAuthority: a.vaultAuthority, reserveMint: BRS_DEVNET_MINT,
          tokenProgram: TOKEN_PROGRAM, leg: 0, amount: claim, noticeRefHash: notice,
        },
        po,
      ),
    ]);
    check((await tokenAmount(rpc, payments)) === claim, 'claim payment reached the payments account');
    await sendAs(operator!, [
      getSettlePayoutInstruction({ ...op, guarantee, claimFiling, noticeRefHash: notice, pixE2eHash: bytes32('pix-e2e-1') }, po),
    ]);
    const g = await fetchGuarantee(rpc, guarantee);
    const p = await fetchClaimFiling(rpc, claimFiling);
    check(g.data.defaultPaid === claim, 'guarantee records the paid default leg');
    check(p.data.status === 3 && p.data.paidAmount === claim, 'claim paid and settled');
    r = await fetchReserve(rpc, BRS_DEVNET_MINT, po);
    check(r.state.data.brsBalance === deposit + fee - 20n * BRL - claim, 'reserve = deposit + fee − take − claim');
    check(r.config.data.featureFlags === 0n, 'feature flags stay 0');
    console.log('\nFORK HAPPY PATH PASSED');
  } finally {
    step('stop Surfpool');
    await surfpool.stop();
    tmp.remove();
    assertNoProcess(`surfpool start.*${PORT}`);
    console.log('surfpool stopped; none left on this port');
  }
}

if (import.meta.main) await forkHappyPath(opt(parseArgs(), 'program-keypair'));
