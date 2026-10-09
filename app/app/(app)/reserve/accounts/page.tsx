import type { Metadata } from "next";
import { AccountsTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Accounts · Transparency", description: "Every account the MUTAV pilot reserve uses, with who signs what, linked to Solana Explorer." };

export default function Page() {
  return <AccountsTab />;
}
