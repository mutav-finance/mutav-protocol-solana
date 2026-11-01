/**
 * Independent check of a Squads v4 proposal before a member approves it
 * (audit NEW-R3-1, NEW-R3-2, S9, S14; spec §14.5 step 7;
 * docs/security/verify-proposal.md). Run it on your own machine, against an
 * RPC you chose, never through the reserve app:
 *
 *   bun scripts/release/verify-proposal.ts --cluster <devnet|localnet> --rpc <url> \
 *     --multisig <pubkey> --index <n> --intent governance/intents/<cluster>/<ms>/<n>.json \
 *     [--so target/deploy/mutav.so]   # required for upgrades
 *
 * It reads the Multisig, the VaultTransaction or ConfigTransaction at the
 * index, and the Proposal from the RPC; decodes every instruction or config
 * action; compares them with the intent file committed before the proposal
 * existed; and for an upgrade checks the buffer against the intent hash and
 * the member's own reproducible build. Exit code 0 only on a full MATCH.
 * `proposal_approve` commits to the proposal index only, and a Ledger blind
 * signs it: this report is what the approval means. Reads only; signs nothing.
 */
import { createHash } from 'node:crypto';
// Reads the intent JSON and the locally built .so (--so), never a key.
import { readFileSync } from 'node:fs';
import { address, getBase58Decoder, type Address } from '@solana/kit';
import { opt, parseArgs, req, type Args } from '../devnet/lib/cli';
import { assertConfigCluster, guardCluster, rpcGenesis, type GenesisSource } from '../devnet/lib/cluster';
import { BPF_LOADER_UPGRADEABLE, programDataAddress } from '../devnet/lib/compose';
import { accountInfo, rpcFor } from '../devnet/lib/rpc';
import { decodeSquadsMultisig, DEFAULT_PUBKEY, squadsVaultAddress, SQUADS_V4_PROGRAM, type SquadsMultisig } from '../devnet/lib/squads';
import { decodeInstruction, NONCE_FATAL, resolveMessage, toJson, type DecodedInstruction, type Json, type Risk } from './lib/decode';
import { compareConfig, compareVault, intentPath, parseIntent, type Intent } from './lib/intent';
import {
  decodeConfigTransaction,
  decodeProposal,
  decodeVaultTransaction,
  squadsEphemeralSigner,
  squadsProposalAddress,
  squadsTransactionAddress,
  transactionKind,
  type ConfigAction,
  type Proposal,
} from './lib/squads-tx';
import { checkUpgradeBuffer, checkUpgradeInstructions, type Account } from './lib/upgrade-check';

export const NONCE_REMINDER =
  'Never sign a member transaction (create, approve, execute) that uses a durable nonce: ' +
  'it stays valid forever and can be replayed after the context changes. Refuse any prompt whose first instruction is AdvanceNonceAccount.';

const readLocal = (p: string) => new Uint8Array(readFileSync(p));

export type VerifyDeps = {
  genesis: GenesisSource;
  account: (url: string, a: Address) => Promise<Account>;
  readLocal: (path: string) => Uint8Array;
  print: (line: string) => void;
};
const defaultDeps: VerifyDeps = {
  genesis: rpcGenesis,
  account: (url, a) => accountInfo(rpcFor(url), a, { commitment: 'confirmed' }),
  readLocal,
  print: (l) => console.log(l),
};

export type VerifyResult = { failures: string[]; lines: string[]; digestHex: string | null; digestBase58: string | null };

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest();
const fmtRisk = (r: Risk) => `[${r.level.toUpperCase()}] ${r.note}`;
const fmtJson = (v: Json) => (typeof v === 'string' ? v : JSON.stringify(v));

/** Risk of each Squads config action: each one changes who controls the vault. */
export const CONFIG_ACTION_RISK: Record<ConfigAction['name'], Risk> = {
  AddMember: { level: 'critical', note: 'adds a member who can vote (permissions mask: 1 initiate, 2 vote, 4 execute)' },
  RemoveMember: { level: 'critical', note: 'removes a member' },
  ChangeThreshold: { level: 'critical', note: 'changes how many approvals a proposal needs' },
  SetTimeLock: { level: 'critical', note: 'changes the delay between approval and execution' },
  AddSpendingLimit: { level: 'critical', note: 'lets the listed members move vault funds without a vote' },
  RemoveSpendingLimit: { level: 'caution', note: 'removes a spending limit' },
  SetRentCollector: { level: 'caution', note: 'changes who collects the rent of closed transaction accounts' },
};

