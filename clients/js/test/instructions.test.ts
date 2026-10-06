import { describe, expect, test } from 'bun:test';
import { AccountRole, address, createNoopSigner } from '@solana/kit';
import * as client from '../src';
import { findReserveAddresses, getSetRolesInstruction, MUTAV_PROGRAM_ADDRESS } from '../src';
import { hex, unhex, vectors } from './vectors';

/** Decoded instruction data in the vectors' JSON form. */
function normalize(v: unknown): unknown {
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof Uint8Array) return hex(v);
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([k]) => k !== 'discriminator')
        .map(([k, x]) => [k, normalize(x)]),
    );
  }
  return v;
}

const codec = (name: string) => {
  const key = `get${name[0]!.toUpperCase()}${name.slice(1)}InstructionDataCodec`;
  const f = (client as Record<string, unknown>)[key];
  if (typeof f !== 'function') throw new Error(`no ${key}`);
  return f() as { encode(x: unknown): Uint8Array; decode(b: Uint8Array): unknown };
};

describe('instruction data matches the program encoding', () => {
  test.each(vectors.instructions.map((v: any) => [v.name, v]))('%s round-trips', (name, v: any) => {
    const c = codec(name as string);
    const bytes = unhex(v.data);
    const decoded = c.decode(bytes);
    // Codama flattens a single struct argument named `args` into the data.
    const expected = v.args.args && !('args' in (decoded as object)) ? v.args.args : v.args;
    expect(normalize(decoded)).toEqual(expected);
    expect(hex(c.encode(decoded))).toBe(v.data);
  });

  test('every instruction is identified by its discriminator', () => {
    for (const v of vectors.instructions) {
      const kind = client.identifyMutavInstruction({ data: unhex(v.data) });
      expect(client.MutavInstruction[kind]).toBe(v.name[0].toUpperCase() + v.name.slice(1));
    }
  });
});

describe('instruction builders compose without signing', () => {
  test('setRoles: admin is a signer, accounts resolved, data encoded', async () => {
    const mint = address(vectors.pdas.inputs.reserveMint);
    const { config, eventAuthority } = await findReserveAddresses(mint);
    const admin = createNoopSigner(address('11111111111111111111111111111112'));
    const v = vectors.instructions.find((x: any) => x.name === 'setRoles');
    const ix = getSetRolesInstruction({
      admin,
      config,
      eventAuthority,
      program: MUTAV_PROGRAM_ADDRESS,
      operator: address(v.args.operator),
      pauser: address(v.args.pauser),
    });
    expect(ix.programAddress).toBe(MUTAV_PROGRAM_ADDRESS);
    expect(hex(ix.data)).toBe(v.data);
    expect(ix.accounts[0]!.address).toBe(admin.address);
    expect(ix.accounts[0]!.role).toBe(AccountRole.READONLY_SIGNER);
    expect(ix.accounts[1]!.address).toBe(config);
  });
});
