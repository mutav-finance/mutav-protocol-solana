"use client";
import { CLUSTER } from "@/lib/client/env";
import { explorerUrl, type ExplorerKind } from "@/lib/cluster";
import { shortAddr } from "@/lib/format";

/** A link to Solana Explorer for an account or transaction on the app's cluster. */
export function Explorer({ value, kind = "address", rpc, label, full = false }: { value: string; kind?: ExplorerKind; rpc?: string; label?: string; full?: boolean }) {
  return (
    <a
      href={explorerUrl(kind, value, CLUSTER, rpc)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-mono ext-link"
      style={{ fontSize: 12 }}
      title={value}
    >
      {label ?? (full ? value : shortAddr(value, kind === "tx" ? 8 : 4))} ↗
    </a>
  );
}
