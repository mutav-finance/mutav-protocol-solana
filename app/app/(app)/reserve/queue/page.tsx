import type { Metadata } from "next";
import { QueueTab } from "@/components/reserve/ReserveTabs";

export const metadata: Metadata = { title: "Queue · Transparency", description: "The FIFO capital queue of the MUTAV pilot reserve: pending deposits and redemptions." };

export default function Page() {
  return <QueueTab />;
}
