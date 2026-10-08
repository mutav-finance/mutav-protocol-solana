import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import {
  findAgencyExposurePda,
  findClaimFilingPda,
  findDepositRequestPda,
  findFeeReceiptPda,
  findGuaranteePda,
  findHolderStatePda,
  findIncomeInboxAddress,
  findIncomeReceiptPda,
  findPayoutPda,
  findRedeemRequestPda,
  findReserveAddresses,
  MUTAV_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from '../src';
import { unhex, vectors } from './vectors';

const { inputs, expected, programAddress } = vectors.pdas;

describe('PDA derivation matches the program', () => {
  test('program address', () => {
    expect(MUTAV_PROGRAM_ADDRESS).toBe(programAddress);
  });

  test('reserve-level addresses', async () => {
    const a = await findReserveAddresses(address(inputs.reserveMint));
    expect(a).toEqual({
      config: expected.config,
      state: expected.state,
      vaultAuthority: expected.vaultAuthority,
      shareMint: expected.shareMint,
      reserve: expected.reserve,
      pendingDeposits: expected.pendingDeposits,
      pendingRedemptions: expected.pendingRedemptions,
      claims: expected.claims,
      eventAuthority: expected.eventAuthority,
    });
  });

  test('per-record addresses', async () => {
    const config = address(expected.config);
    const guarantee = address(expected.guarantee);
    const seq = BigInt(inputs.seq);
    const notice = unhex(inputs.noticeRefHash);
    expect((await findGuaranteePda({ config, id: unhex(inputs.guaranteeId) }))[0]).toBe(guarantee);
    expect((await findAgencyExposurePda({ config, agencyId: unhex(inputs.agencyId) }))[0]).toBe(
      expected.agencyExposure,
    );
    expect(
      (await findFeeReceiptPda({ config, invoiceRefHash: unhex(inputs.invoiceRefHash) }))[0],
    ).toBe(expected.feeReceipt);
    expect((await findClaimFilingPda({ guarantee, noticeRefHash: notice }))[0]).toBe(
      expected.claimFiling,
    );
    expect((await findPayoutPda({ guarantee, noticeRefHash: notice }))[0]).toBe(expected.payout);
    expect((await findDepositRequestPda({ config, seq }))[0]).toBe(expected.depositRequest);
    expect((await findRedeemRequestPda({ config, seq }))[0]).toBe(expected.redeemRequest);
    expect((await findHolderStatePda({ config, owner: address(inputs.owner) }))[0]).toBe(
      expected.holderState,
    );
  });

  test('income receipt and income inbox (ADR 0017)', async () => {
    const config = address(expected.config);
    expect((await findIncomeReceiptPda({ config, incomeRefHash: unhex(inputs.incomeRefHash) }))[0]).toBe(
      expected.incomeReceipt,
    );
    expect(
      await findIncomeInboxAddress({
        vaultAuthority: address(expected.vaultAuthority),
        reserveMint: address(inputs.reserveMint),
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
    ).toBe(expected.incomeInbox);
  });

  test('seq must be a u64', async () => {
    const config = address(expected.config);
    expect(findRedeemRequestPda({ config, seq: -1n })).rejects.toThrow(RangeError);
  });
});
