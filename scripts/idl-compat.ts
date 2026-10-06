/**
 * IDL compatibility check (spec §14.4). Compares the IDL of a build against
 * the last released IDL and lists every change in the "No" rows:
 *
 * - an existing instruction's discriminator, args or accounts changed;
 * - an account type's discriminator or layout changed, other than fields
 *   carved from a trailing `_reserved` with the total size unchanged
 *   (recursively, for nested structs such as `Caps`);
 * - an existing event changed;
 * - an error renumbered, renamed or removed.
 *
 * Appending instructions, account types, events and errors is allowed.
 *
 *   bun scripts/idl-compat.ts <released-idl.json> <new-idl.json>
 *
 * Exits 1 and prints the violations if any.
 */

type IdlType = string | { array: [IdlType, number] } | { defined: { name: string } } | { vec: IdlType } | { option: IdlType };
type Field = { name: string; type: IdlType; docs?: string[] };
type TypeDef = { name: string; type: { kind: string; fields?: Field[] }; docs?: string[] };
type IxAccount = { name: string; writable?: boolean; signer?: boolean; optional?: boolean; [k: string]: unknown };

export type Idl = {
  address: string;
  instructions: { name: string; discriminator: number[]; accounts: IxAccount[]; args: Field[]; docs?: string[] }[];
  accounts: { name: string; discriminator: number[] }[];
  events: { name: string; discriminator: number[] }[];
  errors: { code: number; name: string; msg?: string }[];
  types: TypeDef[];
};

const PRIMITIVE_SIZE: Record<string, number> = {
  bool: 1, u8: 1, i8: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4,
  u64: 8, i64: 8, f64: 8, u128: 16, i128: 16, pubkey: 32,
};

const isReserved = (f: Field | undefined) => !!f && f.name.startsWith('_reserved');

function lookup(idl: Idl, name: string): TypeDef {
  const t = idl.types.find((x) => x.name === name);
  if (!t) throw new Error(`type ${name} missing from IDL`);
  return t;
}

function sizeOf(idl: Idl, t: IdlType): number {
  if (typeof t === 'string') {
    const s = PRIMITIVE_SIZE[t];
    if (s === undefined) throw new Error(`no fixed size for ${t}`);
    return s;
  }
  if ('array' in t) return sizeOf(idl, t.array[0]) * t.array[1];
  if ('defined' in t) {
    const fields = lookup(idl, t.defined.name).type.fields ?? [];
    return fields.reduce((n, f) => n + sizeOf(idl, f.type), 0);
  }
  throw new Error(`no fixed size for ${JSON.stringify(t)}`);
}

