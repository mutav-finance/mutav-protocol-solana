"use client";

/**
 * The reads behind /capital: the shared /api/ledger poll and
 * the connected wallet's /api/investor view (balances, allowlist state), with
 * the wallet's queue entries derived from them. No new data.
 */
import { useWallet } from "@/components/WalletProvider";
import { usePoll } from "@/lib/client/use-poll";
import type { InvestorView } from "@/lib/server/investor";
import { investorRequests, type Ledger, type ReserveView } from "@/lib/view";
import { MOCK } from "./shared";

export function useInvestor() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const d = poll.data;
  const previewOwner = !address && MOCK && d ? d.reserve.config.mutavCapitalWallet : null;
  const owner = address ?? previewOwner;
  const inv = usePoll<InvestorView>(`/api/investor${owner ? `?owner=${owner}` : ""}`, 10_000);
  const invData = inv.data && inv.data.owner === owner ? inv.data : null;
  const mine = d && owner ? investorRequests(owner, d.reserve.state, d.ledger) : [];
  return {
    address,
    connected: !!address,
    owner,
    poll,
    d,
    inv,
    invData,
    mine,
    refresh: async () => {
      await Promise.all([poll.refresh(), inv.refresh()]);
    },
  };
}
