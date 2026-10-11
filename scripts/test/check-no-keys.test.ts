import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REPO_ROOT } from '../devnet/lib/cli';

const script = join(REPO_ROOT, 'scripts', 'check-no-keys.sh');
const ALLOWLIST = join(REPO_ROOT, 'scripts', 'no-keys-allowlist.txt');
const run = (args: string[]) => {
  const p = Bun.spawnSync(['bash', script, ...args], { stdout: 'pipe', stderr: 'pipe', cwd: REPO_ROOT });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};

const root = mkdtempSync(join(tmpdir(), 'mutav-nokeys-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let n = 0;
/** A fresh dir holding one file. */
function fixture(line: string, file = 'bad.ts') {
  const dir = join(root, String(n++));
  mkdirSync(dir);
  writeFileSync(join(dir, file), `${line}\n`);
  return dir;
}

describe('check-no-keys.sh: one hit per pattern fails', () => {
  test.each([
    'createKeyPairSignerFromBytes(b)',
    'createKeyPairFromBytes(b)',
    'createSignerFromKeyPair(k)',
    'generateKeyPairSigner()',
    'Keypair.fromSecretKey(sk)',
    'Keypair.fromSeed(seed)',
    'const { secretKey } = k',
    'const privateKey = x',
    "crypto.subtle.sign('Ed25519', k, msg)",
    "crypto.subtle.importKey('raw', b, 'Ed25519', false, ['sign'])",
    "import nacl from 'tweetnacl'",
    'nacl.sign.detached(m, k)',
    "import { ed25519 } from '@noble/ed25519'",
    "import { ed25519 } from '@noble/curves/ed25519'",
    'await signTransactionMessageWithSigners(m)',
    'await partiallySignTransaction([k], tx)',
    'await signAndSendTransaction(tx)',
    'signBytes(k, b)',
    'await wallet.signMessage(bytes)',
    'await signer.signMessages([m])',
    'const words = mnemonic',
    'bip39.mnemonicToSeedSync(w)',
    'const seedPhrase = w',
    'process.env.OPERATOR_SECRET_KEY',
    'process.env.OPERATOR_SK',
    'process.env.DEPLOY_KEYPAIR',
    'Bun.env.ANYTHING',
    'import.meta.env.VITE_THING',
    "'~/.config/solana/id.json'",
    "'deploy-keypair.json'",
    "readFileSync('/x')",
    "await readFile('/x')",
    "await Bun.file('/x').json()",
  ])('flags %s', (line) => {
    const r = run([fixture(`export const x = ${line};`)]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('forbidden');
  });

  test.each(['bad.tsx', 'bad.mts', 'bad.cts', 'bad.jsx', 'bad.js', 'bad.mjs', 'bad.cjs'])('scans %s', (file) => {
    expect(run([fixture('export const x = Bun.env.X;', file)]).code).toBe(1);
  });

  test('a clean file passes; node_modules is not scanned', () => {
    const dir = fixture('export const x = 1;');
    mkdirSync(join(dir, 'node_modules'));
    writeFileSync(join(dir, 'node_modules', 'dep.ts'), 'Keypair.fromSecretKey(x)\n');
    expect(run([dir]).code).toBe(0);
  });
});

describe('check-no-keys.sh allowlist', () => {
  test('the repo is clean with the committed allowlist (CI scope)', () => {
    const r = run(['--allowlist', ALLOWLIST, 'clients/js/src', 'app', 'scripts']);
    expect(r.out).not.toContain('forbidden');
    expect(r.code).toBe(0);
  });

  test('without the allowlist, the known exceptions are reported', () => {
    expect(run(['scripts']).code).toBe(1);
  });

  test('a regex entry allows only the matching hits in that file', () => {
    const dir = fixture('const a = readFileSync(p);\nconst b = Keypair.fromSecretKey(x);');
    const list = join(root, `allow-${n++}.txt`);
    writeFileSync(list, `# comment\n${dir}/bad.ts readFileSync\n`);
    const r = run(['--allowlist', list, dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('fromSecretKey');
    expect(r.out).not.toContain('readFileSync(p)');
  });

  test('a glob entry allows the whole file', () => {
    const dir = fixture('const b = Keypair.fromSecretKey(x);');
    const list = join(root, `allow-${n++}.txt`);
    writeFileSync(list, `${dir}/*\n`);
    expect(run(['--allowlist', list, dir]).code).toBe(0);
  });
});
