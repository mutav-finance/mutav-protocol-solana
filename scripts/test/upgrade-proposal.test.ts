import { describe, expect, test } from 'bun:test';
import { address, AccountRole, type Address } from '@solana/kit';
import { composeUpgrade, main, PROGRAM_DATA_HEADER } from '../release/upgrade-proposal';
import { parseVaultIndex, squadsVaultAddress } from '../devnet/lib/squads';
import { programDataAddress, BPF_LOADER_UPGRADEABLE } from '../devnet/lib/compose';

const PROGRAM: Address = address('8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9');
const BUFFER: Address = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const VAULT: Address = address('2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz');

describe('composeUpgrade', () => {
  test('a .so that fits: Upgrade only, signed by the vault', async () => {
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: BUFFER, vault: VAULT, spill: VAULT, soLen: 1000, programDataLen: PROGRAM_DATA_HEADER + 1000 });
    expect(ixs).toHaveLength(1);
    const up = ixs[0]!;
    expect(up.programAddress).toBe(BPF_LOADER_UPGRADEABLE);
    expect([...up.data!]).toEqual([3, 0, 0, 0]);
    expect(up.accounts!.map((a) => a.address)).toEqual([
      await programDataAddress(PROGRAM),
      PROGRAM,
      BUFFER,
      VAULT,
      address('SysvarRent111111111111111111111111111111111'),
      address('SysvarC1ock11111111111111111111111111111111'),
      VAULT,
    ]);
    expect(up.accounts![6]!.role).toBe(AccountRole.READONLY_SIGNER);
  });

  test('a larger .so: ExtendProgramChecked first, by the missing bytes', async () => {
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: BUFFER, vault: VAULT, spill: VAULT, soLen: 1500, programDataLen: PROGRAM_DATA_HEADER + 1000 });
    expect(ixs).toHaveLength(2);
    const ext = ixs[0]!;
    expect([...ext.data!]).toEqual([9, 0, 0, 0, 0xf4, 0x01, 0, 0]); // 500 bytes
    expect(ext.accounts![2]!.address).toBe(VAULT);
    expect(ext.accounts![2]!.role).toBe(AccountRole.READONLY_SIGNER);
    expect([...ixs[1]!.data!]).toEqual([3, 0, 0, 0]);
  });
});

describe('vault index', () => {
  test.each(['abc', 'NaN', '', '-1', '256', '1.5', '0x1', ' 1', '1e2'])('rejects %p', (v) => {
    expect(() => parseVaultIndex(v)).toThrow('vault index');
  });
  test('accepts 0..255 and defaults to 0', () => {
    expect(parseVaultIndex(undefined)).toBe(0);
    expect(parseVaultIndex('0')).toBe(0);
    expect(parseVaultIndex('255')).toBe(255);
  });
  test('the vault PDA refuses an index that would wrap in a u8 seed', async () => {
    await expect(squadsVaultAddress(VAULT, 256)).rejects.toThrow('vault index');
    await expect(squadsVaultAddress(VAULT, Number.NaN)).rejects.toThrow('vault index');
  });
  test('main rejects a bad --vault-index before reading the chain', async () => {
    await expect(
      main({ url: 'http://127.0.0.1:1', program: PROGRAM, buffer: BUFFER, multisig: VAULT, 'vault-index': '300', so: '/nonexistent', out: '/nonexistent' }),
    ).rejects.toThrow('vault index');
  });
});
