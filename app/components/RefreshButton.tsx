"use client";

/**
 * The permissionless `refresh` instruction, sent from any connected wallet.
 * It recomputes and publishes NAV, coverage and mode on-chain, and records
 * late flags on pending claim payments past their SLA.
 */
import { Button } from "@/components/ui/button";
import { TxStatus } from "@/components/TxStatus";
import { useWallet } from "@/components/WalletProvider";
import { useTx } from "@/lib/client/use-tx";

export function RefreshButton({ onConfirmed }: { onConfirmed?: () => void }) {
  const { address } = useWallet();
  const { state, run } = useTx(onConfirmed);
  const busy = !["idle", "confirmed", "failed"].includes(state.phase);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: 420 }}>
      <Button variant="outline" disabled={busy} onClick={() => run({ kind: "refresh" })} title={address ? "Send refresh from your wallet (anyone may call it)" : "Connect any wallet to send refresh"}>
        {busy ? "Refreshing…" : "Refresh on-chain"}
      </Button>
      {!address && state.phase === "idle" && (
        <span className="font-body" style={{ fontSize: 11, color: "var(--color-text-3)", marginTop: 6 }}>
          Anyone can call it: connect any wallet.
        </span>
      )}
      <TxStatus state={state} showAccounts={false} />
    </div>
  );
}
