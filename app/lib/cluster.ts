/**
 * Cluster guard. The pilot app runs against `localnet` (a local validator
 * seeded by scripts/seed.ts) or `devnet`. Mainnet is refused everywhere: in the
 * env parser, in the RPC URL check and in the explorer links.
 */

export type Cluster = "localnet" | "devnet";

export const CLUSTERS: readonly Cluster[] = ["localnet", "devnet"] as const;

export class MainnetRefusedError extends Error {
  override name = "MainnetRefusedError";
  constructor(what: string) {
    super(`${what}: mainnet is out of scope for the pilot app (localnet or devnet only)`);
  }
}

/** Parse `NEXT_PUBLIC_CLUSTER`. Defaults to devnet; mainnet or anything unknown throws. */
export function parseCluster(value: string | undefined): Cluster {
  const v = (value ?? "devnet").trim().toLowerCase();
  if (/mainnet/.test(v)) throw new MainnetRefusedError(`NEXT_PUBLIC_CLUSTER=${value}`);
  if (v === "localnet" || v === "devnet") return v;
  throw new Error(`NEXT_PUBLIC_CLUSTER must be "localnet" or "devnet", got "${value}"`);
}

const LOCAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\/?$/;

export const isLocalUrl = (url: string) => LOCAL_URL.test(url);

/** Known mainnet RPC hosts, plus any URL that names mainnet. */
const MAINNET_URL = /mainnet|api\.solana\.com\/?$|solana-mainnet/i;

/**
 * Check an RPC URL against the cluster: refuse anything that looks like
 * mainnet, and require a local URL for localnet.
 */
export function assertRpcUrl(url: string, cluster: Cluster): string {
  if (MAINNET_URL.test(url) && !/devnet/i.test(url)) throw new MainnetRefusedError(`RPC_URL=${url}`);
  if (cluster === "localnet" && !isLocalUrl(url)) {
    throw new Error(`RPC_URL=${url} is not local, but NEXT_PUBLIC_CLUSTER=localnet`);
  }
  if (cluster === "devnet" && isLocalUrl(url)) {
    throw new Error(`RPC_URL=${url} is local, but NEXT_PUBLIC_CLUSTER=devnet`);
  }
  return url;
}

export const DEFAULT_RPC: Record<Cluster, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
};

/** Wallet-standard chain id for the cluster. */
export const walletChain = (c: Cluster) => (c === "devnet" ? "solana:devnet" : "solana:localnet") as `solana:${string}`;

export type ExplorerKind = "address" | "tx";

/** A Solana Explorer link. Localnet links point the explorer at the local RPC. */
export function explorerUrl(kind: ExplorerKind, value: string, cluster: Cluster, localRpc = DEFAULT_RPC.localnet): string {
  const base = `https://explorer.solana.com/${kind}/${value}`;
  if (cluster === "devnet") return `${base}?cluster=devnet`;
  return `${base}?cluster=custom&customUrl=${encodeURIComponent(localRpc)}`;
}
