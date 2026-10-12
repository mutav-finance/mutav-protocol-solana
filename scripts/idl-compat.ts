/**
 * IDL compatibility check (spec §14.4). Compares the IDL of a build against
 * the last released IDL and lists every change in the "No" rows:
 *
 * - an existing instruction's discriminator, args or accounts changed;
 * - an account type's discriminator or layout changed, other than fields
 *   carved from a trailing `_reserved` with the total size unchanged
 *   (recursively, for nested structs such as `Caps`);
 * - an existing event changed;
 * - an enum variant reordered, renamed, retyped or removed, wherever the
 *   enum appears (instruction args such as `ConfigParam` and `Eligibility`,
 *   account fields, event fields): Borsh encodes a variant by its index, so
 *   variants are append-only (ADR 0026);
 * - an error renumbered, renamed or removed, or a new error inserted below
 *   the last released code.
 *
 * Appending instructions, account types, events, errors and enum variants is
 * allowed (an appended variant inside account data must not change its size).
 *
 *   bun scripts/idl-compat.ts <released-idl.json> <new-idl.json>
 *
 * Exits 1 and prints the violations if any.
 */

type IdlType = string | { array: [IdlType, number] } | { defined: { name: string } } | { vec: IdlType } | { option: IdlType };
type Field = { name: string; type: IdlType; docs?: string[] };
/** Struct and variant fields are named (`{ name, type }`) or a tuple (`IdlType[]`). */
type Fields = (Field | IdlType)[];
type Variant = { name: string; fields?: Fields };
type TypeDef = { name: string; type: { kind: string; fields?: Fields; variants?: Variant[] }; docs?: string[] };
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

/**
 * A type definition, failing closed on anything this check does not model:
 * a kind other than struct or enum (e.g. a `type` alias) and generic types.
 */
function lookup(idl: Idl, name: string): TypeDef {
  const t = idl.types.find((x) => x.name === name);
  if (!t) throw new Error(`type ${name} missing from IDL`);
  if (t.type.kind !== 'struct' && t.type.kind !== 'enum') {
    throw new Error(`type ${name}: kind '${t.type.kind}' is not supported by idl-compat (struct or enum only); extend the check before using it`);
  }
  if ('generics' in t && (t as { generics?: unknown[] }).generics?.length) {
    throw new Error(`type ${name}: generic types are not supported by idl-compat; extend the check before using them`);
  }
  return t;
}

/** Refuses type forms the check does not model (`generic`, `coption`, generic `defined` refs, generic array lengths). */
function assertSupported(t: IdlType) {
  if (typeof t === 'string') return;
  const o = t as Record<string, unknown>;
  if ('generic' in o) throw new Error(`type ${JSON.stringify(t)}: generic parameters are not supported by idl-compat`);
  if ('coption' in o) throw new Error(`type ${JSON.stringify(t)}: coption is not supported by idl-compat`);
  if ('defined' in o && (o.defined as { generics?: unknown[] }).generics?.length) {
    throw new Error(`type ${JSON.stringify(t)}: generic arguments are not supported by idl-compat`);
  }
  if ('array' in o && typeof (o.array as unknown[])[1] !== 'number') {
    throw new Error(`type ${JSON.stringify(t)}: array length must be a number for idl-compat`);
  }
  if (!('array' in o) && !('vec' in o) && !('option' in o) && !('defined' in o)) {
    throw new Error(`type ${JSON.stringify(t)}: not supported by idl-compat`);
  }
}

const isNamed = (f: Field | IdlType): f is Field => typeof f === 'object' && 'name' in f && 'type' in f;
const fieldType = (f: Field | IdlType): IdlType => (isNamed(f) ? f.type : f);
const fieldsSize = (idl: Idl, fs: Fields | undefined) => (fs ?? []).reduce((n: number, f) => n + sizeOf(idl, fieldType(f)), 0);

function sizeOf(idl: Idl, t: IdlType): number {
  assertSupported(t);
  if (typeof t === 'string') {
    const s = PRIMITIVE_SIZE[t];
    if (s === undefined) throw new Error(`no fixed size for ${t}`);
    return s;
  }
  if ('array' in t) return sizeOf(idl, t.array[0]) * t.array[1];
  if ('defined' in t) {
    const d = lookup(idl, t.defined.name).type;
    // Borsh enum: a u8 variant index, then the largest variant (Anchor InitSpace).
    if (d.kind === 'enum') return 1 + Math.max(0, ...(d.variants ?? []).map((v) => fieldsSize(idl, v.fields)));
    return fieldsSize(idl, d.fields);
  }
  throw new Error(`no fixed size for ${JSON.stringify(t)}`);
}

const resolveFields = (idl: Idl, fs: Fields | undefined) =>
  (fs ?? []).map((f) => (isNamed(f) ? [f.name, resolve(idl, f.type)] : resolve(idl, f)));

/**
 * A type with every `defined` reference inlined (docs dropped), for exact
 * comparison. An enum keeps its variants in order, each with its fields.
 */
