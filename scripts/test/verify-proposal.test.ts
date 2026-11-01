import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountRole, address, createNoopSigner, getAddressEncoder, type Address, type Instruction } from '@solana/kit';
import { getSetConfigInstruction } from '../../clients/js/src';
import { BPF_LOADER_UPGRADEABLE, programDataAddress, SYSTEM_PROGRAM } from '../devnet/lib/compose';
import { DEVNET_GENESIS, MAINNET_GENESIS } from '../devnet/lib/cluster';
import { BUFFER_HEADER, executableHash } from '../devnet/lib/hash';
import { squadsVaultAddress, SQUADS_V4_PROGRAM } from '../devnet/lib/squads';
import { sha256Hex, type DecodedInstruction } from '../release/lib/decode';
import { compareVault, intentPath, parseIntent } from '../release/lib/intent';
import { squadsProposalAddress, squadsTransactionAddress, type ConfigAction, type VaultTransactionMessage } from '../release/lib/squads-tx';
import type { Account } from '../release/lib/upgrade-check';
import { containsBytes } from '../release/lib/upgrade-check';
import { composeUpgrade } from '../release/upgrade-proposal';
import { main, parseIndex, type VerifyDeps } from '../release/verify-proposal';
import { multisigBytes, programData, testAddress } from './fixtures';
import { compileMessage, configTransactionBytes, proposalBytes, vaultTransactionBytes } from './squads-tx-fixtures';

const EXAMPLES = join(import.meta.dir, '..', '..', 'governance', 'intents', 'examples');
const example = (f: string) => JSON.parse(readFileSync(join(EXAMPLES, f), 'utf8'));
const MS = address('5842jNQd5C7pWXFxcDu3kQ5XtgqH5st25tf2ZBjYaKg8'); // testAddress(60), the examples' multisig
const MEMBER = testAddress(0); // fixtures A, a member of multisigBytes()
const le = (v: bigint | number, n: number) => Array.from({ length: n }, (_, i) => Number((BigInt(v) >> BigInt(8 * i)) & 0xffn));

/** The example's set_config, built with the Codama client from the example's own accounts. */
async function exampleSetConfig(over: { config?: Address; maxTvl?: bigint } = {}): Promise<Instruction> {
  const a = example('set-config-max-tvl.json').transaction.instructions[0].accounts;
  return getSetConfigInstruction({
    admin: createNoopSigner(await squadsVaultAddress(MS, 0)),
    config: over.config ?? a.config,
    state: a.state,
    treasuryAccount: a.treasuryAccount,
    paymentsAccount: a.paymentsAccount,
    eventAuthority: a.eventAuthority,
    program: a.program,
    params: [{ __kind: 'MaxTvl', fields: [over.maxTvl ?? 5_000_000_000n] }],
  });
}

async function transfer(lamports = 1n): Promise<Instruction> {
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: await squadsVaultAddress(MS, 0), role: AccountRole.WRITABLE_SIGNER },
      { address: testAddress(70), role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array([...le(2, 4), ...le(lamports, 8)]),
  };
}

type Chain = {
  index?: bigint;
  multisig?: Uint8Array;
  tx?: Uint8Array | null;
  proposal?: Uint8Array | null;
  extra?: [Address, Account][];
  genesis?: string;
};

/** Runs the CLI against an in-memory chain; returns the exit code and the printed report. */
async function run(intent: unknown, chain: Chain, args: Record<string, string> = {}, so?: Uint8Array) {
  const index = chain.index ?? 5n;
  const reads = new Map<string, Account>();
  reads.set(MS, { owner: SQUADS_V4_PROGRAM, data: chain.multisig ?? multisigBytes({ timeLock: 600 }) });
  if (chain.tx) reads.set(await squadsTransactionAddress(MS, index), { owner: SQUADS_V4_PROGRAM, data: chain.tx });
  const proposal = chain.proposal === undefined ? proposalBytes({ multisig: MS, index, approved: [] }) : chain.proposal;
  if (proposal) reads.set(await squadsProposalAddress(MS, index), { owner: SQUADS_V4_PROGRAM, data: proposal });
  for (const [k, v] of chain.extra ?? []) reads.set(k, v);
  const out: string[] = [];
  const files: Record<string, Uint8Array> = { 'intent.json': new TextEncoder().encode(JSON.stringify(intent)) };
  if (so) files['mutav.so'] = so;
  const deps: VerifyDeps = {
    genesis: { genesisHash: async () => chain.genesis ?? 'LocalGenesis11111111111111111111111111111111' },
    account: async (_url, a) => reads.get(a) ?? null,
    readLocal: (p) => {
      const f = files[p];
      if (!f) throw new Error(`ENOENT ${p}`);
      return f;
    },
    print: (l) => out.push(l),
  };
  const code = await main({ cluster: 'localnet', rpc: 'http://127.0.0.1:8899', multisig: MS, index: String(index), intent: 'intent.json', ...(so ? { so: 'mutav.so' } : {}), ...args }, deps);
  return { code, out: out.join('\n') };
}

