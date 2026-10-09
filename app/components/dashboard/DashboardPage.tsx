"use client";

/**
 * /dashboard — the capital provider's view (the Investor role). Everyone can
 * read it; only a wallet whose Merkle proof verifies against the on-chain
 * allowlist root can send `request_deposit` / `request_redeem` (the server
 * builds the proof from ALLOWLIST). Cancels and claims need only the request's
 * owner (spec §5.5). The pilot runs on MUTAV's own capital and is not open to
 * public investment; its allowlisted capital provider is MUTAV's capital wallet.
 *
 * The page answers three questions in order: what do I hold (the position
 * hero), what can I do now (the sticky action panel), what is waiting (the
 * queue entries). Layout: header band, then an 8-column reading column beside
 * a 4-column action panel (ui-reference §1, Morpho / Aave / Kamino). Below
 * 1024px the panel stacks right under the hero. Same reads and requests as
 * before.
 */
import { ImageSlot, type ImageSlotName } from "@/components/ImageSlot";
import { ReadError } from "@/components/Section";
import { useWallet } from "@/components/WalletProvider";
import { LiveProvider } from "@/components/demo/shared";
import { usePoll } from "@/lib/client/use-poll";
import type { InvestorView } from "@/lib/server/investor";
import { investorRequests, type Ledger, type ReserveView } from "@/lib/view";
import { AccessGate } from "./AccessGate";
import { ActionPanel } from "./ActionPanel";
import { PositionHero } from "./PositionHero";
import { QueueEntries } from "./QueueEntries";
import { MOCK, splitPosition } from "./shared";

/** Header image slot (decorative, behind the title only). */
const HEADER_SLOT: ImageSlotName = "dashboard-header";

/** Static blocks in the final geometry while the first read is in flight (no spinner, no shimmer). */
function Skeleton() {
  const block = (cls: string) => <div className={`bg-(--color-surface) border ${cls}`} />;
  return (
    <div aria-busy="true" aria-label="Reading the chain" className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <span className="sr-only">Reading the chain…</span>
      <div className="flex flex-col gap-6 lg:col-span-8">
        {block("h-[288px]")}
        {block("h-[240px]")}
      </div>
      <div className="lg:col-span-4">{block("h-[480px]")}</div>
    </div>
  );
}

export function DashboardPage() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const d = poll.data;
  const previewOwner = !address && MOCK && d ? d.reserve.config.mutavCapitalWallet : null;
  const owner = address ?? previewOwner;
  const connected = !!address;
  const inv = usePoll<InvestorView>(`/api/investor${owner ? `?owner=${owner}` : ""}`, 10_000);
  const invData = inv.data && inv.data.owner === owner ? inv.data : null;
  const mine = d && owner ? investorRequests(owner, d.reserve.state, d.ledger) : [];
  const position = d && owner ? splitPosition(d.reserve, invData, mine) : null;
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };

  return (
    <main className="flex w-full flex-1 flex-col gap-6 py-8" style={pad}>
      {d && <AccessGate key={`${address ?? "none"}-${invData?.allowlist.state ?? "?"}`} connected={connected} state={invData?.allowlist.state ?? null} />}

      {/* [A] Header band: title and the one line every investor-facing page leads with. The image sits behind the title only, never behind numbers. */}
      <ImageSlot slot={HEADER_SLOT} aspect="6:1" className="min-h-[136px]">
        <header className="flex flex-col gap-2 px-6 pt-12 pb-6">
          <h1 className="font-display text-(--color-text) m-0 text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="font-body text-(--color-text-2) m-0 max-w-[60ch] text-sm">
            Your position in the pilot reserve. The pilot runs on MUTAV&apos;s own capital and is not open to public investment.
          </p>
        </header>
      </ImageSlot>

      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <Skeleton />}

      {d && (
        <LiveProvider
          value={{
            reserve: d.reserve,
            ledger: d.ledger,
            refresh: async () => {
              await Promise.all([poll.refresh(), inv.refresh()]);
            },
          }}
        >
          {/* DOM order hero → panel → detail, so phones stack the panel under the hero; on lg the panel spans both rows and sticks. */}
          <div className="grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
            <div className="min-w-0 lg:col-span-8 lg:row-start-1">
              <PositionHero
                position={position}
                inv={invData}
                owner={owner}
                asOf={poll.updatedAt}
                error={inv.error && !inv.data ? <ReadError error={inv.error} /> : undefined}
              />
            </div>
            <div className="min-w-0 self-stretch lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1">
              <ActionPanel inv={invData} owner={owner} connected={connected} mine={mine} />
            </div>
            <div className="min-w-0 lg:col-span-8 lg:row-start-2">
              <QueueEntries rows={mine} owner={owner} connected={connected} inv={invData} />
            </div>
          </div>
        </LiveProvider>
      )}
    </main>
  );
}
