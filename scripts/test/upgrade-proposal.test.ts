import { describe, expect, test } from 'bun:test';
import { address, AccountRole, type Address } from '@solana/kit';
import { composeUpgrade, PROGRAM_DATA_HEADER } from '../release/upgrade-proposal';
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
