import type { Metadata } from "next";
import { RisksTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Risks · Transparency", description: "The risks and limits of the MUTAV reserve: BRS freeze, claim-payment caps, and who may provide capital." };

export default function Page() {
  return <RisksTab />;
}
