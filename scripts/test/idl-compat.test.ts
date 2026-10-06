import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { compareIdl, type Idl } from '../idl-compat';

const struct = (name: string, fields: [string, unknown][]) => ({
  name,
  type: { kind: 'struct', fields: fields.map(([n, type]) => ({ name: n, type })) },
});

function base(): Idl {
  return {
    address: 'P',
    instructions: [
      {
        name: 'refresh',
        discriminator: [1, 2, 3, 4, 5, 6, 7, 8],
        accounts: [{ name: 'config' }, { name: 'state', writable: true }],
        args: [],
      },
      {
        name: 'register',
        discriminator: [2, 2, 3, 4, 5, 6, 7, 8],
        accounts: [{ name: 'operator', signer: true }],
        args: [
          { name: 'args', type: { defined: { name: 'RegisterArgs' } } },
          { name: 'proof', type: { vec: { array: ['u8', 32] } } },
        ],
      },
    ],
    accounts: [{ name: 'VaultState', discriminator: [9, 9, 9, 9, 9, 9, 9, 9] }],
    events: [{ name: 'Refreshed', discriminator: [7, 7, 7, 7, 7, 7, 7, 7] }],
    errors: [
      { code: 6000, name: 'Unauthorized', msg: 'no' },
      { code: 6001, name: 'Paused', msg: 'paused' },
    ],
    types: [
      struct('RegisterArgs', [
        ['id', { array: ['u8', 32] }],
        ['rent', 'u64'],
      ]),
      struct('Caps', [
        ['max_tvl', 'u64'],
        ['_reserved', { array: ['u8', 32] }],
      ]),
      struct('VaultState', [
        ['version', 'u8'],
        ['brs_balance', 'u64'],
        ['caps', { defined: { name: 'Caps' } }],
        ['owners', { array: ['pubkey', 2] }],
        ['_reserved', { array: ['u8', 256] }],
      ]),
      struct('Refreshed', [
        ['nav', 'u64'],
        ['ts', 'i64'],
      ]),
    ],
  };
}

const typeOf = (idl: Idl, name: string) => idl.types.find((t) => t.name === name)!.type.fields!;

describe('compareIdl', () => {
  test('an identical IDL is compatible', () => {
    expect(compareIdl(base(), base())).toEqual([]);
  });

  test('appending instructions, accounts, events and errors is allowed', () => {
    const next = base();
    next.instructions.push({ name: 'pause', discriminator: [3, 0, 0, 0, 0, 0, 0, 0], accounts: [], args: [] });
    next.errors.push({ code: 6002, name: 'New', msg: '' });
    next.events.push({ name: 'Paused', discriminator: [6, 6, 6, 6, 6, 6, 6, 6] });
    next.types.push(struct('Paused', [['by', 'pubkey']]));
    next.accounts.push({ name: 'Other', discriminator: [5, 5, 5, 5, 5, 5, 5, 5] });
    next.types.push(struct('Other', [['x', 'u8']]));
    expect(compareIdl(base(), next)).toEqual([]);
  });

  test('carving fields from _reserved is allowed, including in nested structs', () => {
    const next = base();
    const vs = typeOf(next, 'VaultState');
    vs.splice(4, 1, { name: 'buffer', type: 'u64' }, { name: '_reserved', type: { array: ['u8', 248] } });
    const caps = typeOf(next, 'Caps');
    caps.splice(1, 1, { name: 'new_cap', type: 'u16' }, { name: '_reserved', type: { array: ['u8', 30] } });
    expect(compareIdl(base(), next)).toEqual([]);
  });

  test('a carve that changes the size is refused', () => {
    const next = base();
    typeOf(next, 'VaultState').splice(4, 1, { name: 'buffer', type: 'u64' }, { name: '_reserved', type: { array: ['u8', 256] } });
    expect(compareIdl(base(), next).join('\n')).toContain('VaultState: size 369 -> 377');
  });

  test('reordering, retyping or removing account fields is refused', () => {
    const reorder = base();
    const f = typeOf(reorder, 'VaultState');
    [f[0], f[1]] = [f[1]!, f[0]!];
    expect(compareIdl(base(), reorder).length).toBeGreaterThan(0);

    const retype = base();
    typeOf(retype, 'VaultState')[1]!.type = 'i64';
    expect(compareIdl(base(), retype).join('\n')).toContain('VaultState.brs_balance');

    const nested = base();
    typeOf(nested, 'Caps')[0]!.type = 'i64';
    expect(compareIdl(base(), nested).join('\n')).toContain('Caps.max_tvl');
  });

  test('changing instruction args or accounts is refused', () => {
    const args = base();
    typeOf(args, 'RegisterArgs')[1]!.type = 'u32';
    expect(compareIdl(base(), args).join('\n')).toContain('register');

    const accts = base();
    accts.instructions[0]!.accounts.push({ name: 'extra' });
    expect(compareIdl(base(), accts).join('\n')).toContain('refresh: accounts changed');

    const signer = base();
    signer.instructions[1]!.accounts[0]!.signer = false;
    expect(compareIdl(base(), signer).join('\n')).toContain('register: accounts changed');

    const gone = base();
    gone.instructions.pop();
    expect(compareIdl(base(), gone).join('\n')).toContain('register: removed');
  });

  test('renumbered or removed errors are refused; message edits are fine', () => {
    const renum = base();
    renum.errors[1]!.code = 6005;
    expect(compareIdl(base(), renum).join('\n')).toContain('Paused');

    const msg = base();
    msg.errors[0]!.msg = 'clearer message';
    expect(compareIdl(base(), msg)).toEqual([]);
  });

  test('changed events are refused', () => {
    const next = base();
    typeOf(next, 'Refreshed').push({ name: 'extra', type: 'u8' });
    expect(compareIdl(base(), next).join('\n')).toContain('event Refreshed');
  });

  test('changed discriminators are refused', () => {
    const next = base();
    next.accounts[0]!.discriminator = [0, 0, 0, 0, 0, 0, 0, 0];
    expect(compareIdl(base(), next).join('\n')).toContain('discriminator');
  });
});

describe('the program IDL', () => {
  const path = `${import.meta.dir}/../../target/idl/mutav.json`;
  test.skipIf(!existsSync(path))('is compatible with itself', async () => {
    const idl = await Bun.file(path).json();
    expect(compareIdl(idl, idl)).toEqual([]);
  });
});