function printInstruction(i: number, d: DecodedInstruction, vault: Address, out: string[]) {
  out.push(`  #${i} ${d.family === 'raw' ? `RAW ${d.programId}` : `${d.family}.${d.name}`}  (program ${d.programId})`);
  for (const r of d.risks) out.push(`     ${fmtRisk(r)}`);
  if (d.fatal) out.push(`     !!! ${d.fatal}`);
  if (d.error) out.push(`     not decoded: ${d.error}`);
  for (const [k, v] of Object.entries(d.args)) out.push(`     arg ${k} = ${fmtJson(v)}`);
  for (const a of [...d.accounts, ...d.remaining]) {
    const flags = [a.signer ? 'signer' : '', a.writable ? 'writable' : ''].filter(Boolean).join(',');
    out.push(`     acct ${a.name} = ${a.address}${a.address === vault ? ' (the vault)' : ''}${flags ? ` [${flags}]` : ''}`);
  }
  if (d.family === 'raw') out.push(`     data sha256 ${d.dataSha256} (${d.dataHex.length / 2} bytes)`);
}

function multisigFacts(m: SquadsMultisig, intent: Intent, out: string[], failures: string[]) {
  out.push(`multisig: threshold ${m.threshold} of ${m.members.length}, time lock ${m.timeLock}s, transaction index ${m.transactionIndex}, stale below or at ${m.staleTransactionIndex}`);
  for (const x of m.members) out.push(`  member ${x.key} permissions ${x.permissions}`);
  if (m.configAuthority !== DEFAULT_PUBKEY) failures.push(`multisig config_authority is ${m.configAuthority}: a controlled multisig can change members, threshold or time lock without a vote (spec §14.5 step 8)`);
  if (m.timeLock < intent.minTimeLockSecs) failures.push(`multisig time lock ${m.timeLock}s is below the intent's floor ${intent.minTimeLockSecs}s`);
}

function proposalFacts(p: Proposal | null, m: SquadsMultisig, index: bigint, out: string[], warnings: string[]) {
  if (!p) {
    warnings.push('no Proposal account exists for this index yet: there is nothing to approve');
    return;
  }
  const memberSet = new Set<string>(m.members.map((x) => x.key));
  out.push(`proposal: ${p.status}${p.statusTimestamp !== null ? ` since ${new Date(Number(p.statusTimestamp) * 1000).toISOString()}` : ''}, approvals ${p.approved.length} of ${m.threshold}`);
  for (const k of p.approved) out.push(`  approved by ${k}${memberSet.has(k) ? '' : ' (NOT a member)'}`);
  for (const k of p.rejected) out.push(`  rejected by ${k}`);
  for (const k of p.cancelled) out.push(`  cancelled by ${k}`);
  if (p.status === 'Approved' && p.statusTimestamp !== null) {
    out.push(`  executable from ${new Date(Number(p.statusTimestamp + BigInt(m.timeLock)) * 1000).toISOString()} (time lock ${m.timeLock}s from approval)`);
  }
  if (['Rejected', 'Executed', 'Cancelled', 'Executing'].includes(p.status)) warnings.push(`the proposal is ${p.status}: it can no longer be approved`);
  else if (index <= m.staleTransactionIndex && p.status !== 'Approved') warnings.push(`index ${index} is stale (at or below ${m.staleTransactionIndex}): it can no longer be approved`);
}

