import type { Metadata } from "next";
import { ClaimsTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Claims · Transparency", description: "Claim payments of the MUTAV reserve, with on-chain timestamps from filing to PIX settlement." };

export default function Page() {
  return <ClaimsTab />;
}
