import { describe, expect, test } from 'bun:test';
import { address, getAddressEncoder } from '@solana/kit';
import {
  checkSquadsMultisig,
  decodeSquadsMultisig,
  DEFAULT_PUBKEY,
  MULTISIG_DISCRIMINATOR,
  PERMISSION,
  squadsVaultAddress,
} from '../devnet/lib/squads';

const enc = getAddressEncoder();
const A = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const B = address('2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz');
const C = address('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2');

/** Fixture bytes in the Squads v4 Multisig layout. */
function multisigBytes(o: {
  configAuthority?: typeof A;
  threshold?: number;
  timeLock?: number;
  rentCollector?: typeof A | null;
  members?: [typeof A, number][];
}): Uint8Array {
  const members = o.members ?? [
    [A, 7],
    [B, 7],
    [C, 7],
  ];
  const parts: number[] = [...MULTISIG_DISCRIMINATOR];
  const push32 = (a: typeof A) => parts.push(...enc.encode(a));
  const le = (v: bigint, n: number) => {
    for (let i = 0; i < n; i++) parts.push(Number((v >> BigInt(8 * i)) & 0xffn));
  };
  push32(C); // create_key
  push32(o.configAuthority ?? DEFAULT_PUBKEY);
  le(BigInt(o.threshold ?? 2), 2);
  le(BigInt(o.timeLock ?? 86_400), 4);
  le(17n, 8); // transaction_index
  le(3n, 8); // stale_transaction_index
  if (o.rentCollector) {
    parts.push(1);
    push32(o.rentCollector);
  } else parts.push(0);
  parts.push(254); // bump
  le(BigInt(members.length), 4);
  for (const [k, p] of members) {
    push32(k);
    parts.push(p);
  }
  return new Uint8Array(parts);
}

describe('decodeSquadsMultisig', () => {
  test('decodes every field', () => {
    const m = decodeSquadsMultisig(multisigBytes({ rentCollector: B, timeLock: 172_800 }));
    expect(m).toEqual({
      createKey: C,
      configAuthority: DEFAULT_PUBKEY,
      threshold: 2,
      timeLock: 172_800,
      transactionIndex: 17n,
      staleTransactionIndex: 3n,
      rentCollector: B,
      bump: 254,
      members: [
        { key: A, permissions: 7 },
        { key: B, permissions: 7 },
        { key: C, permissions: 7 },
      ],
    });
  });

  test('refuses other accounts and truncated data', () => {
    const bad = multisigBytes({});
    bad[0] ^= 1;
    expect(() => decodeSquadsMultisig(bad)).toThrow('discriminator');
    expect(() => decodeSquadsMultisig(multisigBytes({}).subarray(0, 120))).toThrow();
  });

  test('discriminator is sha256("account:Multisig")[..8]', () => {
    expect(Buffer.from(MULTISIG_DISCRIMINATOR).toString('hex')).toBe('e07479ba44a14fec');
  });
});

describe('checkSquadsMultisig', () => {
  const floor = 86_400;
  test('an autonomous multisig at the floor passes', () => {
    expect(checkSquadsMultisig(decodeSquadsMultisig(multisigBytes({})), floor)).toEqual([]);
  });

  test('a controlled multisig fails', () => {
    const m = decodeSquadsMultisig(multisigBytes({ configAuthority: A }));
    expect(checkSquadsMultisig(m, floor).join()).toContain('config_authority');
  });

  test('a time lock below the floor fails', () => {
    const m = decodeSquadsMultisig(multisigBytes({ timeLock: floor - 1 }));
    expect(checkSquadsMultisig(m, floor).join()).toContain('time_lock');
  });

  test('a threshold above the voting members fails', () => {
    const m = decodeSquadsMultisig(
      multisigBytes({ threshold: 2, members: [[A, PERMISSION.vote], [B, PERMISSION.initiate]] }),
    );
    expect(checkSquadsMultisig(m, floor).join()).toContain('threshold');
  });
});

describe('squadsVaultAddress', () => {
  test('is deterministic per multisig and index', async () => {
    const v0 = await squadsVaultAddress(A, 0);
    expect(await squadsVaultAddress(A, 0)).toBe(v0);
    expect(await squadsVaultAddress(A, 1)).not.toBe(v0);
    expect(await squadsVaultAddress(B, 0)).not.toBe(v0);
  });
});
