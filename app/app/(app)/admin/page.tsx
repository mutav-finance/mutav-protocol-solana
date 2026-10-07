import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";

export const metadata: Metadata = {
  title: "Admin",
  description: "VaultConfig and Squads proposals for the MUTAV pilot reserve.",
};

export default function Page() {
  return <AdminPage />;
}
