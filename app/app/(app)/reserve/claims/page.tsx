import type { Metadata } from "next";
import { ClaimsTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Claims · Reserve", description: "Claim payments of the MUTAV pilot reserve, with on-chain timestamps from filing to PIX settlement." };

export default function Page() {
  return <ClaimsTab />;
}
