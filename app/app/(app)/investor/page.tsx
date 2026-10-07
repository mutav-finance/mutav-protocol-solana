import type { Metadata } from "next";
import { InvestorPage } from "@/components/investor/InvestorPage";

export const metadata: Metadata = {
  title: "Investor",
  description: "The capital provider's view of the MUTAV pilot reserve: allowlist status, position, queue entries and requests.",
};

export default function Page() {
  return <InvestorPage />;
}
