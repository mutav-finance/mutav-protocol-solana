"use client";

/**
 * Wallet connect control. Lists every wallet-standard wallet that can sign
 * Solana transactions; the connected address shows as a short mono label.
 */
import { useEffect, useRef, useState } from "react";
import { useConnect, type UiWallet } from "@wallet-standard/react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/WalletProvider";
import { shortAddr } from "@/lib/format";

function WalletOption({ wallet, onDone }: { wallet: UiWallet; onDone: () => void }) {
  const { select } = useWallet();
  const [connecting, connect] = useConnect(wallet);
  const [err, setErr] = useState<string | null>(null);
  return (
    <li style={{ listStyle: "none" }}>
      <Button
        variant="ghost"
        className="w-full justify-start"
        disabled={connecting}
        onClick={async () => {
          try {
            const accounts = await connect();
            const account = accounts[0] ?? wallet.accounts[0];
            if (!account) throw new Error("No account returned.");
            select(wallet, account);
            onDone();
          } catch (e) {
            setErr((e as Error).message);
          }
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={wallet.icon} alt="" width={16} height={16} style={{ width: 16, height: 16 }} />
        <span className="font-body">{connecting ? `Connecting ${wallet.name}…` : wallet.name}</span>
      </Button>
      {err && <p className="font-mono" style={{ fontSize: 11, color: "var(--color-error)", margin: "4px 12px" }}>{err}</p>}
    </li>
  );
}

export function ConnectButton() {
  const { address, wallet, wallets, clear } = useWallet();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (address) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="font-mono" title={`${wallet?.name}: ${address}`} style={{ fontSize: 12, color: "var(--color-text-2)" }}>
          {shortAddr(address)}
        </span>
        <Button variant="outline" size="sm" onClick={clear}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Button variant="outline" size="sm" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((v) => !v)}>
        Connect wallet
      </Button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 240,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            padding: 6,
            zIndex: 120,
          }}
        >
          {wallets.length === 0 ? (
            <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 8 }}>
              No Solana wallet found. Install Phantom, Solflare or Backpack.
            </p>
          ) : (
            <ul style={{ margin: 0, padding: 0 }}>
              {wallets.map((w) => (
                <WalletOption key={w.name} wallet={w} onDone={() => setOpen(false)} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
