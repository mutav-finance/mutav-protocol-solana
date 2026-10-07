"use client";

import { Page, ReadError, Section } from "@/components/Section";
import { RefreshButton } from "@/components/RefreshButton";
import { Accounts, Claims, Coverage, Disclosures, Flows, Health, Queue } from "@/components/reserve/ReserveSections";
import { RoleLegend, RoleLine } from "@/components/RoleTag";
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
          <WhoDoesWhat />
          <Section id="health" title="Health" kicker="Solvency" info="Computed by the program's own formulas (spec §4) from VaultConfig and VaultState." roles={<RoleLine items={[{ role: "admin", prefix: "ratio and caps set by" }, { role: "anyone", prefix: "refresh by" }]} />} action={<RefreshButton onConfirmed={poll.refresh} />}>
            <Health r={d.reserve} />
          </Section>
          <Section id="coverage" title="Coverage" kicker="Guarantees" roles={<RoleLine items={[{ role: "operator", prefix: "registered by" }, { role: "admin", prefix: "caps set by" }]} />} info="Each guarantee has a default (rent-arrears) leg and an exit (property-recovery) leg. Remaining cover is cover minus what was already paid.">
            <Coverage r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="claims" title="Claims timeline" kicker="Proven speed" roles={<RoleLine items={[{ role: "operator", prefix: "filed, paid and settled by" }]}>The Reserve Admin cannot block a claim payment.</RoleLine>} info="On-chain timestamps for each claim: filed (provision booked), paid (BRS to the payments account), settled (PIX to the agency, with the hash of the PIX end-to-end id).">
            <Claims r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="flows" title="Money flows" kicker="In and out" roles={<RoleLine items={[{ role: "operator", prefix: "fees and claims by" }, { role: "investor", prefix: "deposits and redemptions requested by" }, { role: "admin", prefix: "filled by" }]} />}>
            <Flows r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="queue" title="Capital queue" kicker="FIFO" info="Deposits and redemptions wait in strict FIFO order until the admin multisig fulfils them." roles={<RoleLine items={[{ role: "investor", prefix: "requested by" }, { role: "admin", prefix: "fulfilled by" }, { role: "investor", prefix: "claimed by" }]} />}>
            <Queue r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="disclosures" title="Disclosures" kicker="Read this">
            <Disclosures r={d.reserve} />
          </Section>
          <Section id="accounts" title="Every account" kicker="Verify it yourself">
            <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", margin: "0 0 16px", lineHeight: 1.6, maxWidth: 860 }}>
              Every account the reserve uses: the program, its state and token accounts, the mints, and the wallets that hold each role. Open any address on Solana Explorer to check the numbers above against the chain yourself.
            </p>
            <Accounts r={d.reserve} />
          </Section>
        </>
      )}
    </Page>
  );
}

/** The key for every role tag on this page. */
function WhoDoesWhat() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 0 24px" }}>
      <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", margin: 0, maxWidth: 860, lineHeight: 1.6 }}>
        Each section says who wrote what it shows: the Reserve Admin (a Squads multisig), MUTAV&apos;s Operator key, or the Investor (the capital provider). The
        pilot runs on MUTAV&apos;s own capital and is not open to public investment. The Investor role is allowlist-gated; in the pilot it is MUTAV&apos;s capital wallet.
      </p>
      <RoleLegend withAnyone />
    </div>
  );
}
