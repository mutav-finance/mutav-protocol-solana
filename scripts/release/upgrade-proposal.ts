/**
 * Spec §14.5 step 6: the program-upgrade instructions for one Squads vault
 * transaction, as an unsigned proposal payload. `ExtendProgramChecked`
 * (signed by the upgrade-authority vault) goes first when the new `.so` is
 * larger than ProgramData.
 *
 *   bun scripts/release/upgrade-proposal.ts --url <rpc> [--confirm-cluster devnet] \
 *     --program <id> --buffer <buffer> --multisig <upgrade multisig> [--vault-index 0] \
 *     --so target/deploy/mutav.so --out upgrade-proposal.json
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
import { BPF_LOADER_UPGRADEABLE, programDataAddress, SYSTEM_PROGRAM } from '../devnet/lib/compose';
import { toPayload, writePayload } from '../devnet/lib/proposal';
import { rpcFor } from '../devnet/lib/rpc';
import { squadsVaultAddress } from '../devnet/lib/squads';

/** ProgramData header: u32 tag | u64 slot | Option<Pubkey> (1 + 32). */
export const PROGRAM_DATA_HEADER = 45;
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

export async function main(args: Args) {
  // The payload names the cluster, never the RPC URL (it may carry an API key).
  const { url, cluster } = await guardCluster(opt(args, 'url'), opt(args, 'confirm-cluster'));
  const programId = address(req(args, 'program'));
  const multisig = address(req(args, 'multisig'));
  const vaultIndex = Number(opt(args, 'vault-index') ?? 0);
  const vault = await squadsVaultAddress(multisig, vaultIndex);
  const pd = await rpcFor(url).getAccountInfo(await programDataAddress(programId), { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }).send();
  if (!pd.value) throw new Error(`ProgramData of ${programId} not found`);
  const ixs = await composeUpgrade({
    programId,
    buffer: address(req(args, 'buffer')),
    vault,
    spill: vault,
    soLen: statSync(req(args, 'so')).size,
    programDataLen: Number(pd.value.space),
  });
  if (ixs.length > 1) console.log('new .so is larger than ProgramData: ExtendProgramChecked bundled first');
  writePayload(req(args, 'out'), toPayload({ title: `MUTAV: upgrade ${programId} from buffer ${req(args, 'buffer')}`, cluster, multisig, vaultIndex, vault }, ixs));
}

if (import.meta.main) await main(parseArgs());
