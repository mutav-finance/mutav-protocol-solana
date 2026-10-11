/**
 * How a signed transaction reaches the cluster (A1/A2 decision, 2026-10-10):
 * - devnet: the wallet signs AND sends (`solana:signAndSendTransaction`)
 *   through its own RPC; the app only confirms through its read endpoint;
 * - localnet: the wallet signs (`solana:signTransaction`), and the app's
 *   localnet-only relay (/api/tx/send) submits to the local validator, which
 *   no wallet knows.
 */
import type { Cluster } from "../cluster";

export type Transport = "wallet-send" | "relay";

export const transportFor = (cluster: Cluster): Transport => (cluster === "devnet" ? "wallet-send" : "relay");

/** The wallet-standard feature a wallet needs for this cluster's transport. */
export const requiredFeature = (cluster: Cluster) =>
  transportFor(cluster) === "wallet-send" ? "solana:signAndSendTransaction" : "solana:signTransaction";

/**
 * A clearer message for a wallet send failure. The app composes devnet
 * transactions with a devnet blockhash: a wallet set to another cluster fails
 * them at preflight with "blockhash not found".
 */
export function walletSendError(message: string, cluster: Cluster): string {
  if (/blockhash not found|block ?hash.*(expired|not found)/i.test(message)) {
    return `${message} — the wallet is probably set to another cluster: switch it to ${cluster} and retry.`;
  }
  if (/user rejected|rejected the request|declined/i.test(message)) return "The wallet declined the request.";
  return message;
}

/** Seconds of "pending" before the confirm loop suggests the wallet sent elsewhere. */
export const NOT_SEEN_HINT_SECS = 30;

export const notSeenText = (cluster: Cluster, secs: number) =>
  `not seen on ${cluster} after ${secs} s: if the wallet is set to another cluster, the transaction went there (or nowhere). Switch the wallet to ${cluster} and retry.`;
