import type { Metadata } from "next";
import { VerifyTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Verify · Transparency", description: "Every key and account the MUTAV reserve uses, with who signs what, linked to Solana Explorer." };

export default function Page() {
  return <VerifyTab />;
}
