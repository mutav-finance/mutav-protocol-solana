"use client";

/**
 * The reads behind /capital: /api/reserve (the figures and the request form),
 * /api/accounts (the queue's requests, for the wallet's entries) and the
 * connected wallet's /api/investor view (balances, allowlist state). The page
 * never waits on the ledger's history; the entries wait on the accounts read.
 */
import { useWallet } from "@/components/WalletProvider";
import { usePoll } from "@/lib/client/use-poll";
import type { InvestorView } from "@/lib/server/investor";
import { composeLedger, readStatus } from "@/lib/client/reserve-reads";
import { investorRequests, type LedgerAccounts, type ReserveView } from "@/lib/view";
import { MOCK } from "./shared";

export function useInvestor() {
  const { address } = useWallet();
  const poll = usePoll<ReserveView>("/api/reserve", 10_000);
  const accounts = usePoll<LedgerAccounts>("/api/accounts", 10_000);
  // The queue entries need only the requests; the history halves stay empty and unread here.
  const d = poll.data ? { reserve: poll.data, ledger: composeLedger(accounts.data, null) } : null;
  const previewOwner = !address && MOCK && d ? d.reserve.config.mutavCapitalWallet : null;
  const owner = address ?? previewOwner;
  const inv = usePoll<InvestorView>(`/api/investor${owner ? `?owner=${owner}` : ""}`, 10_000);
  const invData = inv.data && inv.data.owner === owner ? inv.data : null;
  const mine = d && owner && accounts.data ? investorRequests(owner, d.reserve.state, d.ledger) : [];
  return {
    address,
    connected: !!address,
    owner,
    poll,
    accounts,
    accountsStatus: readStatus(accounts),
    d,
    inv,
    invData,
    mine,
    refresh: async () => {
      await Promise.all([poll.refresh(), accounts.refresh(), inv.refresh()]);
    },
  };
}