const vaultTx = async (ixs: Instruction[], o: { index?: bigint; message?: VaultTransactionMessage; ephemeral?: number[] } = {}) =>
  vaultTransactionBytes({ multisig: MS, creator: MEMBER, index: o.index ?? 5n, ephemeralSignerBumps: o.ephemeral, message: o.message ?? compileMessage(await squadsVaultAddress(MS, 0), ixs) });

describe('vault transactions', () => {
  test('the example intent MATCHes its transaction: exit 0, digest printed', async () => {
    const tx = await vaultTx([await exampleSetConfig()]);
    const r = await run(example('set-config-max-tvl.json'), { tx });
    expect(r.out).toContain('MATCH: the on-chain transaction is exactly the intent');
    expect(r.out).toContain(`hex ${sha256Hex(tx)}`);
    expect(r.out).toContain('mutav.set_config');
    expect(r.out).toContain('arg params = [{"__kind":"MaxTvl","fields":["5000000000"]}]');
    expect(r.out).toContain('Never sign a member transaction');
    expect(r.code).toBe(0);
  });

  test('an extra instruction is a MISMATCH', async () => {
    const r = await run(example('set-config-max-tvl.json'), { tx: await vaultTx([await exampleSetConfig(), await transfer()]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('instruction #1: unexpected extra system.Transfer');
  });

  test('a changed arg is a MISMATCH naming the field', async () => {
    const r = await run(example('set-config-max-tvl.json'), { tx: await vaultTx([await exampleSetConfig({ maxTvl: 6_000_000_000n })]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('instruction #0 arg params[0].fields[0]: expected "5000000000", got "6000000000"');
  });

  test('a changed account is a MISMATCH', async () => {
    const r = await run(example('set-config-max-tvl.json'), { tx: await vaultTx([await exampleSetConfig({ config: testAddress(90) })]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`instruction #0 account config: expected 5ByKsfsdfVR3ecWU3XDy3GrJ8r3UkwZqeJKgcZn9Kezq, got ${testAddress(90)}`);
  });

  test('reordered instructions are a MISMATCH, and say so', async () => {
    const intent = example('set-config-max-tvl.json');
    intent.transaction.instructions.push({ program: 'system', name: 'Transfer', args: { lamports: 1 }, accounts: { from: '$vault', to: testAddress(70) } });
    expect((await run(intent, { tx: await vaultTx([await exampleSetConfig(), await transfer()]) })).code).toBe(0);
    const r = await run(intent, { tx: await vaultTx([await transfer(), await exampleSetConfig()]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('in a different order');
  });

  test('a missing instruction is a MISMATCH', async () => {
    const intent = example('set-config-max-tvl.json');
    intent.transaction.instructions.push({ program: 'system', name: 'Transfer', args: { lamports: 1 }, accounts: { from: '$vault', to: testAddress(70) } });
    const r = await run(intent, { tx: await vaultTx([await exampleSetConfig()]) });
    expect(r.out).toContain('instruction #1: missing system.Transfer');
  });

  test('a durable nonce fails even when the intent lists it', async () => {
    const vault = await squadsVaultAddress(MS, 0);
    const nonce: Instruction = {
      programAddress: SYSTEM_PROGRAM,
      accounts: [
        { address: testAddress(71), role: AccountRole.WRITABLE },
        { address: address('SysvarRecentB1ockHashes11111111111111111111'), role: AccountRole.READONLY },
        { address: vault, role: AccountRole.READONLY_SIGNER },
      ],
      data: new Uint8Array(le(4, 4)),
    };
    const intent = example('set-config-max-tvl.json');
    intent.transaction.instructions.unshift({
      program: 'system',
      name: 'AdvanceNonceAccount',
      accounts: { nonceAccount: testAddress(71), recentBlockhashes: 'SysvarRecentB1ockHashes11111111111111111111', nonceAuthority: '$vault' },
    });
    const r = await run(intent, { tx: await vaultTx([nonce, await exampleSetConfig()]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('DURABLE NONCE INSTRUCTION IN THE VAULT MESSAGE');
    expect(r.out).toContain('AdvanceNonceAccount: durable-nonce instruction');
  });

  test('an undecodable instruction fails unless the intent allows it by program id and data hash', async () => {
    const data = new Uint8Array([9, 9, 9]);
    const metadata = address('ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S');
    const vault = await squadsVaultAddress(MS, 0);
    const raw: Instruction = { programAddress: metadata, accounts: [{ address: vault, role: AccountRole.READONLY_SIGNER }, { address: testAddress(72), role: AccountRole.WRITABLE }], data };
    const tx = await vaultTx([await exampleSetConfig(), raw]);
    const bare = await run(example('set-config-max-tvl.json'), { tx });
    expect(bare.code).toBe(1);
    expect(bare.out).toContain('RAW ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S');
    expect(bare.out).toContain('Program Metadata');
    const intent = example('set-config-max-tvl.json');
    const entry = {
      program: 'raw',
      programId: metadata,
      dataSha256: sha256Hex(data),
      reason: 'Program Metadata IDL write',
      accounts: [
        // Flags are the message's: the vault is the payer, so always a writable signer.
        { address: '$vault', signer: true, writable: true },
        { address: testAddress(72), signer: false, writable: true },
      ],
    };
    intent.transaction.instructions.push(entry);
    expect((await run(intent, { tx })).code).toBe(0);
    intent.transaction.instructions[1] = { ...entry, dataSha256: sha256Hex(new Uint8Array([9, 9, 8])) };
    expect((await run(intent, { tx })).out).toContain('data sha256');
  });

  test('a signer other than the vault is a MISMATCH', async () => {
    const ix = await transfer();
    const other: Instruction = { ...ix, accounts: [{ address: testAddress(73), role: AccountRole.WRITABLE_SIGNER }, ix.accounts![1]!] };
    const intent = example('set-config-max-tvl.json');
    intent.transaction.instructions = [{ program: 'system', name: 'Transfer', args: { lamports: 1 }, accounts: { from: testAddress(73), to: testAddress(70) } }];
    const r = await run(intent, { tx: await vaultTx([other]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`message signer ${testAddress(73)} is neither the vault nor an ephemeral signer`);
  });

  test('address lookup tables and unexpected ephemeral signers are refused', async () => {
    const vault = await squadsVaultAddress(MS, 0);
    const m = compileMessage(vault, [await exampleSetConfig()]);
    m.addressTableLookups = [{ accountKey: testAddress(74), writableIndexes: [0], readonlyIndexes: [] }];
    const r = await run(example('set-config-max-tvl.json'), { tx: await vaultTx([], { message: m, ephemeral: [250] }) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('address lookup table');
    expect(r.out).toContain('1 ephemeral signer(s); the intent expects 0');
  });

  test('the transaction must be the one the intent names', async () => {
    const tx = await vaultTx([await exampleSetConfig()]);
    const r = await run({ ...example('set-config-max-tvl.json'), index: 4 }, { tx });
    expect(r.code).toBe(1);
    expect(r.out).toContain('the intent is for index 4, not --index 5');
    const none = await run(example('set-config-max-tvl.json'), { tx: null });
    expect(none.code).toBe(1);
    expect(none.out).toContain('no transaction account at index 5');
  });
});

describe('multisig and proposal', () => {
  test('a controlled multisig or a time lock below the floor is a MISMATCH', async () => {
    const tx = await vaultTx([await exampleSetConfig()]);
    const controlled = await run(example('set-config-max-tvl.json'), { tx, multisig: multisigBytes({ configAuthority: testAddress(75), timeLock: 600 }) });
    expect(controlled.code).toBe(1);
    expect(controlled.out).toContain('config_authority');
    const short = await run(example('set-config-max-tvl.json'), { tx, multisig: multisigBytes({ timeLock: 60 }) });
    expect(short.out).toContain("time lock 60s is below the intent's floor 300s");
  });

  test('proposal status and approvals are reported; stale and absent proposals warn', async () => {
    const tx = await vaultTx([await exampleSetConfig()]);
    const approved = await run(example('set-config-max-tvl.json'), { tx, proposal: proposalBytes({ multisig: MS, index: 5n, status: 'Approved', timestamp: 1_700_000_000n, approved: [MEMBER, testAddress(76)] }) });
    expect(approved.out).toContain('proposal: Approved since 2023-11-14T22:13:20.000Z, approvals 2 of 2');
    expect(approved.out).toContain(`approved by ${testAddress(76)} (NOT a member)`);
    expect(approved.out).toContain('executable from 2023-11-14T22:23:20.000Z');
    expect(approved.code).toBe(0);
    // multisigBytes(): stale_transaction_index 3.
    const stale = await run({ ...example('set-config-max-tvl.json'), index: 3 }, { index: 3n, tx: await vaultTx([await exampleSetConfig()], { index: 3n }) });
    expect(stale.out).toContain('warning: index 3 is stale (at or below 3)');
    expect(stale.code).toBe(0); // the content matches; the warning says it can no longer be approved
    const absent = await run(example('set-config-max-tvl.json'), { tx, proposal: null });
    expect(absent.out).toContain('no Proposal account exists');
  });
});

describe('config transactions', () => {
  const ct = (actions: ConfigAction[]) => configTransactionBytes({ multisig: MS, creator: MEMBER, index: 6n, actions });

  test('the SetTimeLock example MATCHes, every action flagged critical', async () => {
    const r = await run(example('set-time-lock.json'), { index: 6n, tx: ct([{ name: 'SetTimeLock', args: { newTimeLock: 86400 } }]) });
    expect(r.out).toContain('squads.SetTimeLock');
    expect(r.out).toContain('[CRITICAL]');
    expect(r.out).toContain('arg newTimeLock = 86400');
    expect(r.code).toBe(0);
  });

  test('another argument or an extra AddMember is a MISMATCH', async () => {
    const changed = await run(example('set-time-lock.json'), { index: 6n, tx: ct([{ name: 'SetTimeLock', args: { newTimeLock: 0 } }]) });
    expect(changed.out).toContain('action #0 SetTimeLock arg newTimeLock: expected 86400, got 0');
    const extra = await run(example('set-time-lock.json'), {
      index: 6n,
      tx: ct([
        { name: 'SetTimeLock', args: { newTimeLock: 86400 } },
        { name: 'AddMember', args: { newMember: testAddress(77), permissions: 7 } },
      ]),
    });
    expect(extra.code).toBe(1);
    expect(extra.out).toContain('action #1: unexpected extra AddMember');
  });

  test('a config transaction checked against a vault intent is a MISMATCH', async () => {
    const r = await run({ ...example('set-config-max-tvl.json'), index: 6 }, { index: 6n, tx: ct([{ name: 'ChangeThreshold', args: { newThreshold: 1 } }]) });
    expect(r.code).toBe(1);
    expect(r.out).toContain('the transaction is a config transaction; the intent expects vault');
  });
});

describe('upgrades (S9, S14)', () => {
  const PROGRAM = address('8scC79jkU7SPM9v6M4nB833R8EeqKknfwdRdjn73Qqv9');
  const BUFFER = testAddress(80);
  /** A fake build that embeds the program ID, as declare_id! does. */
  const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, ...getAddressEncoder().encode(PROGRAM), 1, 2, 3]);
  const OTHER_ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, ...getAddressEncoder().encode(testAddress(81)), 1, 2, 3]);
  const bufferAccount = (authority: Address, program: Uint8Array = ELF): Account => {
    const b = new Uint8Array(BUFFER_HEADER + program.length + 5);
    new DataView(b.buffer).setUint32(0, 1, true);
    b[4] = 1;
    b.set(getAddressEncoder().encode(authority), 5);
    b.set(program, BUFFER_HEADER);
    return { owner: BPF_LOADER_UPGRADEABLE, data: b };
  };

  async function setup(o: { buffer?: Account; hash?: string; program?: Uint8Array<ArrayBuffer> } = {}) {
    const vault = await squadsVaultAddress(MS, 0);
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: BUFFER, vault, spill: vault, soLen: 100, programDataLen: 45 + 100 });
    const pd = await programDataAddress(PROGRAM);
    const intent = {
      version: 'mutav-proposal-intent/v1',
      cluster: 'localnet',
      multisig: MS,
      index: 5,
      title: 'upgrade',
      transaction: {
        kind: 'vault',
        vaultIndex: 0,
        instructions: [
          {
            program: 'loader',
            name: 'Upgrade',
            accounts: { programData: pd, program: PROGRAM, buffer: BUFFER, spill: '$vault', rent: 'SysvarRent111111111111111111111111111111111', clock: 'SysvarC1ock11111111111111111111111111111111', authority: '$vault' },
          },
        ],
      },
      upgrade: { programId: PROGRAM, buffer: BUFFER, spill: vault, expectedHash: o.hash ?? executableHash(ELF) },
    };
    const chain: Chain = {
      tx: await vaultTx(ixs),
      extra: [
        [BUFFER, o.buffer ?? bufferAccount(vault, o.program)],
        [pd, { owner: BPF_LOADER_UPGRADEABLE, data: programData(vault) }],
      ],
    };
    return { intent, chain, vault };
  }

  test('a buffer of the reproduced build, held by the vault: MATCH', async () => {
    const { intent, chain } = await setup();
    const r = await run(intent, chain, {}, ELF);
    expect(r.out).toContain(`local build (--so) executable hash ${executableHash(ELF)}`);
    expect(r.code).toBe(0);
  });

  test('without --so an upgrade fails and says how to build', async () => {
    const { intent, chain } = await setup();
    const r = await run(intent, chain);
    expect(r.code).toBe(1);
    expect(r.out).toContain('solana-verify build');
  });

  test('a local build with other bytes fails', async () => {
    const { intent, chain } = await setup();
    const r = await run(intent, chain, {}, new Uint8Array([...ELF, 4]));
    expect(r.code).toBe(1);
    expect(r.out).toContain("your local build hashes to");
  });

  test('a buffer with other bytes, or held by someone else, fails', async () => {
    const { intent, chain } = await setup({ buffer: bufferAccount(testAddress(82)) });
    const r = await run(intent, chain, {}, ELF);
    expect(r.out).toContain(`buffer authority is ${testAddress(82)}`);
    const other = await setup({ program: new Uint8Array([...ELF, 9]) });
    expect((await run(other.intent, other.chain, {}, ELF)).out).toContain('buffer hash is');
  });

  test('a buffer built for another program ID fails (S14), even when every hash agrees', async () => {
    const { intent, chain } = await setup({ program: OTHER_ELF, hash: executableHash(OTHER_ELF) });
    const r = await run(intent, chain, {}, OTHER_ELF);
    expect(r.code).toBe(1);
    expect(r.out).toContain('do not contain the program ID');
  });

  test('an Upgrade from another buffer than the intent names fails', async () => {
    const { intent, chain } = await setup();
    const vault = await squadsVaultAddress(MS, 0);
    const ixs = await composeUpgrade({ programId: PROGRAM, buffer: testAddress(83), vault, spill: vault, soLen: 100, programDataLen: 145 });
    const r = await run(intent, { ...chain, tx: await vaultTx(ixs) }, {}, ELF);
    expect(r.code).toBe(1);
    expect(r.out).toContain(`Upgrade buffer is ${testAddress(83)}, expected ${BUFFER}`);
  });

  test('a loader SetAuthority beside an Upgrade is refused by the validator', async () => {
    const { intent, chain } = await setup();
    (intent.transaction.instructions as unknown[]).push({ program: 'loader', name: 'SetAuthority', accounts: { account: PROGRAM, currentAuthority: '$vault' } });
    const r = await run(intent, chain, {}, ELF);
    expect(r.code).toBe(2);
    expect(r.out).toContain('may not also change or close a loader account');
  });

  test('containsBytes', () => {
    expect(containsBytes(new Uint8Array([1, 2, 3, 2, 3, 4]), new Uint8Array([2, 3, 4]))).toBe(true);
    expect(containsBytes(new Uint8Array([1, 2, 3]), new Uint8Array([3, 4]))).toBe(false);
  });
});

describe('cluster and arguments', () => {
  test('mainnet is refused, by flag and by genesis hash', async () => {
    expect((await run(example('set-config-max-tvl.json'), {}, { cluster: 'mainnet' })).out).toContain('mainnet is refused');
    const g = await run(example('set-config-max-tvl.json'), { genesis: MAINNET_GENESIS });
    expect(g.code).toBe(2);
    expect(g.out).toContain('serves mainnet');
  });
  test('the intent cluster must be --cluster; devnet needs devnet genesis', async () => {
    expect((await run(example('set-config-max-tvl.json'), {}, { cluster: 'devnet' })).out).toContain('the intent is for localnet, not --cluster devnet');
    const devIntent = { ...example('set-config-max-tvl.json'), cluster: 'devnet' };
    const r = await run(devIntent, { genesis: DEVNET_GENESIS }, { cluster: 'devnet', rpc: 'https://api.devnet.solana.com' });
    expect(r.out).not.toContain('could not run');
  });
  test('bad --index, --intent or --so are refused before any read', async () => {
    expect(() => parseIndex('0')).toThrow('--index');
    expect(() => parseIndex('1.5')).toThrow('--index');
    expect(parseIndex('18446744073709551615')).toBe(18446744073709551615n);
    expect((await run(example('set-config-max-tvl.json'), {}, { intent: 'intent.txt' })).out).toContain('.json');
    expect((await run(example('set-config-max-tvl.json'), {}, { so: 'mutav.json' })).out).toContain('--so must be');
  });
});

describe('intent validation', () => {
  test('the committed examples are valid', () => {
    for (const f of ['set-config-max-tvl.json', 'set-time-lock.json']) expect(() => parseIntent(example(f))).not.toThrow();
  });
  test('unknown keys, bad addresses and a zero index are listed together', () => {
    const e = () => parseIntent({ ...example('set-config-max-tvl.json'), index: 0, multisig: 'nope', extra: 1 });
    expect(e).toThrow('unknown key "extra"');
    expect(e).toThrow('intent.multisig: not a base58 address');
    expect(e).toThrow('intent.index');
  });
  test('$any is allowed only for payer accounts', () => {
    const i = example('set-config-max-tvl.json');
    i.transaction.instructions[0].accounts.config = '$any';
    expect(() => parseIntent(i)).toThrow('"$any" is allowed only for');
    const ata = example('set-config-max-tvl.json');
    ata.transaction.instructions = [{ program: 'ata', name: 'CreateIdempotent', accounts: { payer: '$any' } }];
    expect(() => parseIntent(ata)).not.toThrow();
  });
  test('raw entries need a data hash and a reason; mainnet and non-object input are refused', () => {
    const i = example('set-config-max-tvl.json');
    i.transaction.instructions = [{ program: 'raw', programId: SYSTEM_PROGRAM, dataSha256: 'xyz', accounts: [] }];
    expect(() => parseIntent(i)).toThrow('dataSha256');
    expect(() => parseIntent(i)).toThrow('missing "reason"');
    expect(() => parseIntent({ ...example('set-time-lock.json'), cluster: 'mainnet' })).toThrow('mainnet is not supported');
    expect(() => parseIntent([1, 2, 3])).toThrow('must be a JSON object');
  });
  test('an Upgrade needs the upgrade block, and the block needs an Upgrade', () => {
    const i = example('set-config-max-tvl.json');
    i.transaction.instructions = [{ program: 'loader', name: 'Upgrade', accounts: {} }];
    expect(() => parseIntent(i)).toThrow('needs the "upgrade" block');
    const j = example('set-config-max-tvl.json');
    j.upgrade = { programId: SYSTEM_PROGRAM, buffer: SYSTEM_PROGRAM, spill: SYSTEM_PROGRAM, expectedHash: 'a'.repeat(64) };
    expect(() => parseIntent(j)).toThrow('no loader Upgrade instruction');
  });
  test('the documented path convention', () => {
    expect(intentPath({ cluster: 'devnet', multisig: MS, index: 12n })).toBe('governance/intents/devnet/5842jNQd/12.json');
  });
  test('numbers and decimal strings compare equal; booleans and other types do not', () => {
    const want = parseIntent({ ...example('set-time-lock.json'), transaction: { kind: 'vault', vaultIndex: 0, instructions: [{ program: 'compute-budget', name: 'SetComputeUnitLimit', args: { units: '1000' } }] } });
    const t = want.transaction as Extract<typeof want.transaction, { kind: 'vault' }>;
    const got: DecodedInstruction = { family: 'compute-budget', programId: address('ComputeBudget111111111111111111111111111111'), name: 'SetComputeUnitLimit', args: { units: 1000 }, accounts: [], remaining: [], dataHex: '', dataSha256: '', risks: [] };
    expect(compareVault(t.instructions, [{ ...got, args: { units: 1000 } }], MS)).toEqual([]);
    expect(compareVault(t.instructions, [{ ...got, args: { units: true } as never }], MS).length).toBe(1);
  });
});
