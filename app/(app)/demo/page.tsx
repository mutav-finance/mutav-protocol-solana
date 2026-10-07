import type { Metadata } from "next";
import { DemoPage } from "@/components/demo/DemoPage";

export const metadata: Metadata = {
  title: "Demo",
  description: "The full MUTAV guarantee flow on Solana, step by step, from the operator wallet.",
};

export default function Page() {
  return <DemoPage />;
}
