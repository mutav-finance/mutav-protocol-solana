/** Shared test fixtures: account bytes and a filled deploy config. No key material. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { address, getAddressDecoder, getAddressEncoder, type Address } from '@solana/kit';
import { DEFAULT_PUBKEY, MULTISIG_DISCRIMINATOR } from '../devnet/lib/squads';

const enc = getAddressEncoder();
export const A: Address = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
export const B: Address = address('2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz');
export const C: Address = address('7Np41oeYqPefeNQEHSv1UDhYrehxin3NStELsSKCT4K2');

export const example = () => JSON.parse(readFileSync(join(import.meta.dir, '..', 'devnet', 'devnet.example.json'), 'utf8'));

/** A distinct, valid test address per index. */
export const testAddress = (i: number): Address => getAddressDecoder().decode(new Uint8Array(32).fill(i + 1));

/** The example with every founder input filled by a distinct test address. */
export function filled() {
  let i = 0;
  const fill = (v: any): any => {
    if (typeof v === 'string' && v.startsWith('<FILL')) return testAddress(i++);
    if (Array.isArray(v)) return v.map((x) => fill(x));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)]));
    return v;
  };
  return fill(example());
}


/** Fixture bytes in the Squads v4 Multisig layout. */
export function multisigBytes(o: {
  configAuthority?: Address;
  threshold?: number;
  timeLock?: number;
  rentCollector?: Address | null;
  members?: [Address, number][];
}): Uint8Array {
  const members = o.members ?? [
    [A, 7],
    [B, 7],
    [C, 7],
  ];
  const parts: number[] = [...MULTISIG_DISCRIMINATOR];
  const push32 = (a: Address) => parts.push(...enc.encode(a));
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


/** ProgramData: u32 tag 3 | u64 slot | Option<Pubkey> | ELF bytes. */
export function programData(authority: Address | null): Uint8Array {
  const b = new Uint8Array(45 + 16);
  new DataView(b.buffer).setUint32(0, 3, true);
  new DataView(b.buffer).setBigUint64(4, 123n, true);
  if (authority) {
    b[12] = 1;
    b.set(getAddressEncoder().encode(authority), 13);
  }
  return b;
}

