import { describe, expect, test } from 'bun:test';
import { address, getAddressDecoder, type Address } from '@solana/kit';
import {
  decodeConfigTransaction,
  decodeProposal,
  decodeVaultTransaction,
  squadsEphemeralSigner,
  squadsProposalAddress,
  squadsTransactionAddress,
  transactionKind,
  type ConfigAction,
} from '../release/lib/squads-tx';
import { configTransactionBytes, proposalBytes, vaultTransactionBytes } from './squads-tx-fixtures';

/** The address of 32 bytes of `n` (as the golden generator's `pk(n)`). */
const pk = (n: number): Address => getAddressDecoder().decode(new Uint8Array(32).fill(n));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const unhex = (h: string) => new Uint8Array(Buffer.from(h, 'hex'));

/**
 * Golden bytes serialized by the @sqds/multisig 2.1.4 beet types
 * (vaultTransactionBeet, configTransactionBeet, proposalBeet) and PDAs from its
 * pda.ts, for the inputs rebuilt below. Generated once from app/node_modules;
 * the repo root does not depend on the Squads SDK.
 */
const GOLDEN = {
 "vaultTransaction": "a8faa264510ea2cf010101010101010101010101010101010101010101010101010101010101010102020202020202020202020202020202020202020202020202020202020202020700000000000000ff00fe01000000c80101010300000003030303030303030303030303030303030303030303030303030303030303030404040404040404040404040404040404040404040404040404040404040404050505050505050505050505050505050505050505050505050505050505050501000000020200000000010c0000000200000040420f00000000000100000006060606060606060606060606060606060606060606060606060606060606060100000001020000000203",
 "configTransaction": "5e080423718b8b70010101010101010101010101010101010101010101010101010101010101010102020202020202020202020202020202020202020202020202020202020202020800000000000000fa0800000000090909090909090909090909090909090909090909090909090909090909090907010a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0202000380510100040b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b010c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c0c40420f000000000002010000000d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d0d020000000e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f051010101010101010101010101010101010101010101010101010101010101010060111111111111111111111111111111111111111111111111111111111111111110600",
 "proposal": "1a5ebdbb74883521010101010101010101010101010101010101010101010101010101010101010107000000000000000300f1536500000000fd020000000303030303030303030303030303030303030303030303030303030303030303040404040404040404040404040404040404040404040404040404040404040400000000010000000505050505050505050505050505050505050505050505050505050505050505",
 "transactionPda": "57dZyEaYKvfqpSaKKx9VGN1fGh1FpuC5xfdDncon6EQZ",
 "proposalPda": "G52w84M9KPLzvT1ujaWfcJzvYnP7umnKDDqzJndoAuxD",
 "ephemeralPda": "EnSxvebENfNKrPxnnPkdcv6LTdKx9P4QkYB1TCM9GvUT"
};

const message = {
  numSigners: 1,
  numWritableSigners: 1,
  numWritableNonSigners: 1,
  accountKeys: [pk(3), pk(4), pk(5)],
  instructions: [{ programIdIndex: 2, accountIndexes: [0, 1], data: new Uint8Array([2, 0, 0, 0, 64, 66, 15, 0, 0, 0, 0, 0]) }],
  addressTableLookups: [{ accountKey: pk(6), writableIndexes: [1], readonlyIndexes: [2, 3] }],
};
const actions: ConfigAction[] = [
  { name: 'AddMember', args: { newMember: pk(9), permissions: 7 } },
  { name: 'RemoveMember', args: { oldMember: pk(10) } },
  { name: 'ChangeThreshold', args: { newThreshold: 2 } },
  { name: 'SetTimeLock', args: { newTimeLock: 86400 } },
  { name: 'AddSpendingLimit', args: { createKey: pk(11), vaultIndex: 1, mint: pk(12), amount: 1000000n, period: 'Week', members: [pk(13)], destinations: [pk(14), pk(15)] } },
  { name: 'RemoveSpendingLimit', args: { spendingLimit: pk(16) } },
  { name: 'SetRentCollector', args: { newRentCollector: pk(17) } },
  { name: 'SetRentCollector', args: { newRentCollector: null } },
];

