/**
 * Which read each /reserve and /capital panel waits on. Three reads, cheapest
 * first; a panel renders as soon as the reads it needs are in, and one
 * failing read never blanks a page:
 *
 * - `reserve` (/api/reserve): config, state, coverage, token and payments
 *   facts. One config fetch and one getMultipleAccounts.
 * - `accounts` (/api/accounts): guarantees, claim filings, queue requests.
 *   Two program-account scans and the queue PDAs.
 * - `history` (/api/history): fee and income receipts with block times, and
 *   the capital queue's fills. Signature lists and transactions: the heavy read.
 */
import type { Ledger, LedgerAccounts, LedgerHistory } from "../view";

export type ReadPart = "reserve" | "accounts" | "history";

/** Where a read stands, for a panel waiting on it. */
export type ReadStatus = "ready" | "loading" | "busy" | "error";

/** The panels and the reads they need. Everything not listed here needs `reserve` only. */
export const PANEL_NEEDS = {
  "overview.hero": ["reserve"],
  "overview.capital": ["reserve"],
  // Money flows: receipts and fills (history) plus claim payments (filings, in accounts).
  "overview.activity": ["reserve", "accounts", "history"],
  coverage: ["reserve", "accounts"],
  claims: ["reserve", "accounts"],
  flows: ["reserve", "accounts", "history"],
  queue: ["reserve", "accounts"],
  risks: ["reserve"],
  verify: ["reserve"],
  "capital.figures": ["reserve"],
  "capital.request": ["reserve"],
  "capital.entries": ["reserve", "accounts"],
  landing: ["reserve"],
} as const satisfies Record<string, readonly ReadPart[]>;

export type Panel = keyof typeof PANEL_NEEDS;

export const needs = (panel: Panel): readonly ReadPart[] => PANEL_NEEDS[panel];

/** A read's status from its poll: data in (even the last good value while busy) is ready. */
export function readStatus(p: { data: unknown; error: (Error & { busy?: boolean }) | null; busy?: boolean }): ReadStatus {
  if (p.data !== null && p.data !== undefined) return "ready";
  if (p.error) return p.busy || p.error.busy ? "busy" : "error";
  return "loading";
}

/**
 * Where a panel stands: ready when every read it needs is in; otherwise the
 * first missing read (cheapest first) and its status.
 */
export function panelStatus(panel: Panel, reads: Record<ReadPart, ReadStatus>): { status: ReadStatus; waitingOn: ReadPart | null } {
  for (const part of needs(panel)) if (reads[part] !== "ready") return { status: reads[part], waitingOn: part };
  return { status: "ready", waitingOn: null };
}

export const EMPTY_ACCOUNTS: LedgerAccounts = { guarantees: [], filings: [], deposits: [], redeems: [] };
export const EMPTY_HISTORY: LedgerHistory = { fees: [], income: [], capitalEvents: [] };

/**
 * The ledger the sections read, from whichever halves are in. A missing half
 * is empty here, so a panel must check `panelStatus` before it renders a
 * figure from that half (an empty list is not "no guarantees").
 */
export const composeLedger = (accounts: LedgerAccounts | null, history: LedgerHistory | null): Ledger => ({
  ...EMPTY_ACCOUNTS,
  ...EMPTY_HISTORY,
  ...(accounts ?? {}),
  ...(history ?? {}),
});
