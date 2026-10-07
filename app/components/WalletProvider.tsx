"use client";

/**
 * Wallet-standard connection (Phantom, Solflare, Backpack, any wallet that
 * implements `solana:signTransaction`). The app never holds a key: it asks the
 * connected wallet to sign transaction bytes the server composed, then relays
 * the signed bytes. Nothing is persisted except the last wallet's name.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useWallets, type UiWallet, type UiWalletAccount } from "@wallet-standard/react";
import { getWalletAccountFeature } from "@wallet-standard/ui-features";
import { getWalletAccountForUiWalletAccount } from "@wallet-standard/ui-registry";
import { SolanaSignTransaction, type SolanaSignTransactionFeature } from "@solana/wallet-standard-features";
import { CLUSTER } from "@/lib/client/env";
import { walletChain } from "@/lib/cluster";

type WalletCtx = {
  account: UiWalletAccount | null;
  wallet: UiWallet | null;
  address: string | null;
  /** Wallets that can sign Solana transactions. */
  wallets: readonly UiWallet[];
  select: (wallet: UiWallet, account: UiWalletAccount) => void;
  clear: () => void;
  /** Sign base64 wire bytes with the connected wallet; returns signed base64. */
  signTransaction: (txBase64: string) => Promise<string>;
};

const Ctx = createContext<WalletCtx | null>(null);

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

export function WalletProvider({ children }: { children: ReactNode }) {
  const all = useWallets();
  const wallets = useMemo(() => all.filter((w) => w.features.includes(SolanaSignTransaction)), [all]);
  const [selected, setSelected] = useState<{ wallet: UiWallet; account: UiWalletAccount } | null>(null);

  const signTransaction = useCallback(
    async (txBase64: string) => {
      if (!selected) throw new Error("Connect a wallet first.");
      const feature = getWalletAccountFeature(selected.account, SolanaSignTransaction) as SolanaSignTransactionFeature[typeof SolanaSignTransaction];
      const [out] = await feature.signTransaction({
        account: getWalletAccountForUiWalletAccount(selected.account),
        transaction: fromB64(txBase64),
        // Wallets know devnet; for localnet the chain is left out and the app relays the signed bytes itself.
        ...(CLUSTER === "devnet" ? { chain: walletChain(CLUSTER) } : {}),
      });
      if (!out) throw new Error("The wallet returned no signed transaction.");
      return toB64(out.signedTransaction);
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
    }),
    [selected, wallets, signTransaction],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}
