"use client";

/**
 * The /reserve tab bodies: each renders its sections from the shared reads.
 * A section that needs the ledger's accounts or history waits for that read
 * inside its own slot (`<Needs>`); the rest of the tab renders from /api/reserve.
 */
import { Needs, useReserve } from "@/components/reserve/ReserveShell";
import { AccountsSection } from "@/components/reserve/sections/Accounts";
import { ClaimsSection } from "@/components/reserve/sections/Claims";
import { CoverageSection } from "@/components/reserve/sections/Coverage";
import { DisclosuresSection } from "@/components/reserve/sections/Disclosures";
import { FlowsSection } from "@/components/reserve/sections/Flows";
import { Glossary } from "@/components/reserve/sections/Glossary";
import { QueueSection } from "@/components/reserve/sections/Queue";

export function CoverageTab() {
  const { d } = useReserve();
  return (
    <Needs panel="coverage">
      <CoverageSection d={d} />
    </Needs>
  );
}
export function ClaimsTab() {
  const { d } = useReserve();
  return (
    <Needs panel="claims">
      <ClaimsSection d={d} />
    </Needs>
  );
}
/** Capital: where the money came from and went (flows, ledger), and the queue. */
export function CapitalTab() {
  const { d } = useReserve();
  return (
    <>
      <Needs panel="flows">
        <FlowsSection d={d} />
      </Needs>
      <Needs panel="queue">
        <QueueSection d={d} />
      </Needs>
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
