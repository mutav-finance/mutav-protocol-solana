/**
 * Governance watch checks (docs/security/governance-watch.md). Each check
 * reads through a `WatchSource` and returns findings; a check that cannot
 * read what it needs throws, and the runner reports that as a run error.
 *
 * The Squads reads reuse scripts/devnet/lib/squads.ts. The watcher needs only
 * the Multisig fields and whether the transaction and proposal accounts at an
 * index exist; PR #114 (scripts/release/lib/squads-tx.ts) adds full
 * VaultTransaction / ConfigTransaction / Proposal decoders and the same PDAs.
 * Deduplicate `squadsTransactionAddress` / `squadsProposalAddress` once it
 * lands on main.
 */
import { getAddressEncoder, getProgramDerivedAddress, getU64Encoder, getUtf8Encoder, type Address } from '@solana/kit';
import { findReserveAddresses, getVaultConfigDecoder } from '../../../clients/js/src';
import { programDataUpgradeAuthority } from '../../devnet/lib/checks';
import { programDataAddress } from '../../devnet/lib/compose';
import { BPF_LOADER_UPGRADEABLE_ID, programDataHash } from '../../devnet/lib/hash';
import { decodeSquadsMultisig, DEFAULT_PUBKEY, squadsVaultAddress, SQUADS_V4_PROGRAM, type SquadsMultisig } from '../../devnet/lib/squads';
import { intentPath, type ExpectedMultisig, type ExpectedState } from './expected';
import type { TxBalances, WatchSource } from './source';

export type Severity = 'CRITICAL' | 'HIGH';
export type Finding = { severity: Severity; check: string; message: string };

const VERIFY_HINT = 'Run bun run verify-proposal before anyone approves';
/** At most this many new indexes are listed per multisig (one alert is enough to start the ceremony). */
export const MAX_NEW_INDEXES = 20;

const utf8 = getUtf8Encoder();
const u64le = (i: bigint) => getU64Encoder().encode(i);

/** Squads v4 transaction PDA: `["multisig", multisig, "transaction", u64 index]`. */
export async function squadsTransactionAddress(multisig: Address, index: bigint): Promise<Address> {
  const [a] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(multisig), utf8.encode('transaction'), u64le(index)],
  });
  return a;
}

/** Squads v4 proposal PDA: `["multisig", multisig, "transaction", u64 index, "proposal"]`. */
export async function squadsProposalAddress(multisig: Address, index: bigint): Promise<Address> {
  const [a] = await getProgramDerivedAddress({
    programAddress: SQUADS_V4_PROGRAM,
    seeds: [utf8.encode('multisig'), getAddressEncoder().encode(multisig), utf8.encode('transaction'), u64le(index), utf8.encode('proposal')],
  });
  return a;
}

/** Members, permissions, threshold, time lock, config authority and vault: any drift is CRITICAL. */
export async function checkMultisig(
  src: WatchSource,
  label: string,
  e: ExpectedMultisig,
): Promise<{ findings: Finding[]; decoded: SquadsMultisig | null }> {
  const check = `multisig ${label}`;
  const crit = (message: string): Finding => ({ severity: 'CRITICAL', check, message: `${label} multisig ${e.address}: ${message}` });
  const out: Finding[] = [];
  const derived = await squadsVaultAddress(e.address, e.vaultIndex);
  if (derived !== e.vault) out.push(crit(`vault ${e.vaultIndex} derives to ${derived}, expected-state says ${e.vault}`));
  const acc = await src.account(e.address);
  if (!acc) return { findings: [...out, crit('account not found')], decoded: null };
  if (acc.owner !== SQUADS_V4_PROGRAM) return { findings: [...out, crit(`owned by ${acc.owner}, not the Squads v4 program`)], decoded: null };
  const m = decodeSquadsMultisig(acc.data);
  if (m.threshold !== e.threshold) out.push(crit(`threshold is ${m.threshold}, expected ${e.threshold}`));
  if (m.timeLock !== e.timeLockSecs) out.push(crit(`time_lock is ${m.timeLock}s, expected ${e.timeLockSecs}s`));
  if (m.configAuthority !== e.configAuthority) out.push(crit(`config_authority is ${m.configAuthority}, expected ${e.configAuthority}`));
  const want = new Map<string, number>(e.members.map((x) => [x.key, x.permissions]));
  const got = new Map<string, number>(m.members.map((x) => [x.key, x.permissions]));
  for (const [k, p] of want) {
    const g = got.get(k);
    if (g === undefined) out.push(crit(`member ${k} is missing`));
    else if (g !== p) out.push(crit(`member ${k} has permissions ${g}, expected ${p}`));
  }
  for (const [k, p] of got) if (!want.has(k)) out.push(crit(`unexpected member ${k} (permissions ${p})`));
  return { findings: out, decoded: m };
}

/**
 * Every transaction index past `lastKnownTransactionIndex` is a proposal the
 * repo has not acknowledged: HIGH, whether or not its intent file is
 * committed (the message says which). Indexes up to `lastKnownTransactionIndex`
 * were acknowledged by the PR that raised it.
 */
