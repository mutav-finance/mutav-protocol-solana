import { afterAll, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address } from '@solana/kit';
import { MUTAV_PROGRAM_ADDRESS } from '../../clients/js/src';
import { deploy, READBACK_ATTEMPTS, READBACK_INTERVAL_MS, type DeployDeps } from '../devnet/deploy';
import { DEVNET_GENESIS } from '../devnet/lib/cluster';
import { programDataAddress } from '../devnet/lib/compose';
import { parseConfig, type DeployConfig } from '../devnet/lib/config';
import { squadsVaultAddress, SQUADS_V4_PROGRAM } from '../devnet/lib/squads';
import { filled, multisigBytes, programData, testAddress } from './fixtures';

// A placeholder payer file: deploy.ts only checks its mode and hands the path to the CLI.
const dir = mkdtempSync(join(tmpdir(), 'mutav-deploy-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const payerFile = (mode: number) => {
  const p = join(dir, `payer-${mode.toString(8)}.json`);
  writeFileSync(p, 'placeholder, not a key');
  chmodSync(p, mode);
  return p;
};
const BPF = 'BPFLoaderUpgradeab1e11111111111111111111111' as Address;
/** Stands for the deployer's key in a stale ProgramData read. */
const DEPLOYER = testAddress(92);

async function setup(
  o: {
    ownerOverride?: Address;
    threshold?: number;
    /** Authorities the ProgramData read-backs return, in order; the last one repeats. */
    authorityReads?: (Address | null | 'vault')[];
    failHandover?: boolean;
    failDeploy?: boolean;
  } = {},
) {
  const cfg: DeployConfig = parseConfig(filled());
  cfg.admin = await squadsVaultAddress(cfg.squads.multisig, cfg.squads.vaultIndex);
  cfg.upgradeAuthority = await squadsVaultAddress(cfg.upgradeSquads.multisig, cfg.upgradeSquads.vaultIndex);
  const ms = (m: DeployConfig['squads'], threshold = m.threshold) => ({
    owner: o.ownerOverride ?? SQUADS_V4_PROGRAM,
    data: multisigBytes({ threshold, timeLock: m.timeLockFloorSecs, members: m.members.map((k) => [k, 7] as [Address, number]) }),
  });
  const pdAddr = await programDataAddress(MUTAV_PROGRAM_ADDRESS);
  const accounts = new Map<string, { owner: Address; data: Uint8Array }>([
    [cfg.squads.multisig, ms(cfg.squads)],
    [cfg.upgradeSquads.multisig, ms(cfg.upgradeSquads, o.threshold)],
  ]);
  const reads = (o.authorityReads ?? ['vault']).map((r) => (r === 'vault' ? cfg.upgradeAuthority : r));
  const pdReads: { commitment?: string }[] = [];
  const calls: string[][] = [];
  const sleeps: number[] = [];
  const deps: DeployDeps = {
    genesis: { genesisHash: async () => DEVNET_GENESIS },
    account: async (_url, a, opts) => {
      if (a !== pdAddr) return accounts.get(a) ?? null;
      const ua = reads[Math.min(pdReads.length, reads.length - 1)]!;
      pdReads.push({ commitment: opts?.commitment });
      return { owner: BPF, data: programData(ua) };
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    run: (cmd) => {
      calls.push(cmd);
      if (cmd[0] === 'solana-keygen') return `${MUTAV_PROGRAM_ADDRESS}\n`;
      if (cmd[2] === 'set-upgrade-authority' && o.failHandover) throw new Error('blockhash not found');
      return '';
    },
  };
  const opts = {
    url: 'https://api.devnet.solana.com',
    confirmCluster: 'devnet',
    payer: payerFile(0o600),
    programKeypair: '/outside/mutav-keypair.json',
    so: '/outside/mutav.so',
    upgradeAuthority: cfg.upgradeAuthority as string,
    cfg,
  };
  return { cfg, deps, calls, opts, pdReads, sleeps };
}

describe('deploy.ts preflight (refuses before any CLI run)', () => {
  test('happy path: keygen, deploy, hand over, then ProgramData shows the vault', async () => {
    const { deps, calls, opts, cfg } = await setup();
    expect(await deploy(opts, deps)).toEqual({ programId: MUTAV_PROGRAM_ADDRESS });
    expect(calls.map((c) => c.slice(0, 3).join(' '))).toEqual([
      'solana-keygen pubkey /outside/mutav-keypair.json',
      'solana program deploy',
      'solana program set-upgrade-authority',
    ]);
    const handover = calls[2]!;
    expect(handover[handover.indexOf('--new-upgrade-authority') + 1]).toBe(cfg.upgradeAuthority);
    expect(handover[handover.indexOf('--url') + 1]).toBe('https://api.devnet.solana.com/');
  });

  test('--upgrade-authority different from the config', async () => {
    const { deps, calls, opts } = await setup();
    await expect(deploy({ ...opts, upgradeAuthority: testAddress(90) }, deps)).rejects.toThrow('upgradeAuthority');
    expect(calls).toEqual([]);
  });

  test('config upgradeAuthority that is not the derived upgrade vault', async () => {
    const { deps, calls, opts, cfg } = await setup();
    cfg.upgradeSquads.vaultIndex = 1;
    await expect(deploy(opts, deps)).rejects.toThrow('vault');
    expect(calls).toEqual([]);
  });

  test('multisig not owned by the Squads v4 program', async () => {
    const { deps, calls, opts } = await setup({ ownerOverride: testAddress(91) });
    await expect(deploy(opts, deps)).rejects.toThrow('Squads v4');
    expect(calls).toEqual([]);
  });

  test('multisig with the wrong threshold', async () => {
    const { deps, calls, opts } = await setup({ threshold: 1 });
    await expect(deploy(opts, deps)).rejects.toThrow('threshold');
    expect(calls).toEqual([]);
  });

  test.each([0o644, 0o640, 0o604, 0o660])('payer file with mode %o (group/other bits)', async (mode) => {
    const { deps, calls, opts } = await setup();
    await expect(deploy({ ...opts, payer: payerFile(mode) }, deps)).rejects.toThrow('chmod 600');
    expect(calls).toEqual([]);
  });

  test('a localnet config against devnet', async () => {
    const { deps, calls, opts, cfg } = await setup();
    cfg.cluster = 'localnet';
    await expect(deploy(opts, deps)).rejects.toThrow('localnet');
    expect(calls).toEqual([]);
  });

  test('a stand-in authority is refused off localnet', async () => {
    const { deps, calls, opts } = await setup();
    await expect(deploy({ ...opts, localStandIn: true }, deps)).rejects.toThrow('local');
    expect(calls).toEqual([]);
  });
});

describe('deploy.ts handover', () => {
  test('a failed set-upgrade-authority prints the exact retry command and fails', async () => {
    const { deps, calls, opts, cfg } = await setup({ failHandover: true });
    const err = await deploy(opts, deps).then(() => null, (e: Error) => e);
    expect(err).not.toBeNull();
    const msg = err!.message;
    expect(msg).toContain('still holds the upgrade authority');
    expect(msg).toContain(
      `solana program set-upgrade-authority ${MUTAV_PROGRAM_ADDRESS} --upgrade-authority ${opts.payer} --new-upgrade-authority ${cfg.upgradeAuthority} --skip-new-upgrade-authority-signer-check --keypair ${opts.payer} --url https://api.devnet.solana.com/ --commitment confirmed`,
    );
    expect(calls).toHaveLength(3);
  });

  test('the read-back is at confirmed and tolerates a lagging node', async () => {
    const { deps, opts, pdReads, sleeps } = await setup({ authorityReads: [DEPLOYER, 'vault'] });
    expect(await deploy(opts, deps)).toEqual({ programId: MUTAV_PROGRAM_ADDRESS });
    expect(pdReads).toEqual([{ commitment: 'confirmed' }, { commitment: 'confirmed' }]);
    expect(sleeps).toEqual([READBACK_INTERVAL_MS]);
  });

  test('a read-back that never shows the vault says to check first, never that the deployer holds it', async () => {
    const { deps, opts, pdReads } = await setup({ authorityReads: [DEPLOYER] });
    const err = await deploy(opts, deps).then(() => null, (e: Error) => e);
    expect(err).not.toBeNull();
    const msg = err!.message;
    expect(pdReads).toHaveLength(READBACK_ATTEMPTS);
    expect(msg).toContain(`Check \`solana program show ${MUTAV_PROGRAM_ADDRESS} --url "$RPC_URL"\` first`);
    expect(msg).toContain('nothing to do');
    expect(msg).not.toContain('still holds');
    expect(msg).not.toContain('api.devnet.solana.com');
  });
});
