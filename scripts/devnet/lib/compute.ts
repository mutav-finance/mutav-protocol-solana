/**
 * Compute-unit limits for the transactions the deploy scripts compose. The
 * program is built with `opt-level = "z"` (smaller ProgramData, more compute
 * units per instruction), so a Squads execute or a full `initialize` can
 * pass the runtime's 200,000-CU default for a one-instruction transaction.
 * Each limit is about 1.5x the worst case measured in LiteSVM, under the
 * 1,400,000 maximum: see docs/technical-resources/compute-units.md
 * (`cargo test -p mutav-tests --test compute`).
 */
import { address, type Instruction } from '@solana/kit';

export const COMPUTE_BUDGET_PROGRAM = address('ComputeBudget111111111111111111111111111111');

/** The most a transaction can request. */
export const MAX_COMPUTE_UNIT_LIMIT = 1_400_000;

/** `initialize` signed directly (local dry run): worst case 172,946 CU. */
export const INITIALIZE_COMPUTE_UNIT_LIMIT = 260_000;

/**
 * The transaction that runs Squads v4 `vault_transaction_execute` for any
 * proposal these scripts write. Worst case 210,469 CU (`initialize` through
 * the upgrade multisig); the admin calls stay under 203,548.
 */
export const SQUADS_EXECUTE_COMPUTE_UNIT_LIMIT = 320_000;

/** Compute Budget `SetComputeUnitLimit` (instruction 2, `u32` units). */
export function setComputeUnitLimitInstruction(units: number): Instruction {
  if (!Number.isInteger(units) || units < 1 || units > MAX_COMPUTE_UNIT_LIMIT) {
    throw new Error(`compute-unit limit must be an integer in [1, ${MAX_COMPUTE_UNIT_LIMIT}], got ${units}`);
  }
  const data = new Uint8Array(5);
  data[0] = 2;
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET_PROGRAM, accounts: [], data };
}