export async function checkProposals(
  src: WatchSource,
  cluster: string,
  label: string,
  e: ExpectedMultisig,
  onChainIndex: bigint,
  intentExists: (path: string) => boolean,
): Promise<Finding[]> {
  const check = `proposals ${label}`;
  if (onChainIndex < e.lastKnownTransactionIndex) {
    return [
      {
        severity: 'HIGH',
        check,
        message: `${label} multisig transaction_index is ${onChainIndex}, below lastKnownTransactionIndex ${e.lastKnownTransactionIndex}: expected-state is wrong or names another multisig`,
      },
    ];
  }
  const out: Finding[] = [];
  const last = onChainIndex - e.lastKnownTransactionIndex > BigInt(MAX_NEW_INDEXES) ? e.lastKnownTransactionIndex + BigInt(MAX_NEW_INDEXES) : onChainIndex;
  const indexes: bigint[] = [];
  for (let i = e.lastKnownTransactionIndex + 1n; i <= last; i++) indexes.push(i);
  if (indexes.length === 0) return out;
  const addrs = (await Promise.all(indexes.map(async (i) => [await squadsTransactionAddress(e.address, i), await squadsProposalAddress(e.address, i)]))).flat();
  const exists = await src.exist(addrs);
  indexes.forEach((i, n) => {
    const path = intentPath(cluster, e.address, i);
    const tx = exists[2 * n] ? 'transaction account present' : 'transaction account closed or absent';
    const prop = exists[2 * n + 1] ? 'proposal account present' : 'no proposal account';
    const where = `${label} multisig transaction ${i} (${tx}, ${prop})`;
    out.push(
      intentExists(path)
        ? { severity: 'HIGH', check, message: `new proposal: ${where}; intent ${path} is committed. Each member runs bun run verify-proposal before approving; after execution, raise lastKnownTransactionIndex in expected-state` }
        : { severity: 'HIGH', check, message: `unexpected proposal: ${where} has no committed intent file at ${path}. ${VERIFY_HINT}` },
    );
  });
  if (last < onChainIndex) {
    out.push({ severity: 'HIGH', check, message: `${label} multisig has ${onChainIndex - last} more new indexes up to ${onChainIndex} (listing stops at ${MAX_NEW_INDEXES})` });
  }
  return out;
}

/** Upgrade authority and executable hash of the deployed program: any drift is CRITICAL. */
export async function checkProgram(src: WatchSource, e: ExpectedState['program']): Promise<Finding[]> {
  const crit = (message: string): Finding => ({ severity: 'CRITICAL', check: 'program', message: `program ${e.id}: ${message}` });
  const prog = await src.account(e.id);
  if (!prog) return [crit('program account not found')];
  if (prog.owner !== BPF_LOADER_UPGRADEABLE_ID) return [crit(`owned by ${prog.owner}, not BPF Loader Upgradeable`)];
  const pdAddr = await programDataAddress(e.id);
  const pd = await src.account(pdAddr);
  if (!pd) return [crit(`ProgramData ${pdAddr} not found`)];
  const out: Finding[] = [];
  const ua = programDataUpgradeAuthority(pd.data);
  if (ua !== e.upgradeAuthority) out.push(crit(`upgrade authority is ${ua ?? 'none (immutable)'}, expected ${e.upgradeAuthority}`));
  const h = programDataHash(pd.data);
  if (h !== e.executableHash) out.push(crit(`executable hash is ${h}, expected ${e.executableHash} (an upgrade happened)`));
  return out;
}

const nonDefault = (xs: readonly Address[]) => xs.filter((x) => x !== DEFAULT_PUBKEY).sort();

/**
 * The MUTAV config PDA: roles, pending handovers, payments and treasury
 * accounts are CRITICAL; caps, coverage ratio, fee take and the pause flag
 * are HIGH.
 */
