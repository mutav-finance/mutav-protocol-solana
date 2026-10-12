"use client";

/**
 * /operator — the operator console. During the launch and the hackathon,
 * MUTAV's team operates the reserve by hand from here with the operator
 * wallet; later mutav-app's backend sends the same instructions with a
 * KMS-held key. Anyone can read the page; actions are enabled only when the
 * connected wallet is VaultConfig.operator. The wallet signs; nothing here
 * holds a key (compose → the wallet signs and sends, as everywhere in the app).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Page, ReadError, Section } from "@/components/Section";
import { ClaimCapChart, ClaimSpeedChart, CoverageChart } from "@/components/charts/Charts";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { RefreshButton } from "@/components/RefreshButton";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { MetricCard } from "@/components/MetricCard";
import { Money, MoneyProvider } from "@/components/MoneyProvider";
import { ReserveStats } from "@/components/ReserveStats";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { ActionGate, IxText, LiveProvider, Note, useLive } from "@/components/demo/shared";
import { CloseGuaranteeForm, FeeForm, FileClaimForm, IncomeForm, PayClaimList, RegisterForm, SettleList } from "@/components/demo/forms";
import { usePoll } from "@/lib/client/use-poll";
import { fmtBrs, fmtPct, fmtTime } from "@/lib/format";
import { ixLabel } from "@/lib/tx-kinds";
import { CLUSTER } from "@/lib/client/env";
import { claimCap, claimCapRefusal, claimWork, DUTIES } from "@/lib/operator";
import type { OperatorHistory } from "@/lib/server/operator";
import { claimsTimeline, isUnpaid, type Ledger, type ReserveView } from "@/lib/view";

const REVOKED = "11111111111111111111111111111111";

/** The connected wallet against VaultConfig.operator, as a status badge. */
function Who({ r }: { r: ReserveView }) {
  const { address } = useWallet();
  const revoked = r.config.operator === REVOKED;
  const isOperator = !!address && address === r.config.operator;
  const badge = revoked
    ? { color: "var(--color-error)", label: "OPERATOR REVOKED · ACTIONS DISABLED" }
    : isOperator
      ? { color: "var(--color-success)", label: "CONNECTED AS OPERATOR · ACTIONS ENABLED" }
      : { color: "var(--color-text-3)", label: address ? "READ-ONLY · THIS WALLET IS NOT THE OPERATOR" : "READ-ONLY · NO WALLET CONNECTED" };
  return (
    <>
      <StatusBadge bordered color={badge.color} label={badge.label} />
      {!isOperator && !revoked && <span className="font-body text-(--color-text-2) order-last text-[13px]">Connect the operator wallet to act.</span>}
    </>
  );
}

/** Developer detail: the operator key and its last role handover, folded away. */
function KeyDetails({ r, history }: { r: ReserveView; history: OperatorHistory | null }) {
  return (
    <details className="border-t pt-3">
      <summary className="font-body text-(--color-text-2) hover:text-(--color-text) cursor-pointer text-xs select-none">Details</summary>
      <Mono dim style={{ fontSize: 12, display: "block", marginTop: 8 }}>
        operator key <Explorer value={r.config.operator} />
        {" · "}
        {history === null
          ? "reading role-handover history…"
          : history.rolesChanged
            ? <>last accept_role <Explorer value={history.rolesChanged.signature} kind="tx" label={history.rolesChanged.blockTime !== null ? fmtTime(history.rolesChanged.blockTime) : "tx"} /></>
            : history.rolesScanned === 0
              ? "this RPC keeps no VaultConfig history, so the last accept_role cannot be read"
              : `no accept_role in VaultConfig's last ${history.rolesScanned} transactions`}
      </Mono>
    </details>
  );
}

// ── Bounds shown before each action ─────────────────────────────────────────

function Bound({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--color-border-input)", padding: "10px 12px", margin: "12px 0 16px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)" }}>Bound before you sign · on-chain</span>
      <div className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

const kv = (k: string, v: ReactNode) => (
  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", maxWidth: 640 }}>
    <span>{k}</span>
    <Mono style={{ fontSize: 12 }}>{v}</Mono>
  </div>
);

