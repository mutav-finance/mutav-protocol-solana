import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEVNET_GENESIS, MAINNET_GENESIS } from '../devnet/lib/cluster';
import { exportGuardedRpc } from '../release/guard-rpc';

const stub = (hash: string) => ({ genesisHash: async () => hash });

describe('release RPC guard', () => {
  test('exports the normalised devnet href to the next steps, masked', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mutav-guard-'));
    try {
      const envFile = join(dir, 'env');
      writeFileSync(envFile, '');
      const lines = await exportGuardedRpc('https://API.devnet.solana.com', 'devnet', envFile, stub(DEVNET_GENESIS));
      expect(readFileSync(envFile, 'utf8')).toBe('RELEASE_RPC=https://api.devnet.solana.com/\n');
      expect(lines).toEqual(['::add-mask::https://api.devnet.solana.com/', 'cluster guard: devnet']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each([
    ['m', DEVNET_GENESIS],
    ['', DEVNET_GENESIS],
    ['https://mutav.rpcpool.com/abc', MAINNET_GENESIS],
  ])('refuses %p and writes nothing', async (url, hash) => {
    const dir = mkdtempSync(join(tmpdir(), 'mutav-guard-'));
    try {
      const envFile = join(dir, 'env');
      writeFileSync(envFile, '');
      await expect(exportGuardedRpc(url, 'devnet', envFile, stub(hash))).rejects.toThrow();
      expect(readFileSync(envFile, 'utf8')).toBe('');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a local URL is refused for a release', async () => {
    await expect(exportGuardedRpc('http://127.0.0.1:8899', 'devnet', undefined, stub('Local111111111111111111111111111111111111111'))).rejects.toThrow('local');
  });
});
