import type { Metadata } from "next";
import { OperatorPage } from "@/components/operator/OperatorPage";

export const metadata: Metadata = {
  title: "Operator",
  description: "The MUTAV operator console: guarantees, guarantee fees and claims, the on-chain limits on each, and what the operator key can and cannot do.",
};

export default function Page() {
  return <OperatorPage />;
}