/** A type with every `defined` reference inlined (docs dropped), for exact comparison. */
function resolve(idl: Idl, t: IdlType): unknown {
  if (typeof t === 'string') return t;
  if ('array' in t) return { array: [resolve(idl, t.array[0]), t.array[1]] };
  if ('vec' in t) return { vec: resolve(idl, t.vec) };
  if ('option' in t) return { option: resolve(idl, t.option) };
  if ('defined' in t) {
    const d = lookup(idl, t.defined.name).type;
    return { [d.kind]: t.defined.name, fields: (d.fields ?? []).map((f) => [f.name, resolve(idl, f.type)]) };
  }
  return t;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Layout rule for account data: same prefix and size; new fields only from a trailing `_reserved`. */
function checkLayout(a: Idl, b: Idl, path: string, ta: IdlType, tb: IdlType, out: string[]) {
  if (typeof ta === 'string' || typeof tb === 'string' || 'array' in ta || 'array' in tb) {
    if (typeof ta === 'object' && typeof tb === 'object' && 'array' in ta && 'array' in tb) {
      if (ta.array[1] !== tb.array[1]) out.push(`${path}: array length ${ta.array[1]} -> ${tb.array[1]}`);
      else checkLayout(a, b, `${path}[]`, ta.array[0], tb.array[0], out);
      return;
    }
    if (!same(resolve(a, ta), resolve(b, tb))) out.push(`${path}: type ${JSON.stringify(ta)} -> ${JSON.stringify(tb)}`);
    return;
  }
  if (!('defined' in ta) || !('defined' in tb)) {
    if (!same(resolve(a, ta), resolve(b, tb))) out.push(`${path}: type changed`);
    return;
  }
  checkStruct(a, b, ta.defined.name, tb.defined.name, out);
}

function checkStruct(a: Idl, b: Idl, nameA: string, nameB: string, out: string[]) {
  const fa = lookup(a, nameA).type.fields ?? [];
  const fb = lookup(b, nameB).type.fields ?? [];
  const sa = sizeOf(a, { defined: { name: nameA } });
  const sb = sizeOf(b, { defined: { name: nameB } });
  if (sa !== sb) out.push(`${nameA}: size ${sa} -> ${sb}`);
  const carves = isReserved(fa[fa.length - 1]);
  const kept = carves ? fa.slice(0, -1) : fa;
  kept.forEach((f, i) => {
    const g = fb[i];
    if (!g || g.name !== f.name) {
      out.push(`${nameA}.${f.name}: moved, renamed or removed`);
      return;
    }
    checkLayout(a, b, `${nameA}.${f.name}`, f.type, g.type, out);
  });
  if (carves) {
    if (!isReserved(fb[fb.length - 1])) out.push(`${nameA}: trailing _reserved removed`);
  } else if (fb.length !== fa.length) {
    out.push(`${nameA}: fields added without a _reserved carve`);
  }
}

const accountsShape = (xs: IxAccount[]) =>
  xs.map((x) => ({ name: x.name, writable: !!x.writable, signer: !!x.signer, optional: !!x.optional }));

export function compareIdl(prev: Idl, next: Idl): string[] {
  const out: string[] = [];
  if (prev.address !== next.address) out.push(`program address ${prev.address} -> ${next.address}`);

  for (const ix of prev.instructions) {
    const n = next.instructions.find((x) => x.name === ix.name);
    if (!n) {
      out.push(`instruction ${ix.name}: removed`);
      continue;
    }
    if (!same(ix.discriminator, n.discriminator)) out.push(`instruction ${ix.name}: discriminator changed`);
    const argsA = ix.args.map((f) => [f.name, resolve(prev, f.type)]);
    const argsB = n.args.map((f) => [f.name, resolve(next, f.type)]);
    if (!same(argsA, argsB)) out.push(`instruction ${ix.name}: args changed (add a _v2 instruction)`);
    if (!same(accountsShape(ix.accounts), accountsShape(n.accounts))) {
      out.push(`instruction ${ix.name}: accounts changed (add a _v2 instruction)`);
    }
  }

  for (const acc of prev.accounts) {
    const n = next.accounts.find((x) => x.name === acc.name);
    if (!n) {
      out.push(`account ${acc.name}: removed`);
      continue;
    }
    if (!same(acc.discriminator, n.discriminator)) out.push(`account ${acc.name}: discriminator changed`);
    checkStruct(prev, next, acc.name, n.name, out);
  }

  for (const ev of prev.events) {
    const n = next.events.find((x) => x.name === ev.name);
    if (!n) {
      out.push(`event ${ev.name}: removed`);
      continue;
    }
    if (!same(ev.discriminator, n.discriminator)) out.push(`event ${ev.name}: discriminator changed`);
    if (!same(resolve(prev, { defined: { name: ev.name } }), resolve(next, { defined: { name: n.name } }))) {
      out.push(`event ${ev.name}: fields changed (add a new event)`);
    }
  }

  for (const e of prev.errors) {
    const n = next.errors.find((x) => x.code === e.code);
    if (!n || n.name !== e.name) out.push(`error ${e.code} ${e.name}: renumbered, renamed or removed`);
  }
  return out;
}

if (import.meta.main) {
  const [prevPath, nextPath] = process.argv.slice(2);
  if (!prevPath || !nextPath) {
    console.error('usage: bun scripts/idl-compat.ts <released-idl.json> <new-idl.json>');
    process.exit(2);
  }
  const violations = compareIdl(await Bun.file(prevPath).json(), await Bun.file(nextPath).json());
  if (violations.length) {
    for (const v of violations) console.error(`::error::idl-compat: ${v}`);
    process.exit(1);
  }
  console.log('idl-compat: no incompatible change');
}
