/** Read-only RPC helpers shared by the CLIs. */
import { createSolanaRpc, fetchEncodedAccount, type Address } from '@solana/kit';

export const rpcFor = (url: string) => createSolanaRpc(url);
export type ReadRpc = ReturnType<typeof rpcFor>;

export async function accountData(rpc: ReadRpc, a: Address): Promise<Uint8Array | null> {
  const acc = await fetchEncodedAccount(rpc, a);
  return acc.exists ? (acc.data as Uint8Array) : null;
}
