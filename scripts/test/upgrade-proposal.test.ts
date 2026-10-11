import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { address, AccountRole, getAddressEncoder, type Address } from '@solana/kit';
import { checkUpgradeSources, composeUpgrade, main, PROGRAM_DATA_HEADER, type UpgradeDeps } from '../release/upgrade-proposal';
import { parseVaultIndex, squadsVaultAddress } from '../devnet/lib/squads';
import { programDataAddress, BPF_LOADER_UPGRADEABLE } from '../devnet/lib/compose';
import { DEVNET_GENESIS } from '../devnet/lib/cluster';
import { BUFFER_HEADER, executableHash } from '../devnet/lib/hash';
import { programData } from './fixtures';

const PROGRAM: Address = address('8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9');
const BUFFER: Address = address('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');
const VAULT: Address = address('2JgjeWXmFMtYhbqFrBy4xR4yLTeRKt9Qs5MvVr9ZJmKz');

describe('composeUpgrade', () => {
  test('a .so that fits: Upgrade only, signed by the vault', async () => {
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: BUFFER, vault: VAULT, spill: VAULT, soLen: 1000, programDataLen: PROGRAM_DATA_HEADER + 1000 });
    expect(ixs).toHaveLength(1);
    const up = ixs[0]!;
    expect(up.programAddress).toBe(BPF_LOADER_UPGRADEABLE);
    expect([...up.data!]).toEqual([3, 0, 0, 0]);
    expect(up.accounts!.map((a) => a.address)).toEqual([
      await programDataAddress(PROGRAM),
      PROGRAM,
      BUFFER,
      VAULT,
      address('SysvarRent111111111111111111111111111111111'),
      address('SysvarC1ock11111111111111111111111111111111'),
      VAULT,
    ]);
    expect(up.accounts![6]!.role).toBe(AccountRole.READONLY_SIGNER);
  });

  test('a larger .so: ExtendProgramChecked first, by the missing bytes', async () => {
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: BUFFER, vault: VAULT, spill: VAULT, soLen: 1500, programDataLen: PROGRAM_DATA_HEADER + 1000 });
    expect(ixs).toHaveLength(2);
    const ext = ixs[0]!;
    expect([...ext.data!]).toEqual([9, 0, 0, 0, 0xf4, 0x01, 0, 0]); // 500 bytes
    expect(ext.accounts![2]!.address).toBe(VAULT);
    expect(ext.accounts![2]!.role).toBe(AccountRole.READONLY_SIGNER);
    expect([...ixs[1]!.data!]).toEqual([3, 0, 0, 0]);
  });
});

describe('vault index', () => {
  test.each(['abc', 'NaN', '', '-1', '256', '1.5', '0x1', ' 1', '1e2'])('rejects %p', (v) => {
    expect(() => parseVaultIndex(v)).toThrow('vault index');
  });
  test('accepts 0..255 and defaults to 0', () => {
    expect(parseVaultIndex(undefined)).toBe(0);
    expect(parseVaultIndex('0')).toBe(0);
    expect(parseVaultIndex('255')).toBe(255);
  });
  test('the vault PDA refuses an index that would wrap in a u8 seed', async () => {
    await expect(squadsVaultAddress(VAULT, 256)).rejects.toThrow('vault index');
    await expect(squadsVaultAddress(VAULT, Number.NaN)).rejects.toThrow('vault index');
  });
  test('main rejects a bad --vault-index before reading the chain', async () => {
    await expect(
      main({ url: 'http://127.0.0.1:1', program: PROGRAM, buffer: BUFFER, multisig: VAULT, 'vault-index': '300', so: '/nonexistent', out: '/nonexistent' }),
    ).rejects.toThrow('vault index');
  });
});

/** The program bytes of a fake build, with the zero padding a loader account carries. */
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 3, 0, 9]);
const HASH = executableHash(ELF);

/** A loader Buffer account: u32 tag 1 | Option<Pubkey> | program bytes (zero-padded). */
function bufferBytes(authority: Address | null, program = ELF, pad = 7): Uint8Array {
  const b = new Uint8Array(BUFFER_HEADER + program.length + pad);
  new DataView(b.buffer).setUint32(0, 1, true);
  if (authority) {
    b[4] = 1;
    b.set(getAddressEncoder().encode(authority), 5);
  }
  b.set(program, BUFFER_HEADER);
  return b;
}

