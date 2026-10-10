import type { Metadata } from "next";
import { InvestmentPage } from "@/components/investment/InvestmentPage";

export const metadata: Metadata = {
  title: "Investment",
  description: "Deposit BRS into the MUTAV pilot reserve's capital queue, or redeem shares. Allowlisted wallets only; the pilot is not open to public investment.",
};

export default function Page() {
  return <InvestmentPage />;
}
