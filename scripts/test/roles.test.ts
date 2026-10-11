import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../devnet/roles';
import { filled } from './fixtures';

describe('roles.ts cluster guard', () => {
  const run = async (url: string, confirm?: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'mutav-roles-'));
    try {
      const config = join(dir, 'deploy.json');
      const out = join(dir, 'proposal.json');
      writeFileSync(config, JSON.stringify(filled()));
      const args: Record<string, string> = { config, url, out };
      if (confirm) args['confirm-cluster'] = confirm;
      const err = await main(args).then(() => null, (e: Error) => e);
      return { err, wrote: existsSync(out) };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  test('a mainnet URL is refused before any write', async () => {
    const { err, wrote } = await run('https://api.mainnet-beta.solana.com', 'devnet');
    expect(err?.message).toContain('mainnet');
    expect(wrote).toBe(false);
  });

  test('a cluster whose genesis cannot be proven is refused before any write', async () => {
    const { err, wrote } = await run('http://127.0.0.1:1');
    expect(err?.message).toContain('genesis');
    expect(wrote).toBe(false);
  });
});
