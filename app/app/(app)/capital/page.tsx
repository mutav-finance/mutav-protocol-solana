import type { Metadata } from "next";
import { InvestmentPage } from "@/components/investment/InvestmentPage";

export const metadata: Metadata = {
  title: "Capital queue",
  description: "The MUTAV pilot's capital queue. Allowlisted wallets only; not open to public investment.",
};

export default function Page() {
  return <InvestmentPage />;
}
