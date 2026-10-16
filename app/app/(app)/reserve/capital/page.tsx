import type { Metadata } from "next";
import { CapitalTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = {
  title: "Capital · Transparency",
  description: "Every movement in and out of the MUTAV reserve, the FIFO capital queue and the dated ledger, read live from Solana.",
};

export default function Page() {
  return <CapitalTab />;
}
