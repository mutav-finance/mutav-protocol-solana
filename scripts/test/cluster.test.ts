import { describe, expect, test } from 'bun:test';
import { DEVNET_GENESIS, guardCluster, isLocalUrl, MAINNET_GENESIS, normaliseRpcUrl } from '../devnet/lib/cluster';

const TESTNET_GENESIS = '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY';

/** A stubbed RPC: answers every URL with `hash` and records what was asked. */
function stub(hash: string) {
  const asked: string[] = [];
  return {
    asked,
    genesisHash: async (href: string) => {
      asked.push(href);
      return hash;
    },
  };
}

describe('normaliseRpcUrl', () => {
  test.each(['', '   ', 'm', 'd', 't', 'l', 'mainnet-beta', 'devnet', 'testnet', 'localhost', 'MAINNET-BETA'])(
    'refuses the moniker or empty value %p',
    (v) => {
      expect(() => normaliseRpcUrl(v)).toThrow();
    },
  );

  test.each(['ftp://api.devnet.solana.com', 'ws://127.0.0.1:8900', 'localhost:8899', 'file:///etc/passwd'])('refuses non-http(s) %p', (v) => {
    expect(() => normaliseRpcUrl(v)).toThrow('http');
  });

  test('returns the normalised href', () => {
    expect(normaliseRpcUrl('HTTPS://API.Devnet.Solana.com').href).toBe('https://api.devnet.solana.com/');
    expect(normaliseRpcUrl(' http://127.0.0.1:8899 ').href).toBe('http://127.0.0.1:8899/');
  });
});

describe('isLocalUrl', () => {
  test('loopback hosts only', () => {
    for (const u of ['http://127.0.0.1:8899', 'http://localhost:18899/', 'http://[::1]:8899']) expect(isLocalUrl(u)).toBe(true);
    for (const u of ['https://api.devnet.solana.com', 'http://127.0.0.2:8899', 'http://localhost.example.com', 'm', '']) {
      expect(isLocalUrl(u)).toBe(false);
    }
  });
});

describe('guardCluster', () => {
  test('devnet with confirmation and the devnet genesis hash passes, with the normalised href', async () => {
    const s = stub(DEVNET_GENESIS);
    const g = await guardCluster('https://API.devnet.solana.com', 'devnet', s);
    expect(g).toEqual({ cluster: 'devnet', url: 'https://api.devnet.solana.com/' });
    expect(s.asked).toEqual(['https://api.devnet.solana.com/']);
  });

  test('a local URL answering a local genesis hash passes as local', async () => {
    const g = await guardCluster('http://127.0.0.1:8899', undefined, stub('LocalGenesis1111111111111111111111111111111'));
    expect(g).toEqual({ cluster: 'local', url: 'http://127.0.0.1:8899/' });
  });

  test('a remote URL needs --confirm-cluster devnet', async () => {
    await expect(guardCluster('https://api.devnet.solana.com', undefined, stub(DEVNET_GENESIS))).rejects.toThrow('--confirm-cluster devnet');
  });

  test.each([
    ['m', DEVNET_GENESIS],
    ['', DEVNET_GENESIS],
    ['mainnet-beta', DEVNET_GENESIS],
    ['devnet', DEVNET_GENESIS],
    ['https://mutav.rpcpool.com/abc', MAINNET_GENESIS],
    ['http://203.0.113.7:8899', MAINNET_GENESIS],
    ['HTTPS://API.MAINNET-BETA.SOLANA.COM', MAINNET_GENESIS],
    ['HTTPS://API.MAINNET-BETA.SOLANA.COM', DEVNET_GENESIS],
    ['https://my-node.example.com', TESTNET_GENESIS],
  ])('refuses %p (genesis %p)', async (url, hash) => {
    await expect(guardCluster(url, 'devnet', stub(hash))).rejects.toThrow();
  });

  test.each([
    'https://rpc.example.com/solana-mainnet/abc123',
    'https://rpc.example.com/v1/MAINNET-BETA',
    'https://Mainnet.helius-rpc.com/',
    'https://api.MAINNET-beta.solana.com',
  ])('refuses %p by name even when it answers the devnet genesis hash', async (url) => {
    const err = await guardCluster(url, 'devnet', stub(DEVNET_GENESIS)).then(() => null, (e: Error) => e);
    expect(err?.message).toContain('names mainnet');
    expect(err?.message).not.toContain('abc123');
  });

  test('a localhost RPC that answers the mainnet genesis hash is refused', async () => {
    await expect(guardCluster('http://localhost:8899', undefined, stub(MAINNET_GENESIS))).rejects.toThrow('mainnet');
  });

  test('a localhost RPC is local even with --confirm-cluster devnet, and still refuses mainnet', async () => {
    await expect(guardCluster('http://127.0.0.1:8899', 'devnet', stub(MAINNET_GENESIS))).rejects.toThrow('mainnet');
  });

  test('a monikered URL never reaches the RPC', async () => {
    const s = stub(DEVNET_GENESIS);
    await expect(guardCluster('m', 'devnet', s)).rejects.toThrow();
    expect(s.asked).toEqual([]);
  });

  test('an RPC failure is a refusal, not a pass', async () => {
    const failing = {
      genesisHash: async () => {
        throw new Error('connection refused');
      },
    };
    await expect(guardCluster('https://api.devnet.solana.com', 'devnet', failing)).rejects.toThrow('genesis hash');
  });
});
