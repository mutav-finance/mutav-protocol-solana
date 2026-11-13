/**
 * The watcher's read-only view of the chain. Checks take a `WatchSource`, so
 * tests pass fixture data and no test touches the network. `kitSource` is the
 * live implementation over `@solana/kit`; every call is a read.
 */
import { address, type Address } from '@solana/kit';
import { accountInfo, rpcFor } from '../../devnet/lib/rpc';

export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');

/**
 * System nonce account (solana-sdk `nonce/src/state.rs`, `versions.rs`), bincode:
 *
 *   0..4    Versions tag  u32  (0 Legacy, 1 Current)
 *   4..8    State tag     u32  (0 Uninitialized, 1 Initialized)
 *   8..40   authority     Pubkey
 *   40..72  durable_nonce Hash
 *   72..80  fee_calculator.lamports_per_signature u64
 *
 * `State::size()` is 80.
 */
export const NONCE_ACCOUNT_SIZE = 80;
export const NONCE_AUTHORITY_OFFSET = 8;

export type SignatureInfo = { signature: string; blockTime: number | null; err: unknown };

/** What the outflow check needs from one transaction. */
export type TxBalances = {
  /** Static account keys, then the writable and read-only addresses loaded from lookup tables. */
  accountKeys: string[];
  pre: { accountIndex: number; amount: string }[];
  post: { accountIndex: number; amount: string }[];
};

export interface WatchSource {
  account(a: Address): Promise<{ owner: Address; data: Uint8Array } | null>;
  /** Whether each address holds an account, in order. */
  exist(addrs: Address[]): Promise<boolean[]>;
  /** System nonce accounts whose authority is `authority`. */
  nonceAccountsWithAuthority(authority: Address): Promise<Address[]>;
  /** Newest first, as `getSignaturesForAddress` returns them. */
  signatures(a: Address, o: { before?: string; limit: number }): Promise<SignatureInfo[]>;
  transaction(signature: string): Promise<TxBalances | null>;
}

type RawBalance = { accountIndex: number; uiTokenAmount: { amount: string } };
type RawTx = {
  transaction: { message: { accountKeys: string[] } };
  meta: {
    preTokenBalances?: RawBalance[] | null;
    postTokenBalances?: RawBalance[] | null;
    loadedAddresses?: { writable: string[]; readonly: string[] } | null;
  } | null;
} | null;

const balances = (xs: RawBalance[] | null | undefined) =>
  (xs ?? []).map((b) => ({ accountIndex: Number(b.accountIndex), amount: String(b.uiTokenAmount.amount) }));

export function kitSource(url: string): WatchSource {
  const rpc = rpcFor(url);
  return {
    account: (a) => accountInfo(rpc, a),
    async exist(addrs) {
      if (addrs.length === 0) return [];
      const r = await rpc.getMultipleAccounts(addrs, { encoding: 'base64', dataSlice: { offset: 0, length: 0 } }).send();
      return r.value.map((v) => v !== null);
    },
    async nonceAccountsWithAuthority(authority) {
      const rows = (await rpc
        .getProgramAccounts(SYSTEM_PROGRAM, {
          encoding: 'base64',
          dataSlice: { offset: 0, length: 0 },
          filters: [
            { dataSize: BigInt(NONCE_ACCOUNT_SIZE) },
            { memcmp: { offset: BigInt(NONCE_AUTHORITY_OFFSET), bytes: authority, encoding: 'base58' } },
          ],
        } as never)
        .send()) as unknown as { pubkey: Address }[];
      return rows.map((r) => r.pubkey);
    },
    async signatures(a, o) {
      const r = await rpc.getSignaturesForAddress(a, { limit: o.limit, ...(o.before ? { before: o.before as never } : {}) }).send();
      return r.map((s) => ({ signature: String(s.signature), blockTime: s.blockTime === null ? null : Number(s.blockTime), err: s.err }));
    },
    async transaction(signature) {
      const tx = (await rpc
        .getTransaction(signature as never, { encoding: 'json', maxSupportedTransactionVersion: 0 } as never)
        .send()) as unknown as RawTx;
      if (!tx || !tx.meta) return null;
      const loaded = tx.meta.loadedAddresses;
      return {
        accountKeys: [...tx.transaction.message.accountKeys.map(String), ...(loaded?.writable ?? []), ...(loaded?.readonly ?? [])],
        pre: balances(tx.meta.preTokenBalances),
        post: balances(tx.meta.postTokenBalances),
      };
    },
  };
}
