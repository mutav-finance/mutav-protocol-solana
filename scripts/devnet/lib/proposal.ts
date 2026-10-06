/**
 * Unsigned Squads v4 proposal payloads. A payload lists the instructions one
 * vault transaction executes, with the vault as their signer. Members create
 * and approve it from mutav-app `apps/admin` (or the Squads app):
 * `multisig.rpc.vaultTransactionCreate({ multisigPda, vaultIndex,
 * transactionMessage: new TransactionMessage({ payerKey: vault,
 * instructions, recentBlockhash }) … })`, then `proposalCreate`,
 * `proposalApprove`, and `vaultTransactionExecute` after the time lock.
 */
import { writeFileSync } from 'node:fs';
import { AccountRole, getBase64Decoder, type Address, type Instruction } from '@solana/kit';

export type ProposalPayload = {
  kind: 'mutav-squads-proposal/v1';
  title: string;
  cluster: string;
  multisig: Address;
  vaultIndex: number;
  vault: Address;
  instructions: {
    programAddress: Address;
    accounts: { address: Address; isSigner: boolean; isWritable: boolean }[];
    dataBase64: string;
  }[];
};

const b64 = getBase64Decoder();

export function toPayload(
  p: Omit<ProposalPayload, 'kind' | 'instructions'>,
  ixs: Instruction[],
): ProposalPayload {
  return {
    kind: 'mutav-squads-proposal/v1',
    ...p,
    instructions: ixs.map((ix) => ({
      programAddress: ix.programAddress,
      accounts: (ix.accounts ?? []).map((m) => ({
        address: m.address,
        isSigner: m.role === AccountRole.READONLY_SIGNER || m.role === AccountRole.WRITABLE_SIGNER,
        isWritable: m.role === AccountRole.WRITABLE || m.role === AccountRole.WRITABLE_SIGNER,
      })),
      dataBase64: b64.decode(ix.data ?? new Uint8Array()),
    })),
  };
}

/** Every signer of a vault transaction must be the vault itself. */
export function assertOnlyVaultSigns(p: ProposalPayload) {
  for (const ix of p.instructions) {
    for (const a of ix.accounts) {
      if (a.isSigner && a.address !== p.vault) {
        throw new Error(`instruction for ${ix.programAddress} needs signer ${a.address}, not the vault ${p.vault}`);
      }
    }
  }
}

export function writePayload(path: string, p: ProposalPayload) {
  assertOnlyVaultSigns(p);
  writeFileSync(path, JSON.stringify(p, null, 2) + '\n');
  console.log(`wrote unsigned proposal ${path} (${p.instructions.length} instruction(s), vault ${p.vault})`);
}
