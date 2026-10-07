/**
 * One investor's position, read from the chain: its BRS and reserve-share
 * token accounts (associated token accounts), its HolderState, and its
 * allowlist status against the on-chain root. Read-only.
 */
import { address, fetchEncodedAccount, type Address } from "@solana/kit";
import { fetchMaybeHolderState, findHolderStatePda } from "@mutav-finance/mutav-protocol-solana";
import { checkAllowlist, type AllowlistState } from "../allowlist";
import { bytesToHex } from "../serde";
import type { ReserveView } from "../view";
import { READ, rpcFor } from "./chain";
import { associatedTokenAddress, TOKEN_PROGRAM } from "./compose";
import type { ServerEnv } from "./env";

export type InvestorView = {
  /** The wallet asked about, or null when none is connected. */
  owner: string | null;
  allowlist: {
    /** null without a wallet. */
    state: AllowlistState | null;
    /** On-chain `investor_allowlist_root`, hex. */
    root: string;
    /** Size of the server's public ALLOWLIST (the leaves behind the root). */
    listSize: number;
  };
  /** Token balances in base units; null when the account does not exist yet. */
  brs: { account: string; amount: bigint | null };
  shares: { account: string; amount: bigint | null };
  holderState: { address: string; lastSharesInTs: bigint } | null;
};

/** SPL token account `amount`: u64 LE at [64..72). */
async function tokenAmount(env: ServerEnv, account: Address): Promise<bigint | null> {
  const a = await fetchEncodedAccount(rpcFor(env), account, READ);
  if (!a.exists || (a.data as Uint8Array).length < 72) return null;
  const d = a.data as Uint8Array;
  return new DataView(d.buffer, d.byteOffset, d.byteLength).getBigUint64(64, true);
}

export async function readInvestor(env: ServerEnv, r: ReserveView, ownerParam: string | null): Promise<InvestorView> {
  const root = bytesToHex(Uint8Array.from(r.config.investorAllowlistRoot));
  const base = { root, listSize: env.allowlist.length };
  if (!ownerParam) {
    return { owner: null, allowlist: { state: null, ...base }, brs: { account: "", amount: null }, shares: { account: "", amount: null }, holderState: null };
  }
  const owner = address(ownerParam);
  const o = { programAddress: env.programId };
  const [brsAta, shareAta, [holder]] = await Promise.all([
    associatedTokenAddress(owner, r.config.reserveMint, r.config.reserveTokenProgram),
    associatedTokenAddress(owner, address(r.addresses.shareMint), TOKEN_PROGRAM),
    findHolderStatePda({ config: address(r.addresses.config), owner }, o),
  ]);
  const [check, brs, shares, hs] = await Promise.all([
    checkAllowlist(r.config.investorAllowlistRoot, env.allowlist, owner),
    tokenAmount(env, brsAta),
    tokenAmount(env, shareAta),
    fetchMaybeHolderState(rpcFor(env), holder, READ),
  ]);
  return {
    owner,
    allowlist: { state: check.state, ...base },
    brs: { account: brsAta, amount: brs },
    shares: { account: shareAta, amount: shares },
    holderState: hs.exists ? { address: hs.address, lastSharesInTs: hs.data.lastSharesInTs } : null,
  };
}
