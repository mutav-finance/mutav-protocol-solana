/**
 * Spec §14.5 step 6: the program-upgrade instructions for one Squads vault
 * transaction, as an unsigned proposal payload. `ExtendProgramChecked`
 * (signed by the upgrade-authority vault) goes first when the new `.so` is
 * larger than ProgramData.
 *
 *   bun scripts/release/upgrade-proposal.ts --url <rpc> [--confirm-cluster devnet] \
 *     --program <id> --buffer <buffer> --multisig <upgrade multisig> [--vault-index 0] \
 *     --so target/deploy/mutav.so --expected-hash <sha256> --out upgrade-proposal.json
 *
 * `--expected-hash` is the output of `solana-verify get-executable-hash` for
 * the verified build. Before composing anything it reads, at `confirmed`:
 * - the buffer: owned by BPF Loader Upgradeable, its authority the upgrade
 *   vault (so nobody else can rewrite it before the vote executes), and its
 *   program bytes hashing to `--expected-hash` (as `solana-verify
 *   get-buffer-hash` computes it);
 * - ProgramData: owned by the loader, its upgrade authority the vault.
 *
 * The Program Metadata IDL write and the verify-PDA write are produced by
 * their own CLIs (see .github/workflows/release.yml) and added to the same
 * vault transaction by the proposer. Reads the chain; signs nothing.
 */
import { statSync } from 'node:fs';
import {
  AccountRole,
  address,
  createNoopSigner,
  getU32Encoder,
  type Address,
  type Instruction,
} from '@solana/kit';
import { guardCluster, opt, parseArgs, req, type Args } from '../devnet/lib/cli';
import { rpcGenesis, type GenesisSource } from '../devnet/lib/cluster';
import { BPF_LOADER_UPGRADEABLE, programDataAddress, SYSTEM_PROGRAM } from '../devnet/lib/compose';
import { programDataUpgradeAuthority } from '../devnet/lib/checks';
import { bufferAuthority, bufferHash, parseExpectedHash, PROGRAM_DATA_HEADER } from '../devnet/lib/hash';
import { toPayload, writePayload } from '../devnet/lib/proposal';
import { accountInfo, rpcFor } from '../devnet/lib/rpc';
import { parseVaultIndex, squadsVaultAddress } from '../devnet/lib/squads';

export { PROGRAM_DATA_HEADER };
type Account = { owner: Address; data: Uint8Array } | null;

/**
 * The buffer and ProgramData the upgrade names, as read from the chain.
 * Returns the failures; empty means the proposal may be composed.
 */
export function checkUpgradeSources(p: {
  buffer: Account;
  programData: Account;
  vault: Address;
  expectedHash: string;
}): string[] {
  const out: string[] = [];
  const { buffer, programData, vault } = p;
  if (!buffer) out.push('buffer not found');
  else if (buffer.owner !== BPF_LOADER_UPGRADEABLE) out.push(`buffer is owned by ${buffer.owner}, not BPF Loader Upgradeable`);
  else {
    try {
      const auth = bufferAuthority(buffer.data);
      if (auth !== vault) out.push(`buffer authority is ${auth ?? 'none'}, expected the upgrade vault ${vault}`);
      const h = bufferHash(buffer.data);
      if (h !== p.expectedHash) out.push(`buffer hash is ${h}, expected ${p.expectedHash} (solana-verify get-buffer-hash)`);
    } catch (e) {
      out.push(`buffer: ${(e as Error).message}`);
    }
  }
  if (!programData) out.push('ProgramData not found');
  else if (programData.owner !== BPF_LOADER_UPGRADEABLE) out.push(`ProgramData is owned by ${programData.owner}, not BPF Loader Upgradeable`);
  else {
    try {
      const ua = programDataUpgradeAuthority(programData.data);
      if (ua !== vault) out.push(`ProgramData upgrade authority is ${ua ?? 'none (immutable)'}, expected the upgrade vault ${vault}`);
    } catch (e) {
      out.push(`ProgramData: ${(e as Error).message}`);
    }
  }
  return out;
}
const RENT = address('SysvarRent111111111111111111111111111111111');
const CLOCK = address('SysvarC1ock11111111111111111111111111111111');

