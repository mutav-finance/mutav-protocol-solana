import type { Metadata } from "next";
import { Overview } from "@/components/reserve/Overview";

export const metadata: Metadata = {
  title: "Transparency",
  description: "The MUTAV reserve, read live from Solana: health, coverage, claims, money flows and the capital queue.",
};

export default function Page() {
  return <Overview />;
}