describe('checkUpgradeSources', () => {
  const ok = () => ({
    buffer: { owner: BPF_LOADER_UPGRADEABLE, data: bufferBytes(VAULT) },
    programData: { owner: BPF_LOADER_UPGRADEABLE, data: programData(VAULT) },
    vault: VAULT,
    expectedHash: HASH,
  });

  test('a vault-held buffer of the verified build passes (trailing zeros trimmed)', () => {
    expect(checkUpgradeSources(ok())).toEqual([]);
  });

  test('a buffer with other bytes is refused', () => {
    const p = { ...ok(), buffer: { owner: BPF_LOADER_UPGRADEABLE, data: bufferBytes(VAULT, new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 1, 2, 4])) } };
    expect(checkUpgradeSources(p).join('\n')).toContain('buffer hash');
  });

  test('a buffer someone else can still write is refused', () => {
    const p = { ...ok(), buffer: { owner: BPF_LOADER_UPGRADEABLE, data: bufferBytes(BUFFER) } };
    expect(checkUpgradeSources(p).join('\n')).toContain(`buffer authority is ${BUFFER}`);
    const none = { ...ok(), buffer: { owner: BPF_LOADER_UPGRADEABLE, data: bufferBytes(null) } };
    expect(checkUpgradeSources(none).join('\n')).toContain('buffer authority is none');
  });

  test('a buffer not owned by the loader, missing, or not a Buffer is refused', () => {
    expect(checkUpgradeSources({ ...ok(), buffer: { owner: VAULT, data: bufferBytes(VAULT) } }).join('\n')).toContain('not BPF Loader Upgradeable');
    expect(checkUpgradeSources({ ...ok(), buffer: null })).toEqual(['buffer not found']);
    expect(checkUpgradeSources({ ...ok(), buffer: { owner: BPF_LOADER_UPGRADEABLE, data: programData(VAULT) } }).join('\n')).toContain('not a Buffer');
  });

  test('ProgramData whose upgrade authority is not the vault is refused', () => {
    const other = { ...ok(), programData: { owner: BPF_LOADER_UPGRADEABLE, data: programData(BUFFER) } };
    expect(checkUpgradeSources(other).join('\n')).toContain('ProgramData upgrade authority');
    const frozen = { ...ok(), programData: { owner: BPF_LOADER_UPGRADEABLE, data: programData(null) } };
    expect(checkUpgradeSources(frozen).join('\n')).toContain('immutable');
    expect(checkUpgradeSources({ ...ok(), programData: null })).toEqual(['ProgramData not found']);
  });
});

describe('upgrade-proposal main', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mutav-upgrade-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const so = join(dir, 'mutav.so');
  writeFileSync(so, ELF);
  const out = join(dir, 'proposal.json');

  async function run(o: { buffer?: Uint8Array; hash?: string | null } = {}) {
    const vault = await squadsVaultAddress(VAULT, 0);
    const pd = await programDataAddress(PROGRAM);
    const reads: Address[] = [];
    const deps: UpgradeDeps = {
      genesis: { genesisHash: async () => DEVNET_GENESIS },
      account: async (_url, a) => {
        reads.push(a);
        if (a === pd) return { owner: BPF_LOADER_UPGRADEABLE, data: programData(vault) };
        if (a === BUFFER) return { owner: BPF_LOADER_UPGRADEABLE, data: o.buffer ?? bufferBytes(vault) };
        return null;
      },
    };
    const args: Record<string, string> = { url: 'http://127.0.0.1:8899', program: PROGRAM, buffer: BUFFER, multisig: VAULT, so, out };
    if (o.hash !== null) args['expected-hash'] = o.hash ?? HASH.toUpperCase();
    await main(args, deps);
    return reads;
  }

  test('requires --expected-hash before reading the chain', async () => {
    await expect(run({ hash: null })).rejects.toThrow('--expected-hash');
    await expect(run({ hash: 'abc' })).rejects.toThrow('--expected-hash');
  });

  test('refuses a buffer that does not match, and writes nothing', async () => {
    rmSync(out, { force: true });
    await expect(run({ buffer: bufferBytes(VAULT) })).rejects.toThrow('buffer authority');
    expect(() => readFileSync(out)).toThrow();
  });

  test('writes the proposal when buffer and ProgramData check out', async () => {
    await run();
    const p = JSON.parse(readFileSync(out, 'utf8'));
    expect(p.title).toContain(HASH);
    expect(p.instructions).toHaveLength(1);
  });
});