function PayBound() {
  const { reserve, ledger } = useLive();
  const cap = claimCap(reserve.config, reserve.state, reserve.now);
  const filed = claimsTimeline(ledger).filter((c) => isUnpaid(c.stage));
  return (
    <Bound>
      {kv("Max per call", fmtBrs(cap.perCall))}
      {kv("Left in the last 31 days", `${fmtBrs(cap.remaining)} of ${fmtBrs(cap.perPeriod)}`)}
      {kv("Reserve balance (liquid BRS)", fmtBrs(reserve.state.brsBalance))}
      {filed.map((c) => {
        const refusal = claimCapRefusal(cap, c.provision, c.approvedAmount);
        return kv(`Preview · ${c.guaranteeId.slice(0, 8)}… ${fmtBrs(c.provision)}`, <span style={{ color: refusal ? "var(--color-error)" : "var(--color-success)" }}>{refusal ? `refused: ${refusal}` : "within the caps"}</span>);
      })}
      <span>Never gated by required coverage: under-coverage does not stop a claim payment. The destination is fixed to the payments account.</span>
    </Bound>
  );
}

function SettleBound() {
  const { ledger } = useLive();
  const paid = claimsTimeline(ledger).filter((c) => c.stage === "paid");
  return (
    <Bound>
      {paid.map((p) => kv(`${p.guaranteeId.slice(0, 8)}… ${p.leg} · ${fmtBrs(p.amount ?? 0n)}`, <span>paid {p.paidAt !== null ? fmtTime(p.paidAt) : "—"}</span>))}
      <span>Records the PIX that paid the landlord: only the hash of its end-to-end id goes on-chain. The program sets no settlement deadline (ADR 0019).</span>
    </Bound>
  );
}

function RegisterBound() {
  const { reserve } = useLive();
  const c = reserve.config.caps;
  return (
    <Bound>
      {kv("Free capital (new cover must fit)", fmtBrs(reserve.coverage.freeCapital))}
      {kv("Max cover per guarantee", fmtBrs(c.maxCoverPerGuarantee))}
      {kv("Coverage ratio", fmtPct(reserve.config.coverageRatioBps))}
      <span>Refused while paused or under-covered. The preview replays the program&apos;s rules on the last read.</span>
    </Bound>
  );
}

function IncomeBound() {
  const { reserve } = useLive();
  return (
    <Bound>
      {kv("Income inbox (paid, not swept)", fmtBrs(reserve.incomeInbox.amount))}
      <span>
        Nora pays the monthly revenue share into the income inbox (<Explorer value={reserve.incomeInbox.address} />), the vault authority&apos;s BRS account. It counts toward nothing until swept. Sweep exactly the amount on the statement: at most the inbox balance, each statement reference once. The vault authority moves all of it into the reserve, which raises the coverage ceiling; no shares are minted. Never paused, never gated.
      </span>
    </Bound>
  );
}

/** The console tabs: a sentence-case name with the instruction as a mono sub-label. */
const TABS = [
  ["register", "register_guarantee"],
  ["fee", "contribute_fees"],
  ["income", "sweep_income"],
  ["file", "file_claim"],
  ["pay", "pay_claim"],
  ["settle", "settle_payout"],
  ["close", "close_guarantee"],
] as const;

