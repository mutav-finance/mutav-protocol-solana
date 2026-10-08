"use client";

/** The /reserve tab bodies: each renders one section from the shared read. */
import { useReserve } from "@/components/reserve/ReserveShell";
import { AccountsSection } from "@/components/reserve/sections/Accounts";
import { ClaimsSection } from "@/components/reserve/sections/Claims";
import { CoverageSection } from "@/components/reserve/sections/Coverage";
import { DisclosuresSection } from "@/components/reserve/sections/Disclosures";
import { FlowsSection } from "@/components/reserve/sections/Flows";
import { QueueSection } from "@/components/reserve/sections/Queue";

export function CoverageTab() {
  return <CoverageSection d={useReserve().d} />;
}
export function ClaimsTab() {
  return <ClaimsSection d={useReserve().d} />;
}
export function FlowsTab() {
  return <FlowsSection d={useReserve().d} />;
}
export function QueueTab() {
  return <QueueSection d={useReserve().d} />;
}
export function DisclosuresTab() {
  return <DisclosuresSection d={useReserve().d} />;
}
export function AccountsTab() {
  return <AccountsSection d={useReserve().d} />;
}
