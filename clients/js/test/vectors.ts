// Loads the vectors the program exports (tests/tests/client_vectors.rs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const path = join(import.meta.dir, '..', '..', '..', 'tests', 'fixtures', 'client', 'vectors.json');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const vectors: any = JSON.parse(readFileSync(path, 'utf8'));

export const hex = (b: ArrayLike<number>): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

export const unhex = (h: string): Uint8Array =>
  Uint8Array.from(h.match(/../g) ?? [], (x) => parseInt(x, 16));

/** `"error"` when `f` throws a `MathOverflowError`, else its result as a string. */
export function outcome(f: () => bigint): string {
  try {
    return f().toString();
  } catch (e) {
    if ((e as Error).name === 'MathOverflowError') return 'error';
    throw e;
  }
}