function resolve(idl: Idl, t: IdlType): unknown {
  assertSupported(t);
  if (typeof t === 'string') return t;
  if ('array' in t) return { array: [resolve(idl, t.array[0]), t.array[1]] };
  if ('vec' in t) return { vec: resolve(idl, t.vec) };
  if ('option' in t) return { option: resolve(idl, t.option) };
  if ('defined' in t) {
    const d = lookup(idl, t.defined.name).type;
    if (d.kind === 'enum') {
      return { enum: t.defined.name, variants: (d.variants ?? []).map((v) => ({ name: v.name, fields: resolveFields(idl, v.fields) })) };
    }
    return { struct: t.defined.name, fields: resolveFields(idl, d.fields) };
  }
  throw new Error(`type ${JSON.stringify(t)}: not supported by idl-compat`);
}

type ResolvedEnum = { enum: string; variants: { name: string; fields: unknown[] }[] };
const isEnum = (x: unknown): x is ResolvedEnum => typeof x === 'object' && x !== null && 'enum' in x && 'variants' in x;
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/**
 * The first incompatibility between two resolved types, or `null`. Exact
 * equality, except that an enum may gain variants at the end: the released
 * variants must be a prefix of the new ones, in order, with the same fields.
 */
function incompatibility(a: unknown, b: unknown, path: string): string | null {
  if (isEnum(a) && isEnum(b)) {
    if (a.enum !== b.enum) return `${path}: enum ${a.enum} -> ${b.enum}`;
    for (let i = 0; i < a.variants.length; i++) {
      const va = a.variants[i]!;
      const vb = b.variants[i];
      if (!vb) return `${a.enum}::${va.name}: variant ${i} removed (variants are append-only)`;
      if (va.name !== vb.name) return `${a.enum}: variant ${i} ${va.name} -> ${vb.name} (variants are append-only: never reorder, rename or remove)`;
      const d = incompatibility(va.fields, vb.fields, `${a.enum}::${va.name}`);
      if (d) return `${d} (variants are append-only: never retype)`;
    }
    return null;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    for (let i = 0; i < a.length; i++) {
      const d = incompatibility(a[i], b[i], path);
      if (d) return d;
    }
    return null;
  }
  if (isObj(a) && isObj(b) && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a);
    if (!same(ka, Object.keys(b))) return `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
    for (const k of ka) {
      const d = incompatibility(a[k], b[k], path);
      if (d) return d;
    }
    return null;
  }
  return a === b ? null : `${path}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`;
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
    const d = incompatibility(resolve(a, ta), resolve(b, tb), path);
    if (d) out.push(`${path}: type changed: ${d}`);
    return;
  }
  const struct = (idl: Idl, t: IdlType) => typeof t === 'object' && 'defined' in t && lookup(idl, t.defined.name).type.kind === 'struct';
  if (!('defined' in ta) || !('defined' in tb) || !struct(a, ta) || !struct(b, tb)) {
    // Enums (append-only variants), vecs, options. A variant appended to an
    // enum stored in account data is still refused if it grows the account
    // (the size check of the enclosing struct).
    const d = incompatibility(resolve(a, ta), resolve(b, tb), path);
    if (d) out.push(`${path}: type changed: ${d}`);
    return;
  }
  checkStruct(a, b, ta.defined.name, tb.defined.name, out);
}

function checkStruct(a: Idl, b: Idl, nameA: string, nameB: string, out: string[]) {
  const named = (idl: Idl, name: string): Field[] => {
    const fs = lookup(idl, name).type.fields ?? [];
    if (!fs.every(isNamed)) throw new Error(`${name}: account structs must have named fields`);
    return fs;
  };
  const fa = named(a, nameA);
  const fb = named(b, nameB);
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

/** Account metas, PDA seeds and fixed addresses included: changing either breaks callers. */
function accountsShape(xs: IxAccount[]): unknown[] {
  return xs.map((x) => ({
    name: x.name,
    writable: !!x.writable,
    signer: !!x.signer,
    optional: !!x.optional,
    address: x.address ?? null,
    pda: x.pda ?? null,
    accounts: Array.isArray(x.accounts) ? accountsShape(x.accounts as IxAccount[]) : null,
  }));
}

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
    const d = incompatibility(argsA, argsB, `${ix.name} args`);
    if (d) out.push(`instruction ${ix.name}: args changed (add a _v2 instruction): ${d}`);
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
    const d = incompatibility(resolve(prev, { defined: { name: ev.name } }), resolve(next, { defined: { name: n.name } }), `event ${ev.name}`);
    if (d) out.push(`event ${ev.name}: fields changed (add a new event): ${d}`);
  }

  for (const e of prev.errors) {
    const n = next.errors.find((x) => x.code === e.code);
    if (!n || n.name !== e.name) out.push(`error ${e.code} ${e.name}: renumbered, renamed or removed`);
  }
  // Append-only: a new code goes after the last released one, never into a gap.
  const last = Math.max(-Infinity, ...prev.errors.map((e) => e.code));
  for (const e of next.errors) {
    if (!prev.errors.some((x) => x.code === e.code) && e.code < last) {
      out.push(`error ${e.code} ${e.name}: inserted below the last released code ${last} (errors are append-only)`);
    }
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
