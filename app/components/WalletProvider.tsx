"use client";

/**
 * Wallet-standard connection (Phantom, Solflare, Backpack, any wallet that
 * implements the Solana transaction features). The app never holds a key:
 * - on devnet the wallet signs and sends (`solana:signAndSendTransaction`)
 *   the bytes the server composed, through its own RPC;
 * - on localnet the wallet signs (`solana:signTransaction`) and the app's
 *   localnet-only relay submits to the local validator.
 * Nothing is persisted except the last wallet's name.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useWallets, type UiWallet, type UiWalletAccount } from "@wallet-standard/react";
import { getWalletAccountFeature } from "@wallet-standard/ui-features";
import { getWalletAccountForUiWalletAccount } from "@wallet-standard/ui-registry";
import {
  SolanaSignAndSendTransaction,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { getBase58Decoder } from "@solana/kit";
import { CLUSTER } from "@/lib/client/env";
import { requiredFeature } from "@/lib/client/transport";
import { walletChain } from "@/lib/cluster";

type WalletCtx = {
  account: UiWalletAccount | null;
  wallet: UiWallet | null;
  address: string | null;
  /** Wallets that support this cluster's transport. */
  wallets: readonly UiWallet[];
  select: (wallet: UiWallet, account: UiWalletAccount) => void;
  clear: () => void;
  /** Localnet: sign base64 wire bytes with the connected wallet; returns signed base64. */
  signTransaction: (txBase64: string) => Promise<string>;
  /** Devnet: the wallet signs and sends; returns the base58 signature. */
  signAndSendTransaction: (txBase64: string) => Promise<string>;
};

const Ctx = createContext<WalletCtx | null>(null);

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export function WalletProvider({ children }: { children: ReactNode }) {
  const all = useWallets();
  const feature = requiredFeature(CLUSTER);
  const wallets = useMemo(() => all.filter((w) => w.features.includes(feature)), [all, feature]);
  const [selected, setSelected] = useState<{ wallet: UiWallet; account: UiWalletAccount } | null>(null);

  const signTransaction = useCallback(
    async (txBase64: string) => {
      if (!selected) throw new Error("Connect a wallet first.");
      const f = getWalletAccountFeature(selected.account, SolanaSignTransaction) as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
      const [out] = await f.signTransaction({
        account: getWalletAccountForUiWalletAccount(selected.account),
        transaction: fromB64(txBase64),
        // Localnet: no wallet knows the chain, so it is left out; the app relays the signed bytes.
        ...(CLUSTER === "devnet" ? { chain: walletChain(CLUSTER) } : {}),
      });
      if (!out) throw new Error("The wallet returned no signed transaction.");
      return toB64(out.signedTransaction);
    },
    [selected],
  );

  const signAndSendTransaction = useCallback(
    async (txBase64: string) => {
      if (!selected) throw new Error("Connect a wallet first.");
      const chain = walletChain(CLUSTER);
      if (selected.account.chains.length > 0 && !selected.account.chains.includes(chain)) {
        throw new Error(`The connected wallet account does not support ${chain}: switch the wallet to ${CLUSTER}.`);
      }
      if (!selected.account.features.includes(SolanaSignAndSendTransaction)) {
        throw new Error("The connected wallet cannot sign and send transactions (solana:signAndSendTransaction).");
      }
      const f = getWalletAccountFeature(selected.account, SolanaSignAndSendTransaction) as SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction];
      const [out] = await f.signAndSendTransaction({
        account: getWalletAccountForUiWalletAccount(selected.account),
        transaction: fromB64(txBase64),
        chain,
        options: { preflightCommitment: "confirmed" },
      });
      if (!out) throw new Error("The wallet returned no signature.");
      return getBase58Decoder().decode(out.signature);
    },
    [selected],
  );

  const value = useMemo<WalletCtx>(
    () => ({
      account: selected?.account ?? null,
      wallet: selected?.wallet ?? null,
      address: selected?.account.address ?? null,
      wallets,
      select: (wallet, account) => setSelected({ wallet, account }),
      clear: () => setSelected(null),
      signTransaction,
      signAndSendTransaction,
    }),
    [selected, wallets, signTransaction, signAndSendTransaction],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
