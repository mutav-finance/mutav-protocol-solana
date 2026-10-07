import type { Metadata } from "next";
import { ReservePage } from "@/components/reserve/ReservePage";

export const metadata: Metadata = {
  title: "Reserve",
  description: "The MUTAV pilot reserve, read live from Solana: health, coverage, claims, money flows and the capital queue.",
};

export default function Page() {
  return <ReservePage />;
}