/** The whole check, from chain reads to a verdict. `reads` answers `null` for an absent account. */
export async function verify(p: {
  intent: Intent;
  multisig: Address;
  index: bigint;
  read: (a: Address) => Promise<Account>;
  so?: Uint8Array;
}): Promise<VerifyResult> {
  const { intent, multisig, index } = p;
  const out: string[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const done = (digestHex: string | null = null, digestBase58: string | null = null): VerifyResult => {
    for (const w of warnings) out.push(`warning: ${w}`);
    return { failures, lines: out, digestHex, digestBase58 };
  };
  if (intent.multisig !== multisig) failures.push(`the intent is for multisig ${intent.multisig}, not --multisig ${multisig}`);
  if (intent.index !== index) failures.push(`the intent is for index ${intent.index}, not --index ${index}`);
  out.push(`intent: ${intent.title}`);

  const msAcc = await p.read(multisig);
  if (!msAcc) return (failures.push(`multisig ${multisig} not found`), done());
  if (msAcc.owner !== SQUADS_V4_PROGRAM) return (failures.push(`multisig ${multisig} is owned by ${msAcc.owner}, not Squads v4 ${SQUADS_V4_PROGRAM}`), done());
  let ms: SquadsMultisig;
  try {
    ms = decodeSquadsMultisig(msAcc.data);
  } catch (e) {
    return (failures.push(`multisig: ${(e as Error).message}`), done());
  }
  multisigFacts(ms, intent, out, failures);
  const by = (k: Address) => `${k}${ms.members.some((x) => x.key === k) ? '' : ' (NOT a member)'}`;

  const txAddr = await squadsTransactionAddress(multisig, index);
  const txAcc = await p.read(txAddr);
  out.push(`transaction account ${txAddr}`);
  if (!txAcc) return (failures.push(`no transaction account at index ${index} (${txAddr})`), done());
  if (txAcc.owner !== SQUADS_V4_PROGRAM) return (failures.push(`transaction account is owned by ${txAcc.owner}, not Squads v4`), done());
  const digest = sha256(txAcc.data);
  const digestHex = digest.toString('hex');
  const digestBase58 = getBase58Decoder().decode(digest);
  const kind = transactionKind(txAcc.data);
  if (!kind) return (failures.push('the account at that index is neither a VaultTransaction nor a ConfigTransaction (a batch is not supported: refuse it)'), done(digestHex, digestBase58));
  if (kind !== intent.transaction.kind) failures.push(`the transaction is a ${kind} transaction; the intent expects ${intent.transaction.kind}`);

  if (kind === 'config') {
    let ct;
    try {
      ct = decodeConfigTransaction(txAcc.data);
    } catch (e) {
      return (failures.push(`ConfigTransaction: ${(e as Error).message}`), done(digestHex, digestBase58));
    }
    if (ct.multisig !== multisig || ct.index !== index) failures.push(`the ConfigTransaction records multisig ${ct.multisig} index ${ct.index}`);
    out.push(`config transaction by ${by(ct.creator)}: ${ct.actions.length} action(s)`);
    const got = ct.actions.map((a) => ({ name: a.name, args: toJson(a.args) as Record<string, Json> }));
    got.forEach((a, i) => {
      out.push(`  #${i} squads.${a.name}`);
      out.push(`     ${fmtRisk(CONFIG_ACTION_RISK[a.name as ConfigAction['name']])}`);
      for (const [k, v] of Object.entries(a.args)) out.push(`     arg ${k} = ${fmtJson(v)}`);
    });
    for (const [i, a] of got.entries()) {
      if (a.name === 'SetTimeLock' && !(Number(a.args.newTimeLock) >= intent.minTimeLockSecs)) failures.push(`action #${i} SetTimeLock sets the time lock to ${fmtJson(a.args.newTimeLock ?? null)}s, below the intent's floor ${intent.minTimeLockSecs}s`);
    }
    if (intent.transaction.kind === 'config') failures.push(...compareConfig(intent.transaction.actions, got));
  } else {
    let vt;
    try {
      vt = decodeVaultTransaction(txAcc.data);
    } catch (e) {
      return (failures.push(`VaultTransaction: ${(e as Error).message}`), done(digestHex, digestBase58));
    }
    const vault = await squadsVaultAddress(multisig, vt.vaultIndex);
    out.push(`vault transaction by ${by(vt.creator)}: vault index ${vt.vaultIndex} (${vault}), ${vt.message.instructions.length} instruction(s)`);
    if (vt.multisig !== multisig || vt.index !== index) failures.push(`the VaultTransaction records multisig ${vt.multisig} index ${vt.index}`);
    const m = vt.message;
    if (m.addressTableLookups.length) failures.push(`the message loads ${m.addressTableLookups.length} address lookup table(s): refused, every account must be in the message`);
    const ephemeral = await Promise.all(vt.ephemeralSignerBumps.map((_, i) => squadsEphemeralSigner(txAddr, i)));
    const want = intent.transaction.kind === 'vault' ? intent.transaction : null;
    if (want && vt.vaultIndex !== want.vaultIndex) failures.push(`vault index ${vt.vaultIndex}; the intent expects ${want.vaultIndex}`);
    if (want && ephemeral.length !== want.ephemeralSigners) failures.push(`${ephemeral.length} ephemeral signer(s); the intent expects ${want.ephemeralSigners}`);
    for (let i = 0; i < m.numSigners; i++) {
      const k = m.accountKeys[i];
      if (k !== vault && !ephemeral.includes(k as Address)) failures.push(`message signer ${k} is neither the vault nor an ephemeral signer`);
    }
    const decoded = resolveMessage(m).map((ix) => decodeInstruction(ix, { mutavProgramIds: [intent.mutavProgramId] }));
    decoded.forEach((d, i) => printInstruction(i, d, vault, out));
    const fatal = decoded.filter((d) => d.fatal);
    if (fatal.some((d) => d.fatal === NONCE_FATAL)) out.push('!!!!!!!! DURABLE NONCE INSTRUCTION IN THE VAULT MESSAGE: DO NOT APPROVE !!!!!!!!');
    if (fatal.some((d) => d.fatal !== NONCE_FATAL)) out.push('!!!!!!!! MALFORMED INSTRUCTION FOR A KNOWN PROGRAM IN THE VAULT MESSAGE: DO NOT APPROVE !!!!!!!!');
    failures.push(...fatal.map((d) => `${d.family === 'raw' ? `raw ${d.programId}` : d.name}: ${d.fatal}`));
    if (want) failures.push(...compareVault(want.instructions, decoded, vault));
    // Selected by program id, not decoded family: a loader instruction that did not decode must still fail here.
    if (decoded.some((d) => d.programId === BPF_LOADER_UPGRADEABLE) || intent.upgrade) {
      failures.push(...(await checkUpgradeInstructions(decoded, intent.upgrade, vault)));
      if (intent.upgrade) {
        const buffer = await p.read(intent.upgrade.buffer);
        const programData = await p.read(await programDataAddress(intent.upgrade.programId));
        const r = checkUpgradeBuffer({ upgrade: intent.upgrade, vault, buffer, programData, so: p.so });
        out.push('upgrade:');
        for (const f of r.facts) out.push(`  ${f}`);
        out.push(`  intent expectedHash ${intent.upgrade.expectedHash}`);
        failures.push(...r.failures);
      }
    }
  }

  const propAddr = await squadsProposalAddress(multisig, index);
  const propAcc = await p.read(propAddr);
  let proposal: Proposal | null = null;
  if (propAcc) {
    if (propAcc.owner !== SQUADS_V4_PROGRAM) failures.push(`proposal account is owned by ${propAcc.owner}, not Squads v4`);
    else {
      try {
        proposal = decodeProposal(propAcc.data);
        if (proposal.multisig !== multisig || proposal.transactionIndex !== index) failures.push(`the Proposal records multisig ${proposal.multisig} index ${proposal.transactionIndex}`);
      } catch (e) {
        failures.push(`Proposal: ${(e as Error).message}`);
      }
    }
  }
  proposalFacts(proposal, ms, index, out, warnings);
  return done(digestHex, digestBase58);
}

export function parseIndex(v: string): bigint {
  if (!/^[1-9]\d{0,19}$/.test(v) || BigInt(v) >= 1n << 64n) throw new Error(`--index must be a positive u64, got "${v}"`);
  return BigInt(v);
}

/** Runs the CLI; returns the exit code: 0 MATCH, 1 MISMATCH, 2 the check could not run. */
export async function main(args: Args, deps: VerifyDeps = defaultDeps): Promise<number> {
  const print = deps.print;
  try {
    const cluster = req(args, 'cluster');
    if (cluster !== 'devnet' && cluster !== 'localnet') throw new Error(`--cluster must be devnet or localnet, got "${cluster}" (mainnet is refused)`);
    const multisig = address(req(args, 'multisig'));
    const index = parseIndex(req(args, 'index'));
    const intentFile = req(args, 'intent');
    if (!intentFile.endsWith('.json')) throw new Error('--intent must be a .json intent file');
    const soPath = opt(args, 'so');
    if (soPath !== undefined && !soPath.endsWith('.so')) throw new Error('--so must be the locally built program (.so)');
    const intentBytes = deps.readLocal(intentFile);
    let intentJson: unknown;
    try {
      intentJson = JSON.parse(new TextDecoder().decode(intentBytes));
    } catch {
      throw new Error(`--intent ${intentFile} is not valid JSON`);
    }
    const intent = parseIntent(intentJson);
    if (intent.cluster !== cluster) throw new Error(`the intent is for ${intent.cluster}, not --cluster ${cluster}`);
    const guarded = await guardCluster(req(args, 'rpc'), cluster === 'devnet' ? 'devnet' : undefined, deps.genesis);
    assertConfigCluster(guarded, cluster);
    const so = soPath === undefined ? undefined : deps.readLocal(soPath);

    print(`verify-proposal: ${cluster}, multisig ${multisig}, index ${index}`);
    print(`intent file ${intentFile} sha256 ${sha256(intentBytes).toString('hex')}`);
    if (!intentFile.replaceAll('\\', '/').endsWith(intentPath(intent))) print(`warning: intent files belong at ${intentPath(intent)} (committed before the proposal is created)`);
    const r = await verify({ intent, multisig, index, read: (a) => deps.account(guarded.url, a), ...(so ? { so } : {}) });
    for (const l of r.lines) print(l);
    print('');
    if (r.digestHex) print(`transaction account digest (sha256 of its data): hex ${r.digestHex}  base58 ${r.digestBase58}`);
    print('compare this digest with the other members over a second channel before anyone approves.');
    print(NONCE_REMINDER);
    print('');
    if (r.failures.length) {
      print(`MISMATCH: ${r.failures.length} difference(s). Do not approve.`);
      for (const f of r.failures) print(`  - ${f}`);
      return 1;
    }
    print('MATCH: the on-chain transaction is exactly the intent. Approve only (never Approve + Execute), from a second interface.');
    return 0;
  } catch (e) {
    print(`verify-proposal could not run: ${(e as Error).message}`);
    return 2;
  }
}

if (import.meta.main) process.exit(await main(parseArgs()));