function Console({ locked }: { locked: boolean }) {
  const { reserve } = useLive();
  return (
    <ActionGate value={{ locked }}>
      <Tabs defaultValue="register">
        <TabsList className="h-auto flex-wrap">
          {TABS.map(([v, ix]) => (
            <TabsTrigger key={v} value={v} className="items-start">
              <IxText label={ixLabel(ix)} ix={ix} stacked />
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="register">
          <RegisterForm p="op-" aside={<RegisterBound />} />
        </TabsContent>
        <TabsContent value="fee">
          <Bound>
            {kv("MUTAV take to the treasury", fmtPct(reserve.config.feeTakeBps))}
            <span>MUTAV&apos;s share of each guarantee fee; the rest goes to the reserve. Issuer income goes 100% to the reserve. Each invoice reference is recorded once (FeeReceipt). Fees are never paused or gated. The BRS comes from the operator wallet&apos;s own BRS account.</span>
          </Bound>
          <FeeForm p="op-" />
        </TabsContent>
        <TabsContent value="income">
          <IncomeBound />
          <IncomeForm p="op-" />
        </TabsContent>
        <TabsContent value="file">
          <Bound>
            <span>The amount may not exceed the leg&apos;s cover not yet paid or provisioned (shown as &quot;left&quot; for each guarantee). Filing lowers the share price at once. Not gated by required coverage.</span>
          </Bound>
          <FileClaimForm p="op-" />
        </TabsContent>
        <TabsContent value="pay">
          <PayBound />
          <PayClaimList />
        </TabsContent>
        <TabsContent value="settle">
          <SettleBound />
          <SettleList />
        </TabsContent>
        <TabsContent value="close">
          <Bound>
            <span>Only an active guarantee with no open claims. Releases its remaining cover.</span>
          </Bound>
          <CloseGuaranteeForm p="op-" />
        </TabsContent>
      </Tabs>
    </ActionGate>
  );
}

// ── Live limits, duties, activity, safety ───────────────────────────────────

function Limits({ r, l }: { r: ReserveView; l: Ledger }) {
  const rows = claimsTimeline(l, r.config.caps.maxClaimPerCall);
  const work = claimWork(rows);
  const open = rows.filter((c) => c.stage !== "settled");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <MetricCard dense label="Claims to pay" tooltip="Filed, waiting for pay_claim." value={String(work.toPay)} />
        <MetricCard dense label="Claims to settle" tooltip="Paid, waiting for settle_payout (the PIX record)." value={String(work.toSettle)} />
        <MetricCard dense label="Free capital" tooltip="New cover must fit in it." value={<Money brs={r.coverage.freeCapital} block />} />
      </div>
      <div className="grid-2">
        <ClaimCapChart cap={claimCap(r.config, r.state, r.now)} />
        <div style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", padding: 24 }}>
          <p className="font-body" style={{ fontSize: 12, fontWeight: 500, letterSpacing: "0.01em", textTransform: "uppercase", color: "var(--color-text-2)", margin: "0 0 16px", lineHeight: 1.4 }}>Room for new guarantees</p>
          <CoverageChart s={r.coverage} ratioBps={r.config.coverageRatioBps} compact />
        </div>
      </div>
      {open.length > 0 ? <ClaimSpeedChart rows={open} now={r.now} /> : <Note>No claim is waiting for the operator. Settled claims are on <Link href="/reserve/claims" className="ext-link">/reserve/claims</Link>.</Note>}
    </div>
  );
}

function Duties() {
  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Operator duties">
        <thead>
          <tr>
            <th>Instruction</th>
            <th>Today, by hand</th>
            <th>Later, in the backend</th>
            <th>Bounded on-chain by</th>
          </tr>
        </thead>
        <tbody>
          {DUTIES.map((d) => (
            <tr key={d.ix}>
              <td><Mono>{d.ix}</Mono></td>
              {[d.today, d.later, d.bound].map((t, i) => (
                <td key={i} className="font-body" style={{ whiteSpace: "normal", fontSize: 12, minWidth: 220, color: i === 2 ? "var(--color-text-2)" : "var(--color-text)" }}>{t}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Activity({ history, error }: { history: OperatorHistory | null; error: Error | null }) {
  if (error && !history) return <ReadError error={error} />;
  if (!history) return <Note>Reading the operator&apos;s transactions…</Note>;
  if (history.activity.length === 0) {
    return <Note>This RPC returned no MUTAV transaction signed by the operator key. Its last 20 transactions show here once the RPC keeps history for it.</Note>;
  }
  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Recent operator activity">
        <thead>
          <tr>
            <th>When</th>
            <th>Instructions</th>
            <th>Result</th>
            <th>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {history.activity.map((a) => (
            <tr key={a.signature}>
              <td><Mono dim>{a.blockTime !== null ? fmtTime(a.blockTime) : "—"}</Mono></td>
              <td><Mono>{a.instructions.join(", ")}</Mono></td>
              <td><Mono style={{ color: a.ok ? "var(--color-success)" : "var(--color-error)" }}>{a.ok ? "ok" : "failed"}</Mono></td>
              <td><Explorer value={a.signature} kind="tx" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Safety({ r }: { r: ReserveView }) {
  const c = r.config.caps;
  const item = (title: string, body: ReactNode) => (
    <li style={{ listStyle: "none", borderLeft: "2px solid var(--color-border)", padding: "2px 0 2px 14px" }}>
      <p className="font-body" style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px" }}>{title}</p>
      <div className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", lineHeight: 1.6 }}>{body}</div>
    </li>
  );
  return (
    <ul style={{ margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 18, maxWidth: 860 }}>
      {item("Issuer income only moves into the reserve", <>The operator key can move income-inbox BRS only into the reserve (there is no take on issuer income). At worst a stolen key books a stray transfer as income. No instruction lets anyone take BRS out of the inbox elsewhere.</>)}
      {item("Caps bound every outflow", <>A stolen operator key can pay claims only to the fixed payments account, at most {fmtBrs(c.maxClaimPerCall)} per call and {fmtBrs(c.maxClaimPerPeriod)} in any 31 days, and only against filed claims within remaining cover. New guarantees stay inside the per-guarantee cap and the coverage gate.</>)}
      {item("The operator cannot touch config or capital", <>Config, caps, roles, the allowlist and the capital queue are Reserve Admin instructions (a time-locked Squads multisig). The operator never signs them.</>)}
      {item("The pauser can revoke it at once", <><Mono>revoke_operator</Mono>, signed by the pauser key or the admin with no time lock, clears the operator key. Every operator instruction then fails, claim payments included, until the Reserve Admin proposes a new key with <Mono>propose_role</Mono> and that key takes the role with <Mono>accept_role</Mono>. The pilot binary has no admin-only claim-payment path.</>)}
      {item("Everything it does is public", <>Every guarantee, fee, claim, payment and settlement is an account on <Link href="/reserve" className="ext-link">/reserve</Link>, with its on-chain timestamps.</>)}
    </ul>
  );
}

export function OperatorPage() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 8_000);
  const history = usePoll<OperatorHistory>("/api/operator", 20_000);
  const d = poll.data;
  const locked = !d || !address || address !== d.reserve.config.operator || d.reserve.config.operator === REVOKED;
  return (
    <MoneyProvider>
    <Page
      kicker={`Operator · Solana ${CLUSTER}`}
      title="Operator"
      lede={
        <>
          MUTAV&apos;s team runs the reserve by hand from this page; the operator wallet signs each step. Later, a backend signs with a key held in a secure key service (KMS).
        </>
      }
      aside={
        <div className="flex flex-wrap items-start gap-3">
          <RoleTag role="operator" bordered />
          <RefreshButton onConfirmed={poll.refresh} />
        </div>
      }
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)" }}>Reading the chain…</p>}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), history.refresh()]); } }}>
          <ReserveStats r={d.reserve} badges={<Who r={d.reserve} />} />
          <Section id="console" title="Console" kicker={locked ? "Read-only" : "Operator wallet connected"} action={<RoleLine items={[{ role: "operator", prefix: "every action signed by" }]}>The program checks the signer; the wallet signs; the app holds no key.</RoleLine>}>
            {d && address && address === d.reserve.config.pendingOperator && (
              <Note tone="ok">
                This wallet is the proposed operator key: take the role with accept_role on <Link href="/admin#general-handovers" className="ext-link">/admin → Pending handovers</Link> (ADR 0020).
              </Note>
            )}
            <Console locked={locked} />
          </Section>
          <Section id="limits" title="Limits now" kicker="Live from the chain" roles={<RoleLine items={[{ role: "admin", prefix: "caps set by" }]} />}>
            <Limits r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="duties" title="Responsibilities" kicker="Today → later">
            <Duties />
          </Section>
          <Section id="activity" title="Recent activity" kicker="Operator transactions">
            <Activity history={history.data} error={history.error} />
            <KeyDetails r={d.reserve} history={history.data} />
          </Section>
          <Section id="safety" title="If the operator key is compromised" kicker="Safety">
            <Safety r={d.reserve} />
          </Section>
        </LiveProvider>
      )}
    </Page>
    </MoneyProvider>
  );
}
