"use client";

import { Page, ReadError, Section } from "@/components/Section";
import { RefreshButton } from "@/components/RefreshButton";
import { Accounts, Claims, Coverage, Disclosures, Flows, Health, Queue } from "@/components/reserve/ReserveSections";
import { usePoll } from "@/lib/client/use-poll";
import type { Ledger, ReserveView } from "@/lib/view";

export function ReservePage() {
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const d = poll.data;
  return (
    <Page
      title="The reserve, live from Solana"
      lede={
        <>
          Every number here is read from on-chain accounts of the MUTAV program and refreshed every 10 seconds. No wallet needed.{" "}
          {poll.updatedAt && <span className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)" }}>Read at {new Date(poll.updatedAt).toLocaleTimeString()}{d ? ` · slot ${d.reserve.slot}` : ""}</span>}
        </>
      }
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {poll.loading && !d && (
        <p className="font-mono" aria-busy="true" style={{ color: "var(--color-text-3)", fontSize: 12 }}>
          Reading the chain…
        </p>
      )}
      {d && (
        <>
          <Section id="health" title="Health" kicker="Solvency" info="Computed by the program's own formulas (spec §4) from VaultConfig and VaultState." action={<RefreshButton onConfirmed={poll.refresh} />}>
            <Health r={d.reserve} />
          </Section>
          <Section id="coverage" title="Coverage" kicker="Guarantees" info="Each guarantee has a default (rent-arrears) leg and an exit (property-recovery) leg. Remaining cover is cover minus what was already paid.">
            <Coverage r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="claims" title="Claims timeline" kicker="Proven speed" info="On-chain timestamps for each claim: filed (provision booked), paid (BRS to the payments account), settled (PIX to the agency, with the hash of the PIX end-to-end id).">
            <Claims r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="flows" title="Money flows" kicker="In and out">
            <Flows r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="queue" title="Capital queue" kicker="FIFO" info="Deposits and redemptions wait in strict FIFO order until the admin multisig fulfils them.">
            <Queue r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="disclosures" title="Disclosures" kicker="Read this">
            <Disclosures r={d.reserve} />
          </Section>
          <Section id="accounts" title="Every account" kicker="Verify it yourself">
            <Accounts r={d.reserve} />
          </Section>
        </>
      )}
    </Page>
  );
}
