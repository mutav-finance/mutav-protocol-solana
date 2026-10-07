"use client";

/**
 * /demo — the operator cockpit. Six guided steps for the demo video, then a
 * free-form panel with every operator instruction. Every step shows the
 * instruction, the accounts it touched, the transaction link and how the
 * reserve numbers moved (TxStatus + Moves inside each Action).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Page, ReadError, Section } from "@/components/Section";
import { MetricCard } from "@/components/MetricCard";
import { RefreshButton } from "@/components/RefreshButton";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { navPerShare } from "@mutav-finance/mutav-protocol-solana";
import { usePoll } from "@/lib/client/use-poll";
import { CLUSTER } from "@/lib/client/env";
import { fmtBrs, fmtNav } from "@/lib/format";
import { MODE_LABEL, type Ledger, type ReserveView } from "@/lib/view";
import { BlockedPreview, ClaimSharesList, CloseGuaranteeForm, DepositForm, FeeForm, FileClaimForm, PayClaimList, PendingDeposits, RegisterForm, SettleList } from "./forms";
import { LiveProvider, Note, rolesOf } from "./shared";

function Step({ n, title, instruction, children, why }: { n: number; title: string; instruction: string; why: ReactNode; children: ReactNode }) {
  return (
    <article id={`step-${n}`} aria-labelledby={`step-${n}-h`} style={{ border: "1px solid var(--color-border)", background: "var(--color-canvas)", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <span className="font-mono" style={{ fontSize: 12, color: "var(--color-accent)" }}>{String(n).padStart(2, "0")}</span>
        <h3 id={`step-${n}-h`} style={{ fontSize: 18, margin: 0 }}>{title}</h3>
        <code className="font-mono" style={{ fontSize: 12, color: "var(--color-copper)" }}>{instruction}</code>
      </header>
      <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", margin: 0, lineHeight: 1.6, maxWidth: 860 }}>{why}</p>
      {children}
    </article>
  );
}

function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: "1px dashed var(--color-border)", paddingTop: 12 }}>
      <p className="font-body" style={{ fontSize: 12, fontWeight: 600, margin: "0 0 6px", color: "var(--color-text)" }}>{title}</p>
      {children}
    </div>
  );
}

function Ticker({ r }: { r: ReserveView }) {
  const s = r.state;
  return (
    <div className="grid-metrics" data-testid="demo-ticker">
      <MetricCard dense label="Stable assets" value={fmtBrs(r.solvency.stableAssets)} />
      <MetricCard dense label="Coverage required" value={fmtBrs(r.solvency.coverageRequired)} />
      <MetricCard dense label="Free capital" value={fmtBrs(r.solvency.freeCapital)} />
      <MetricCard dense label="Provisions" value={fmtBrs(s.provisions)} />
      <MetricCard dense label="NAV (from accounts)" value={fmtNav(navPerShare(r.solvency.netAssets, s.sharesOutstanding))} />
      <MetricCard dense label="Mode" value={MODE_LABEL(s.mode)} />
    </div>
  );
}

function WhoAmI({ r }: { r: ReserveView }) {
  const { address } = useWallet();
  const roles = rolesOf(address, r);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <StatusBadge bordered color={roles.length ? "var(--color-success)" : "var(--color-text-3)"} label={address ? (roles.length ? `CONNECTED AS ${roles.join(" + ").toUpperCase()}` : "CONNECTED · NO CONFIGURED ROLE") : "NO WALLET CONNECTED"} />
      {CLUSTER === "localnet" && (
        <span className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)" }}>
          Localnet: import the throwaway keys printed by <code className="font-mono">bun run localnet:up</code> into your wallet.
        </span>
      )}
    </div>
  );
}

export function DemoPage() {
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 6_000);
  const d = poll.data;
  return (
    <Page
      title="Run the demo"
      lede={
        <>
          The full guarantee flow on the live program, from the operator wallet. Each step sends one instruction and shows the accounts it touched, the
          transaction and how the reserve numbers moved. <Link href="/reserve" className="ext-link">The reserve page</Link> shows the same accounts to
          everyone.
        </>
      }
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)" }}>Reading the chain…</p>}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: poll.refresh }}>
          <div style={{ position: "sticky", top: 56, zIndex: 50, background: "var(--color-canvas)", padding: "12px 0", borderBottom: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: 10 }}>
            <WhoAmI r={d.reserve} />
            <Ticker r={d.reserve} />
          </div>

          <Section id="guided" title="Guided demo" kicker="Six steps">
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Step n={1} title="Capital in" instruction="request_deposit → fulfil_deposits → claim_shares" why={<>MUTAV&apos;s allowlisted capital wallet requests a deposit. It waits in the FIFO queue until the admin multisig fulfils it at the NAV of that moment; then the wallet claims its shares. Same path as any investor: no special door for MUTAV.</>}>
                <Sub title="a. Request (MUTAV capital wallet)"><DepositForm /></Sub>
                <Sub title="b. Fulfil (admin)">
                  <PendingDeposits />
                  <Note>The admin is a Squads multisig: fulfil it from <Link href="/admin#actions" className="ext-link">/admin</Link> as a proposal{CLUSTER === "localnet" ? " (or by direct signing on localnet)" : ""}.</Note>
                </Sub>
                <Sub title="c. Claim shares (MUTAV capital wallet)"><ClaimSharesList /></Sub>
              </Step>

              <Step n={2} title="Register guarantees, until the gate refuses one" instruction="register_guarantee" why={<>Each new guarantee must fit in free capital: coverage required after the registration may not exceed stable assets. The preview replays that rule with the client&apos;s math mirror. Register until it says &quot;would be refused&quot;, then send it anyway: the program refuses it on-chain. That refusal is the point.</>}>
                <RegisterForm />
              </Step>

              <Step n={3} title="Guarantee fee" instruction="contribute_fees" why={<>A guarantee fee comes in. MUTAV&apos;s take goes straight to the treasury; the rest goes into the reserve, so NAV rises for every shareholder. Fees never mint shares.</>}>
                <FeeForm />
              </Step>

              <Step n={4} title="Claim filed" instruction="file_claim" why={<>A landlord&apos;s rent is unpaid and the claim is approved. Filing books a provision against the guarantee: NAV drops immediately, before any money leaves the reserve, so nobody enters or exits at a price that ignores a known loss.</>}>
                <FileClaimForm />
              </Step>

              <Step n={5} title="Under-coverage: claims are still paid" instruction="pay_claim (with mode = UnderCovered)" why={<>When stable assets fall below coverage required, the reserve is under-covered: new guarantees and redemptions are frozen. Claim payments are not. They never pass the solvency gate.</>}>
                <Sub title="a. Put the reserve under coverage">
                  <BlockedPreview />
                  <Note>
                    {CLUSTER === "localnet" ? (
                      <>Seeded scenario: run <code className="font-mono">bun scripts/localnet.ts scenario under-covered</code> (raises the coverage ratio to 150% through <code className="font-mono">set_config</code>), or raise it from <Link href="/admin#actions" className="ext-link">/admin</Link>. Restore with <code className="font-mono">scenario normal</code>.</>
                    ) : (
                      <>On devnet the coverage ratio is raised through a Squads <code className="font-mono">set_config</code> proposal from <Link href="/admin#actions" className="ext-link">/admin</Link>.</>
                    )}
                  </Note>
                </Sub>
                <Sub title="b. Pay the filed claim (it succeeds)"><PayClaimList /></Sub>
              </Step>

              <Step n={6} title="Settle by PIX" instruction="settle_payout" why={<>MUTAV offramps the BRS and pays the agency by PIX, then records the hash of the PIX end-to-end id on-chain. The claims timeline on /reserve now shows filed → paid → settled, each with its on-chain timestamp, and flags any settlement past the SLA.</>}>
                <SettleList />
                <Note><Link href="/reserve#claims" className="ext-link">Open the claims timeline →</Link></Note>
              </Step>
            </div>
          </Section>

          <Section id="panel" title="Operator panel" kicker="Free-form" info="Every operator instruction, outside the script. The program checks the signer; this page only warns." action={<RefreshButton onConfirmed={poll.refresh} />}>
            <Tabs defaultValue="register">
              <TabsList className="flex-wrap h-auto">
                <TabsTrigger value="register">register_guarantee</TabsTrigger>
                <TabsTrigger value="fee">contribute_fees</TabsTrigger>
                <TabsTrigger value="file">file_claim</TabsTrigger>
                <TabsTrigger value="pay">pay_claim</TabsTrigger>
                <TabsTrigger value="settle">settle_payout</TabsTrigger>
                <TabsTrigger value="close">close_guarantee</TabsTrigger>
              </TabsList>
              <TabsContent value="register"><RegisterForm p="panel-" /></TabsContent>
              <TabsContent value="fee"><FeeForm p="panel-" /></TabsContent>
              <TabsContent value="file"><FileClaimForm p="panel-" /></TabsContent>
              <TabsContent value="pay"><PayClaimList /></TabsContent>
              <TabsContent value="settle"><SettleList /></TabsContent>
              <TabsContent value="close"><CloseGuaranteeForm p="panel-" /></TabsContent>
            </Tabs>
          </Section>
        </LiveProvider>
      )}
    </Page>
  );
}
