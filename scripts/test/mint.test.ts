import { describe, expect, test } from 'bun:test';
import { address } from '@solana/kit';
import { checkReserveMint, RESERVE_DECIMALS } from '../devnet/lib/checks';
import { TOKEN_PROGRAM } from '../devnet/lib/compose';
import { testAddress } from './fixtures';

const OTHER_PROGRAM = testAddress(40);
const TOKEN_2022 = address('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');

/** SPL Token Mint: COption<Pubkey> authority (36) | u64 supply | u8 decimals | bool initialized | COption<Pubkey> freeze (36). */
function mintBytes(decimals: number, initialized = true, len = 82): Uint8Array {
  const b = new Uint8Array(len);
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
  test('a 165-byte token account (initialised, decimals byte 6) is refused', () => {
    // A token account's bytes 44/45 fall inside its amount field, so they can read as decimals 6 / initialised.
    for (const owner of [TOKEN_PROGRAM, TOKEN_2022]) {
      const c = { ...cfg, reserveTokenProgram: owner };
      expect(checkReserveMint({ owner, data: mintBytes(6, true, 165) }, c).join()).toContain('not a mint (165 bytes)');
    }
  });
  test('a classic mint must be exactly 82 bytes', () => {
    expect(checkReserveMint({ owner: TOKEN_PROGRAM, data: mintBytes(6, true, 83) }, cfg).join()).toContain('not a mint');
  });
  test('Token-2022: 82 bytes, or > 165 with account type Mint', () => {
    const c = { ...cfg, reserveTokenProgram: TOKEN_2022 };
    expect(checkReserveMint({ owner: TOKEN_2022, data: mintBytes(6) }, c)).toEqual([]);
    const ext = mintBytes(6, true, 234);
    ext[165] = 1;
    expect(checkReserveMint({ owner: TOKEN_2022, data: ext }, c)).toEqual([]);
    ext[165] = 2; // Account
    expect(checkReserveMint({ owner: TOKEN_2022, data: ext }, c).join()).toContain('not a mint');
    expect(checkReserveMint({ owner: TOKEN_2022, data: mintBytes(6, true, 120) }, c).join()).toContain('not a mint');
  });
});
