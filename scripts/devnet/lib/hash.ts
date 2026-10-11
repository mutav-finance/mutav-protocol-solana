/**
 * Executable hashes as `solana-verify` computes them: sha256 (hex) of the
 * program bytes with trailing zero bytes trimmed.
 *
 * - `solana-verify get-executable-hash <so>`: the `.so` file;
 * - `solana-verify get-program-hash <id>`: ProgramData after its 45-byte header;
 * - `solana-verify get-buffer-hash <buffer>`: a buffer after its 37-byte header.
 *
 * All three agree for the same build, so one `--expected-hash` ties a `.so`,
 * a buffer and a deployed program to the verified build.
 */
import { createHash } from 'node:crypto';
import { address, getAddressDecoder, type Address } from '@solana/kit';

export const BPF_LOADER_UPGRADEABLE_ID = address('BPFLoaderUpgradeab1e11111111111111111111111');
/** ProgramData header: u32 tag (3) | u64 slot | Option<Pubkey> (1 + 32). */
export const PROGRAM_DATA_HEADER = 45;
/** Buffer header: u32 tag (1) | Option<Pubkey> (1 + 32). */
export const BUFFER_HEADER = 37;

/** sha256 hex of `bytes` with trailing zeros trimmed (solana-verify `get_binary_hash`). */
export function executableHash(bytes: Uint8Array): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  return createHash('sha256').update(bytes.subarray(0, end)).digest('hex');
}

/** A `--expected-hash` value: 64 hex characters, compared lowercase. */
export function parseExpectedHash(v: string | undefined): string {
  const h = v?.trim().toLowerCase();
  if (!h || !/^[0-9a-f]{64}$/.test(h)) {
    throw new Error('--expected-hash must be the 64-hex sha256 from `solana-verify get-executable-hash target/deploy/mutav.so`');
  }
  return h;
}

const tag = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0, true);

function optionalAddress(data: Uint8Array, at: number, what: string): Address | null {
  const t = data[at];
  if (t === 0) return null;
  if (t !== 1) throw new Error(`bad Option tag in ${what}`);
  return getAddressDecoder().decode(data.subarray(at + 1, at + 33));
}

/** Authority of a loader `Buffer` account (`null`: none, so it can no longer be written). */
export function bufferAuthority(data: Uint8Array): Address | null {
  if (data.length < BUFFER_HEADER || tag(data) !== 1) throw new Error('not a Buffer account');
  return optionalAddress(data, 4, 'Buffer');
}

/** Hash of the program bytes held by a loader `Buffer` account. */
export function bufferHash(data: Uint8Array): string {
  if (data.length < BUFFER_HEADER || tag(data) !== 1) throw new Error('not a Buffer account');
  return executableHash(data.subarray(BUFFER_HEADER));
}

/** Hash of the program bytes held by a `ProgramData` account. */
export function programDataHash(data: Uint8Array): string {
  if (data.length < PROGRAM_DATA_HEADER || tag(data) !== 3) throw new Error('not a ProgramData account');
  return executableHash(data.subarray(PROGRAM_DATA_HEADER));
}
