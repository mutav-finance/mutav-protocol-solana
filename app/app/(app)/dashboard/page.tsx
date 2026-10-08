import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "The capital provider's dashboard for the MUTAV pilot reserve: allowlist status, position, queue entries and requests.",
};

export default function Page() {
  return <DashboardPage />;
}