describe('fixture encoders match the Squads SDK layout', () => {
  test('VaultTransaction', () => {
    const b = vaultTransactionBytes({ multisig: pk(1), creator: pk(2), index: 7n, ephemeralSignerBumps: [200], message });
    expect(hex(b)).toBe(GOLDEN.vaultTransaction);
  });
  test('ConfigTransaction, every action', () => {
    expect(hex(configTransactionBytes({ multisig: pk(1), creator: pk(2), index: 8n, bump: 250, actions }))).toBe(GOLDEN.configTransaction);
  });
  test('Proposal', () => {
    const b = proposalBytes({ multisig: pk(1), index: 7n, status: 'Approved', timestamp: 1_700_000_000n, approved: [pk(3), pk(4)], cancelled: [pk(5)] });
    expect(hex(b)).toBe(GOLDEN.proposal);
  });
  test('PDAs', async () => {
    expect(await squadsTransactionAddress(pk(1), 7n)).toBe(address(GOLDEN.transactionPda));
    expect(await squadsProposalAddress(pk(1), 7n)).toBe(address(GOLDEN.proposalPda));
    expect(await squadsEphemeralSigner(pk(20), 0)).toBe(address(GOLDEN.ephemeralPda));
  });
});

describe('decoders', () => {
  test('VaultTransaction decodes the golden bytes', () => {
    const v = decodeVaultTransaction(unhex(GOLDEN.vaultTransaction));
    expect(v).toMatchObject({ kind: 'vault', multisig: pk(1), creator: pk(2), index: 7n, bump: 255, vaultIndex: 0, vaultBump: 254, ephemeralSignerBumps: [200] });
    expect(v.message.accountKeys).toEqual([pk(3), pk(4), pk(5)]);
    expect(v.message.instructions[0]!.accountIndexes).toEqual([0, 1]);
    expect(v.message.addressTableLookups).toEqual([{ accountKey: pk(6), writableIndexes: [1], readonlyIndexes: [2, 3] }]);
    expect(transactionKind(unhex(GOLDEN.vaultTransaction))).toBe('vault');
  });
  test('ConfigTransaction decodes every action of the golden bytes', () => {
    const c = decodeConfigTransaction(unhex(GOLDEN.configTransaction));
    expect(c.actions).toEqual(actions);
    expect(c.index).toBe(8n);
    expect(transactionKind(unhex(GOLDEN.configTransaction))).toBe('config');
  });
  test('Proposal decodes, unused vote capacity (zeros) is accepted', () => {
    const p = decodeProposal(new Uint8Array([...unhex(GOLDEN.proposal), 0, 0, 0, 0]));
    expect(p).toEqual({ multisig: pk(1), transactionIndex: 7n, status: 'Approved', statusTimestamp: 1_700_000_000n, bump: 253, approved: [pk(3), pk(4)], rejected: [], cancelled: [pk(5)] });
    expect(decodeProposal(proposalBytes({ multisig: pk(1), index: 2n, status: 'Executing' })).statusTimestamp).toBeNull();
  });
  test('refuses a wrong discriminator, truncation and trailing bytes', () => {
    const v = unhex(GOLDEN.vaultTransaction);
    expect(() => decodeConfigTransaction(v)).toThrow('discriminator');
    expect(() => decodeVaultTransaction(v.subarray(0, v.length - 1))).toThrow('runs past');
    expect(() => decodeVaultTransaction(new Uint8Array([...v, 0]))).toThrow('trailing');
    expect(() => decodeProposal(new Uint8Array([...unhex(GOLDEN.proposal), 1]))).toThrow('trailing');
    expect(transactionKind(new Uint8Array(16))).toBeNull();
  });
  test('refuses an unknown config action or proposal status', () => {
    const c = unhex(GOLDEN.configTransaction);
    const bad = c.slice();
    bad[8 + 32 + 32 + 8 + 1 + 4] = 9; // first action tag
    expect(() => decodeConfigTransaction(bad)).toThrow('ConfigAction tag 9');
    const p = unhex(GOLDEN.proposal).slice();
    p[8 + 32 + 8] = 7;
    expect(() => decodeProposal(p)).toThrow('status tag 7');
  });
});