export async function checkConfig(src: WatchSource, e: ExpectedState): Promise<Finding[]> {
  const ce = e.config;
  const crit = (message: string): Finding => ({ severity: 'CRITICAL', check: 'config', message: `config ${ce.address}: ${message}` });
  const high = (message: string): Finding => ({ severity: 'HIGH', check: 'config', message: `config ${ce.address}: ${message}` });
  const out: Finding[] = [];
  const derived = await findReserveAddresses(ce.reserveMint, { programAddress: e.program.id });
  if (derived.config !== ce.address) out.push(crit(`expected-state config ${ce.address} is not the config PDA ${derived.config} of mint ${ce.reserveMint}`));
  if (derived.reserve !== e.reserve.tokenAccount) out.push(crit(`expected-state reserve token account ${e.reserve.tokenAccount} is not the reserve PDA ${derived.reserve}`));
  const acc = await src.account(ce.address);
  if (!acc) return [...out, crit('account not found')];
  if (acc.owner !== e.program.id) return [...out, crit(`owned by ${acc.owner}, not the program ${e.program.id}`)];
  const c = getVaultConfigDecoder().decode(acc.data);
  const eq = (field: string, got: unknown, want: unknown, f: (m: string) => Finding) => {
    if (String(got) !== String(want)) out.push(f(`${field} is ${got}, expected ${want}`));
  };
  eq('admin', c.admin, ce.admin, crit);
  eq('operator', c.operator, ce.operator, crit);
  eq('pauser', c.pauser, ce.pauser, crit);
  eq('reserve_mint', c.reserveMint, ce.reserveMint, crit);
  eq('payments_account', c.paymentsAccount, ce.paymentsAccount, crit);
  eq('treasury_account', c.treasuryAccount, ce.treasuryAccount, crit);
  const g = nonDefault(c.guardians);
  const gw = nonDefault(ce.guardians);
  if (JSON.stringify(g) !== JSON.stringify(gw)) out.push(crit(`guardians are [${g.join(', ')}], expected [${gw.join(', ')}]`));
  for (const [role, key] of [
    ['admin', c.pendingAdmin],
    ['operator', c.pendingOperator],
    ['pauser', c.pendingPauser],
  ] as const) {
    if (key !== DEFAULT_PUBKEY) out.push(crit(`pending ${role} handover to ${key}`));
  }
  if (c.paused !== ce.paused) out.push(high(`paused is ${c.paused}, expected ${ce.paused}`));
  eq('coverage_ratio_bps', c.coverageRatioBps, ce.coverageRatioBps, high);
  eq('fee_take_bps', c.feeTakeBps, ce.feeTakeBps, high);
  for (const k of Object.keys(ce.caps) as (keyof typeof ce.caps)[]) eq(`caps.${k}`, c.caps[k], ce.caps[k], high);
  return out;
}

/**
 * A durable nonce account whose authority is a multisig member lets a
 * pre-signed approval be replayed at any later time (the Drift 2026
 * precursor). Any such account is HIGH.
 */
export async function checkNonces(src: WatchSource, members: Address[]): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const m of [...new Set(members)]) {
    for (const n of await src.nonceAccountsWithAuthority(m)) {
      out.push({ severity: 'HIGH', check: 'nonces', message: `durable nonce account ${n} has multisig member ${m} as its authority; never sign with a durable nonce` });
    }
  }
  return out;
}

/** Net change of `tokenAccount` in one transaction (post minus pre, base units). */
export function balanceDelta(tx: TxBalances, tokenAccount: string): bigint {
  const i = tx.accountKeys.indexOf(tokenAccount);
  if (i < 0) return 0n;
  const at = (xs: TxBalances['pre']) => BigInt(xs.find((b) => b.accountIndex === i)?.amount ?? '0');
  return at(tx.post) - at(tx.pre);
}

export type OutflowScan = { findings: Finding[]; scanned: number; total: bigint };

/**
 * Sums the reserve token account's outflows over the last `windowSecs`:
 * `getSignaturesForAddress` (newest first, bounded pages), then each
 * successful transaction's pre/post token balances, which count every
 * transfer out, CPIs included. Over the threshold is HIGH; so is a scan that
 * hits the page bound before leaving the window.
 */
export async function checkOutflows(
  src: WatchSource,
  e: ExpectedState['reserve'],
  nowSecs: number,
  o: { pageSize?: number; maxPages?: number } = {},
): Promise<OutflowScan> {
  const pageSize = o.pageSize ?? 100;
  const maxPages = o.maxPages ?? 5;
  const since = nowSecs - e.outflowWindowSecs;
  const outflows: { signature: string; amount: bigint }[] = [];
  let before: string | undefined;
  let done = false;
  let scanned = 0;
  for (let page = 0; page < maxPages && !done; page++) {
    const sigs = await src.signatures(e.tokenAccount, { before, limit: pageSize });
    for (const s of sigs) {
      // A missing blockTime is counted as inside the window.
      if (s.blockTime !== null && s.blockTime < since) {
        done = true;
        break;
      }
      scanned++;
      if (s.err) continue;
      const tx = await src.transaction(s.signature);
      if (!tx) throw new Error(`transaction ${s.signature} not found`);
      const d = balanceDelta(tx, e.tokenAccount);
      if (d < 0n) outflows.push({ signature: s.signature, amount: -d });
    }
    if (sigs.length < pageSize) done = true;
    before = sigs.at(-1)?.signature;
  }
  const findings: Finding[] = [];
  const total = outflows.reduce((a, x) => a + x.amount, 0n);
  const hours = (e.outflowWindowSecs / 3600).toFixed(1);
  if (!done) {
    findings.push({
      severity: 'HIGH',
      check: 'outflows',
      message: `reserve token account ${e.tokenAccount}: more than ${pageSize * maxPages} transactions in the last ${hours} h; the scan stopped at the page bound (outflows counted so far: ${total})`,
    });
  }
  if (total > e.outflowAlertThreshold) {
    const top = [...outflows].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0)).slice(0, 5);
    findings.push({
      severity: 'HIGH',
      check: 'outflows',
      message: `reserve token account ${e.tokenAccount}: ${total} base units left in the last ${hours} h, above the alert threshold ${e.outflowAlertThreshold} (largest: ${top.map((x) => `${x.signature} ${x.amount}`).join('; ')})`,
    });
  }
  return { findings, scanned, total };
}
