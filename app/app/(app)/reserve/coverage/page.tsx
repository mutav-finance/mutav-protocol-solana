import type { Metadata } from "next";
import { CoverageTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Coverage · Transparency", description: "Remaining cover of the MUTAV pilot reserve, per guarantee and per agency, read live from Solana." };

export default function Page() {
  return <CoverageTab />;
}
