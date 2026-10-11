import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { compareIdl, type Idl } from '../idl-compat';

const struct = (name: string, fields: [string, any][]) => ({
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

const typeOf = (idl: Idl, name: string) => idl.types.find((t) => t.name === name)!.type.fields as { name: string; type: any }[];

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

// Enum fixtures (ADR 0026: variants are append-only).
const enumDef = (name: string, variants: { name: string; fields?: any[] }[]) => ({ name, type: { kind: 'enum', variants } });
const variants = (idl: Idl, name: string) => idl.types.find((t) => t.name === name)!.type.variants!;

function withEnums(): Idl {
  const idl = base();
  idl.instructions.push(
    {
      name: 'set_config',
      discriminator: [4, 0, 0, 0, 0, 0, 0, 0],
      accounts: [{ name: 'admin', signer: true }],
      args: [{ name: 'params', type: { vec: { defined: { name: 'ConfigParam' } } } }],
    },
    {
      name: 'request_deposit',
      discriminator: [5, 0, 0, 0, 0, 0, 0, 0],
      accounts: [{ name: 'owner', signer: true }],
      args: [
        { name: 'amount', type: 'u64' },
        { name: 'eligibility', type: { defined: { name: 'Eligibility' } } },
      ],
    },
  );
  idl.accounts.push({ name: 'Guarantee', discriminator: [8, 8, 8, 8, 8, 8, 8, 8] });
  idl.events.push({ name: 'Returned', discriminator: [6, 0, 0, 0, 0, 0, 0, 0] });
  idl.types.push(
    // Tuple variants, like ConfigParam.
    enumDef('ConfigParam', [
      { name: 'CoverageRatioBps', fields: ['u16'] },
      { name: 'FeeTakeBps', fields: ['u16'] },
      { name: 'MaxTvl', fields: ['u64'] },
    ]),
    // A named-field variant, like Eligibility.
    enumDef('Eligibility', [{ name: 'Merkle', fields: [{ name: 'proof', type: { vec: { array: ['u8', 32] } } }] }]),
    enumDef('Status', [{ name: 'Active' }, { name: 'Closed' }]),
    enumDef('Source', [{ name: 'Unsolicited' }, { name: 'Foreign' }]),
    struct('Guarantee', [
      ['status', { defined: { name: 'Status' } }],
      ['amount', 'u64'],
      ['_reserved', { array: ['u8', 16] }],
    ]),
    struct('Returned', [
      ['source', { defined: { name: 'Source' } }],
      ['amount', 'u64'],
    ]),
  );
  return idl;
}

describe('compareIdl: enums are append-only', () => {
  test('an identical IDL with enums is compatible', () => {
    expect(compareIdl(withEnums(), withEnums())).toEqual([]);
  });

  test('appending variants passes (instruction, account and event enums)', () => {
    const next = withEnums();
    variants(next, 'ConfigParam').push({ name: 'MaxRequest', fields: ['u64'] });
    variants(next, 'Eligibility').push({ name: 'Open' });
    variants(next, 'Status').push({ name: 'Defaulted' });
    variants(next, 'Source').push({ name: 'Lamports' });
    expect(compareIdl(withEnums(), next)).toEqual([]);
  });

  test('reordering instruction-arg variants fails', () => {
    const next = withEnums();
    const v = variants(next, 'ConfigParam');
    [v[0], v[1]] = [v[1]!, v[0]!];
    const out = compareIdl(withEnums(), next).join('\n');
    expect(out).toContain('instruction set_config: args changed');
    expect(out).toContain('ConfigParam: variant 0 CoverageRatioBps -> FeeTakeBps');
  });

  test('retyping a tuple variant fails', () => {
    const next = withEnums();
    variants(next, 'ConfigParam')[2]!.fields = ['u32'];
    expect(compareIdl(withEnums(), next).join('\n')).toContain('ConfigParam::MaxTvl');
  });

  test('retyping a named-field variant fails', () => {
    const next = withEnums();
    variants(next, 'Eligibility')[0]!.fields = [{ name: 'proof', type: { vec: { array: ['u8', 20] } } }];
    expect(compareIdl(withEnums(), next).join('\n')).toContain('instruction request_deposit: args changed');
  });

  test('removing a variant fails, even the last one', () => {
    const next = withEnums();
    variants(next, 'ConfigParam').pop();
    expect(compareIdl(withEnums(), next).join('\n')).toContain('ConfigParam::MaxTvl: variant 2 removed');
  });

  test('renaming a variant fails', () => {
    const next = withEnums();
    variants(next, 'ConfigParam')[1]!.name = 'FeeBps';
    expect(compareIdl(withEnums(), next).join('\n')).toContain('variant 1 FeeTakeBps -> FeeBps');
  });

  test('inserting a variant before the end fails', () => {
    const next = withEnums();
    variants(next, 'ConfigParam').splice(1, 0, { name: 'FeatureFlags', fields: ['u64'] });
    expect(compareIdl(withEnums(), next).length).toBeGreaterThan(0);
  });

  test('account enums: reorder fails; a variant that grows the account fails', () => {
    const reorder = withEnums();
    const v = variants(reorder, 'Status');
    [v[0], v[1]] = [v[1]!, v[0]!];
    expect(compareIdl(withEnums(), reorder).join('\n')).toContain('Guarantee.status');

    const grow = withEnums();
    variants(grow, 'Status').push({ name: 'Paid', fields: ['u64'] });
    expect(compareIdl(withEnums(), grow).join('\n')).toContain('Guarantee: size');
  });

  test('event enums: reorder and removal fail', () => {
    const reorder = withEnums();
    const v = variants(reorder, 'Source');
    [v[0], v[1]] = [v[1]!, v[0]!];
    expect(compareIdl(withEnums(), reorder).join('\n')).toContain('event Returned');

    const removed = withEnums();
    variants(removed, 'Source').pop();
    expect(compareIdl(withEnums(), removed).join('\n')).toContain('event Returned');
  });
});

describe('compareIdl: errors are append-only', () => {
  test('a new error inserted into a gap below the last code fails', () => {
    const prev = base();
    prev.errors.push({ code: 6005, name: 'Later', msg: '' });
    const next = base();
    next.errors.push({ code: 6003, name: 'Inserted', msg: '' }, { code: 6005, name: 'Later', msg: '' });
    expect(compareIdl(prev, next).join('\n')).toContain('error 6003 Inserted: inserted below the last released code 6005');
  });
});

describe('the program IDL', () => {
  const path = `${import.meta.dir}/../../target/idl/mutav.json`;
  test.skipIf(!existsSync(path))('is compatible with itself', async () => {
    const idl = await Bun.file(path).json();
    expect(compareIdl(idl, idl)).toEqual([]);
  });
  test.skipIf(!existsSync(path))('refuses a reordered or removed enum variant', async () => {
    const idl: Idl = await Bun.file(path).json();
    const e = idl.types.find((t) => t.type.kind === 'enum' && (t.type.variants?.length ?? 0) > 1);
    if (!e) return;
    const next: Idl = structuredClone(idl);
    next.types.find((t) => t.name === e.name)!.type.variants!.reverse();
    expect(compareIdl(idl, next).length).toBeGreaterThan(0);
    const removed: Idl = structuredClone(idl);
    removed.types.find((t) => t.name === e.name)!.type.variants!.pop();
    expect(compareIdl(idl, removed).length).toBeGreaterThan(0);
  });
});
