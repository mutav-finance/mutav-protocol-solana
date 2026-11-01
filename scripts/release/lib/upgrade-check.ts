/**
 * The upgrade part of `verify-proposal.ts` (audit S9, S14): a vault
 * transaction that upgrades a program is approved only when
 *
 * - its single loader `Upgrade` names the intent's program, its ProgramData
 *   PDA, the intent's buffer and spill, and the vault as authority; an
 *   `ExtendProgramChecked` beside it names the same program and the vault;
 *   no loader `SetAuthority`, `SetAuthorityChecked` or `Close` rides along;
 * - the buffer is owned by the loader, its authority is the vault, and
 *   ProgramData's upgrade authority is the vault (`checkUpgradeSources`);
 * - the buffer's program bytes hash (solana-verify style, trailing zeros
 *   trimmed) to the intent's `expectedHash` AND to the member's own
 *   reproducible build (`--so`);
 * - every BPF Loader Upgradeable instruction (selected by program id, not by
 *   decoded family) decoded cleanly: a padded or otherwise malformed one is
 *   refused, so it cannot slip past these checks as a raw instruction;
 * - the buffer's program bytes contain the 32 bytes of the target program
 *   ID (`declare_id!` embeds them; S14), so the upgrade cannot brick the
 *   program with `DeclaredProgramIdMismatch`.
 */
import { getAddressEncoder, type Address } from '@solana/kit';
import { BPF_LOADER_UPGRADEABLE, programDataAddress } from '../../devnet/lib/compose';
import { BUFFER_HEADER, executableHash } from '../../devnet/lib/hash';
import { checkUpgradeSources } from '../upgrade-proposal';
import type { DecodedInstruction } from './decode';
import type { Upgrade } from './intent';

export type Account = { owner: Address; data: Uint8Array } | null;

export const BUILD_HELP =
  'build the release locally and pass it with --so: check out the signed tag, run ' +
  '`solana-verify build --library-name mutav --base-image <VERIFY_BASE_IMAGE from .github/workflows/release.yml>` ' +
  '(docs/security/verify-proposal.md), then `solana-verify get-executable-hash target/deploy/mutav.so` must print the intent\'s expectedHash';

/** Whether `hay` contains `needle` as a contiguous run. */
export function containsBytes(hay: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return true;
  const first = needle[0]!;
  for (let i = hay.indexOf(first); i >= 0 && i <= hay.length - needle.length; i = hay.indexOf(first, i + 1)) {
    let ok = true;
    for (let j = 1; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

const acct = (ix: DecodedInstruction, name: string) => ix.accounts.find((a) => a.name === name)?.address;

/** The instruction-level checks: which accounts the loader instructions name. */
export async function checkUpgradeInstructions(ixs: DecodedInstruction[], u: Upgrade | undefined, vault: Address): Promise<string[]> {
  const out: string[] = [];
  const loader = ixs.filter((x) => x.programId === BPF_LOADER_UPGRADEABLE);
  for (const x of loader) if (x.family !== 'loader') out.push(`a BPF Loader Upgradeable instruction does not decode cleanly (${x.error ?? 'not decoded'}): refused`);
  const ups = loader.filter((x) => x.family === 'loader' && x.name === 'Upgrade');
  if (!ups.length) return u ? [...out, 'the intent describes an upgrade, but the transaction holds no loader Upgrade'] : out;
  if (!u) return [...out, 'the transaction upgrades a program, but the intent has no "upgrade" block'];
  if (ups.length > 1) out.push(`the transaction holds ${ups.length} loader Upgrade instructions; one is allowed`);
  for (const x of loader) {
    if (['SetAuthority', 'SetAuthorityChecked', 'Close'].includes(x.name)) out.push(`loader ${x.name} beside an Upgrade is refused (audit S9)`);
  }
  const pd = await programDataAddress(u.programId);
  for (const x of ups) {
    if (acct(x, 'program') !== u.programId) out.push(`Upgrade program is ${acct(x, 'program')}, expected ${u.programId}`);
    if (acct(x, 'programData') !== pd) out.push(`Upgrade ProgramData is ${acct(x, 'programData')}, expected ${pd} (the PDA of ${u.programId})`);
    if (acct(x, 'buffer') !== u.buffer) out.push(`Upgrade buffer is ${acct(x, 'buffer')}, expected ${u.buffer}`);
    if (acct(x, 'spill') !== u.spill) out.push(`Upgrade spill is ${acct(x, 'spill')}, expected ${u.spill}`);
    if (acct(x, 'authority') !== vault) out.push(`Upgrade authority is ${acct(x, 'authority')}, expected the vault ${vault}`);
  }
  for (const x of loader.filter((y) => y.name === 'ExtendProgramChecked' || y.name === 'ExtendProgram')) {
    if (acct(x, 'program') !== u.programId || acct(x, 'programData') !== pd) out.push(`${x.name} names another program than ${u.programId}`);
    if (x.name === 'ExtendProgramChecked' && acct(x, 'authority') !== vault) out.push(`ExtendProgramChecked authority is ${acct(x, 'authority')}, expected the vault ${vault}`);
  }
  return out;
}

/** The account-level checks: the buffer, ProgramData and the member's own build. */
export function checkUpgradeBuffer(p: { upgrade: Upgrade; vault: Address; buffer: Account; programData: Account; so: Uint8Array | undefined }): { failures: string[]; facts: string[] } {
  const { upgrade: u, vault } = p;
  const failures = checkUpgradeSources({ buffer: p.buffer, programData: p.programData, vault, expectedHash: u.expectedHash });
  const facts: string[] = [];
  if (p.buffer && p.buffer.data.length >= BUFFER_HEADER) {
    const program = p.buffer.data.subarray(BUFFER_HEADER);
    facts.push(`buffer executable hash ${executableHash(program)} (${program.length} bytes)`);
    if (!containsBytes(program, getAddressEncoder().encode(u.programId) as Uint8Array)) {
      failures.push(`the buffer's program bytes do not contain the program ID ${u.programId}: it was built for another declare_id! and would stop every instruction (audit S14)`);
    }
  }
  if (!p.so) failures.push(`no --so given for an upgrade: ${BUILD_HELP}`);
  else {
    const h = executableHash(p.so);
    facts.push(`local build (--so) executable hash ${h}`);
    if (h !== u.expectedHash) failures.push(`your local build hashes to ${h}, not the intent's expectedHash ${u.expectedHash}: do not approve`);
  }
  return { failures, facts };
}
