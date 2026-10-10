import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import { checkReserveMint, RESERVE_DECIMALS } from '../devnet/lib/checks';
import { TOKEN_PROGRAM } from '../devnet/lib/compose';
import { testAddress } from './fixtures';

const OTHER_PROGRAM = testAddress(40);

/** SPL Token Mint: COption<Pubkey> authority (36) | u64 supply | u8 decimals | bool initialized | COption<Pubkey> freeze (36). */
function mintBytes(decimals: number, initialized = true): Uint8Array {
  const b = new Uint8Array(82);
  b[44] = decimals;
  b[45] = initialized ? 1 : 0;
  return b;
}

describe('checkReserveMint', () => {
  const cfg = { reserveMint: address('BRS2CELW6Cueo2mrMUVvAr5GDT7Pw8TeostC2JLMpBk4'), reserveTokenProgram: TOKEN_PROGRAM };
  test('a classic SPL mint with 6 decimals passes', () => {
    expect(RESERVE_DECIMALS).toBe(6);
    expect(checkReserveMint({ owner: TOKEN_PROGRAM, data: mintBytes(6) }, cfg)).toEqual([]);
  });
  test('9 decimals (the spl-token create-token default) fails', () => {
    expect(checkReserveMint({ owner: TOKEN_PROGRAM, data: mintBytes(9) }, cfg).join()).toContain('decimals 9');
  });
  test('an owner other than the configured token program fails', () => {
    expect(checkReserveMint({ owner: OTHER_PROGRAM, data: mintBytes(6) }, cfg).join()).toContain('reserveTokenProgram');
  });
  test('missing, short or uninitialised accounts fail', () => {
    expect(checkReserveMint(null, cfg).join()).toContain('not found');
    expect(checkReserveMint({ owner: TOKEN_PROGRAM, data: new Uint8Array(40) }, cfg).join()).toContain('not a mint');
    expect(checkReserveMint({ owner: TOKEN_PROGRAM, data: mintBytes(6, false) }, cfg).join()).toContain('not initialised');
  });
});
