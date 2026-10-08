import type { Metadata } from "next";
import { FlowsTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Flows · Reserve", description: "Money into and out of the MUTAV pilot reserve: guarantee fees, issuer income, claim payments and capital." };

export default function Page() {
  return <FlowsTab />;
}
