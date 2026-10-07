/**
 * Server runtime config, read at request time by the route handlers. Throws on
 * mainnet or on a cluster/RPC mismatch, so a misconfigured deploy fails closed.
 */
import { address, type Address } from "@solana/kit";
import { MUTAV_PROGRAM_ADDRESS } from "@mutav-finance/mutav-protocol-solana";
import { assertRpcUrl, DEFAULT_RPC, parseCluster, type Cluster } from "../cluster";

export type ServerEnv = {
  cluster: Cluster;
  rpcUrl: string;
  /** RPC the explorer links point at for localnet (the browser's view of the validator). */
  explorerRpc: string;
  programId: Address;
  configAddress: Address | null;
  squadsMultisig: Address | null;
  /** Allowlisted owners (public addresses), for request_deposit proofs. */
  allowlist: Address[];
};

const opt = (v: string | undefined) => (v && v.trim() ? v.trim() : null);

export function serverEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const cluster = parseCluster(env.NEXT_PUBLIC_CLUSTER);
  const rpcUrl = assertRpcUrl(opt(env.RPC_URL) ?? DEFAULT_RPC[cluster], cluster);
  const config = opt(env.CONFIG_ADDRESS);
  const squads = opt(env.SQUADS_MULTISIG);
  return {
    cluster,
    rpcUrl,
    explorerRpc: cluster === "localnet" ? rpcUrl : DEFAULT_RPC.devnet,
    programId: address(opt(env.PROGRAM_ID) ?? MUTAV_PROGRAM_ADDRESS),
    configAddress: config ? address(config) : null,
    squadsMultisig: squads ? address(squads) : null,
    allowlist: (opt(env.ALLOWLIST) ?? "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => address(x)),
  };
}
