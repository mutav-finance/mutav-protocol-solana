"use client";

/** The /reserve tab bodies: each renders its sections from the shared read. */
import { useReserve } from "@/components/reserve/ReserveShell";
import { AccountsSection } from "@/components/reserve/sections/Accounts";
import { ClaimsSection } from "@/components/reserve/sections/Claims";
import { CoverageSection } from "@/components/reserve/sections/Coverage";
import { DisclosuresSection } from "@/components/reserve/sections/Disclosures";
import { FlowsSection } from "@/components/reserve/sections/Flows";
import { Glossary } from "@/components/reserve/sections/Glossary";
import { QueueSection } from "@/components/reserve/sections/Queue";

export function CoverageTab() {
  return <CoverageSection d={useReserve().d} />;
}
export function ClaimsTab() {
  return <ClaimsSection d={useReserve().d} />;
}
/** Capital: where the money came from and went (flows, ledger), and the queue. */
export function CapitalTab() {
  const { d } = useReserve();
  return (
    <>
      <FlowsSection d={d} />
      <QueueSection d={d} />
    </>
  );
}
export function RisksTab() {
  return <DisclosuresSection d={useReserve().d} />;
}
/** Verify: who signs, every account, and how to read the figures. */
export function VerifyTab() {
  const { d } = useReserve();
  return (
    <>
      <AccountsSection d={d} />
      <Glossary />
    </>
  );
}
