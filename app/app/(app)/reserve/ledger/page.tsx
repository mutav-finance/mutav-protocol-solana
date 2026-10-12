import type { Metadata } from "next";
import { LedgerTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = {
  title: "Ledger · Transparency",
  description: "Every movement in and out of the MUTAV reserve, and the FIFO capital queue, read live from Solana.",
};

export default function Page() {
  return <LedgerTab />;
}