export async function composeUpgrade(p: {
  programId: Address;
  buffer: Address;
  vault: Address;
  spill: Address;
  soLen: number;
  programDataLen: number;
}): Promise<Instruction[]> {
  const programData = await programDataAddress(p.programId);
  const vault = createNoopSigner(p.vault);
  const u32 = getU32Encoder();
  const ixs: Instruction[] = [];
  const missing = p.soLen - (p.programDataLen - PROGRAM_DATA_HEADER);
  if (missing > 0) {
    // UpgradeableLoaderInstruction::ExtendProgramChecked { additional_bytes } = 9.
    ixs.push({
      programAddress: BPF_LOADER_UPGRADEABLE,
      accounts: [
        { address: programData, role: AccountRole.WRITABLE },
        { address: p.programId, role: AccountRole.WRITABLE },
        { address: p.vault, role: AccountRole.READONLY_SIGNER, signer: vault } as never,
        { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
        { address: p.vault, role: AccountRole.WRITABLE_SIGNER, signer: vault } as never,
      ],
      data: new Uint8Array([...u32.encode(9), ...u32.encode(missing)]),
    });
  }
  // UpgradeableLoaderInstruction::Upgrade = 3.
  ixs.push({
    programAddress: BPF_LOADER_UPGRADEABLE,
    accounts: [
      { address: programData, role: AccountRole.WRITABLE },
      { address: p.programId, role: AccountRole.WRITABLE },
      { address: p.buffer, role: AccountRole.WRITABLE },
      { address: p.spill, role: AccountRole.WRITABLE },
      { address: RENT, role: AccountRole.READONLY },
      { address: CLOCK, role: AccountRole.READONLY },
      { address: p.vault, role: AccountRole.READONLY_SIGNER, signer: vault } as never,
    ],
    data: new Uint8Array(u32.encode(3)),
  });
  return ixs;
}

export type UpgradeDeps = { account: (url: string, a: Address) => Promise<Account>; genesis: GenesisSource };
const defaultDeps: UpgradeDeps = {
  account: (url, a) => accountInfo(rpcFor(url), a, { commitment: 'confirmed' }),
  genesis: rpcGenesis,
};

export async function main(args: Args, deps: UpgradeDeps = defaultDeps) {
  const vaultIndex = parseVaultIndex(opt(args, 'vault-index'));
  const expectedHash = parseExpectedHash(opt(args, 'expected-hash'));
  // The payload names the cluster, never the RPC URL (it may carry an API key).
  const { url, cluster } = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'), deps.genesis);
  const programId = address(req(args, 'program'));
  const multisig = address(req(args, 'multisig'));
  const buffer = address(req(args, 'buffer'));
  const vault = await squadsVaultAddress(multisig, vaultIndex);
  const pd = await deps.account(url, await programDataAddress(programId));
  const failures = checkUpgradeSources({ buffer: await deps.account(url, buffer), programData: pd, vault, expectedHash });
  if (failures.length) throw new Error(`refusing to propose the upgrade of ${programId}:\n  ${failures.join('\n  ')}`);
  const ixs = await composeUpgrade({
    programId,
    buffer,
    vault,
    spill: vault,
    soLen: statSync(req(args, 'so')).size,
    programDataLen: pd!.data.length,
  });
  if (ixs.length > 1) console.log('new .so is larger than ProgramData: ExtendProgramChecked bundled first');
  writePayload(req(args, 'out'), toPayload({ title: `MUTAV: upgrade ${programId} from buffer ${buffer} (executable hash ${expectedHash})`, cluster, multisig, vaultIndex, vault }, ixs));
}

if (import.meta.main) await main(parseArgs());
