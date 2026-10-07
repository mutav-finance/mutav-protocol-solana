// An in-memory RPC for the read helpers: getAccountInfo,
// getMultipleAccounts and getProgramAccounts (memcmp filters only).
import {
  address,
  getBase58Encoder,
  getBase64Decoder,
  type Address,
} from '@solana/kit';
import {
  getVaultConfigDecoder,
  getVaultConfigEncoder,
  getVaultConfigSize,
  getVaultStateDecoder,
  getVaultStateEncoder,
  getVaultStateSize,
  MUTAV_PROGRAM_ADDRESS,
  VAULT_CONFIG_DISCRIMINATOR,
  VAULT_STATE_DISCRIMINATOR,
  type VaultConfig,
  type VaultState,
} from '../src';

const b64 = getBase64Decoder();
const b58 = getBase58Encoder();

export class FakeRpc {
  readonly accounts = new Map<string, { data: Uint8Array; owner: Address }>();

  set(addr: Address, data: Uint8Array, owner: Address = MUTAV_PROGRAM_ADDRESS) {
    this.accounts.set(addr, { data, owner });
  }

  private info(addr: string) {
    const a = this.accounts.get(addr);
    if (!a) return null;
    return {
      data: [b64.decode(a.data), 'base64'] as const,
      executable: false,
      lamports: 1_000_000n,
      owner: a.owner,
      space: BigInt(a.data.length),
      rentEpoch: 0n,
    };
  }

  getAccountInfo(addr: Address) {
    return { send: async () => ({ context: { slot: 1n }, value: this.info(addr) }) };
  }

  getMultipleAccounts(addrs: Address[]) {
    return { send: async () => ({ context: { slot: 1n }, value: addrs.map((a) => this.info(a)) }) };
  }

  getProgramAccounts(
    program: Address,
    cfg: { filters?: { memcmp: { offset: bigint; bytes: string; encoding: string } }[] },
  ) {
    return {
      send: async () =>
        [...this.accounts.entries()]
          .filter(([, a]) => a.owner === program)
          .filter(([, a]) =>
            (cfg.filters ?? []).every(({ memcmp }) => {
              const want = memcmp.encoding === 'base58' ? b58.encode(memcmp.bytes) : null;
              if (!want) throw new Error('fake supports base58 memcmp only');
              const off = Number(memcmp.offset);
              return want.every((x, i) => a.data[off + i] === x);
            }),
          )
          .map(([pubkey]) => ({ pubkey: address(pubkey), account: this.info(pubkey)! })),
    };
  }
}

/** A zeroed account with its discriminator, decoded, so tests set only what they need. */
function zeroed<T>(size: number, disc: Uint8Array, decode: (b: Uint8Array) => T): T {
  const bytes = new Uint8Array(size);
  bytes.set(disc, 0);
  return decode(bytes);
}

export const blankConfig = (): VaultConfig =>
  zeroed(getVaultConfigSize(), VAULT_CONFIG_DISCRIMINATOR as Uint8Array, (b) =>
    getVaultConfigDecoder().decode(b),
  );
export const blankState = (): VaultState =>
  zeroed(getVaultStateSize(), VAULT_STATE_DISCRIMINATOR as Uint8Array, (b) =>
    getVaultStateDecoder().decode(b),
  );
export const encodeConfig = (c: VaultConfig) => getVaultConfigEncoder().encode(c) as Uint8Array;
export const encodeState = (s: VaultState) => getVaultStateEncoder().encode(s) as Uint8Array;
