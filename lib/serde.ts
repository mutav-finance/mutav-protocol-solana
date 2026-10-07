/**
 * JSON transport for on-chain data. Account fields are `bigint` (u64/i64) and
 * byte arrays ([u8; 32] ids and hashes); plain JSON can carry neither, so they
 * travel tagged and are revived on the other side. Values are never converted
 * to `number`, so nothing on screen loses precision in transit.
 */

type Tagged = { $big: string } | { $bytes: string };

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) throw new Error(`not hex: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export const bytesToHex = toHex;

function replacer(this: unknown, _key: string, value: unknown): unknown {
  if (typeof value === "bigint") return { $big: value.toString() } satisfies Tagged;
  if (value instanceof Uint8Array) return { $bytes: toHex(value) } satisfies Tagged;
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && typeof o.$big === "string") return BigInt(o.$big);
    if (keys.length === 1 && typeof o.$bytes === "string") return fromHex(o.$bytes);
  }
  return value;
}

export const encode = (value: unknown): string => JSON.stringify(value, replacer);
export const decode = <T>(text: string): T => JSON.parse(text, reviver) as T;

/** A JSON `Response` that carries bigints and bytes. */
export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  return new Response(encode(value), {
    ...init,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...(init.headers ?? {}) },
  });
}
