import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, '..', '..', '..', 'scripts', 'check-no-keys.sh');
const run = (dir: string) => Bun.spawnSync(['bash', script, dir], { stdout: 'pipe', stderr: 'pipe' });

describe('check-no-keys.sh', () => {
  test('the client source is clean', () => {
    const r = run(join(import.meta.dir, '..', 'src'));
    expect(r.stderr.toString() + r.stdout.toString()).not.toContain('forbidden');
    expect(r.exitCode).toBe(0);
  });

  test.each([
    'createKeyPairSignerFromBytes(bytes)',
    'createKeyPairSignerFromPrivateKeyBytes(b)',
    'createKeyPairFromBytes(b)',
    'Keypair.fromSecretKey(sk)',
    'Keypair.fromSeed(seed)',
    'await signTransactionMessageWithSigners(m)',
    'await partiallySignTransaction([k], tx)',
    'await signTransaction([k], tx)',
    'const k = await generateKeyPairSigner()',
    'const s = process.env.OPERATOR_SECRET_KEY',
    'const m = process.env["MNEMONIC"]',
    'bip39.mnemonicToSeedSync(words)',
    "readFileSync('/home/me/.config/solana/id.json')",
  ])('flags %s', (line) => {
    const dir = mkdtempSync(join(tmpdir(), 'mutav-nokeys-'));
    try {
      writeFileSync(join(dir, 'bad.ts'), `export const x = ${line};\n`);
      const r = run(dir);
      expect(r.exitCode).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
