"use client";

/**
 * /operator — the operator console. During the launch and the hackathon,
 * MUTAV's team operates the reserve by hand from here with the operator
 * wallet; later mutav-app's backend sends the same instructions with a
 * KMS-held key. Anyone can read the page; actions are enabled only when the
 * connected wallet is VaultConfig.operator. The wallet signs; nothing here
 * holds a key (compose → wallet → /api/tx/send, as everywhere in the app).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Page, ReadError, Section } from "@/components/Section";
import { ClaimCapChart, ClaimSpeedChart, SolvencyChart } from "@/components/charts/Charts";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { RefreshButton } from "@/components/RefreshButton";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { ActionGate, LiveProvider, Note, useLive } from "@/components/demo/shared";
import { CloseGuaranteeForm, FeeForm, FileClaimForm, IncomeForm, PayClaimList, RegisterForm, SettleList } from "@/components/demo/forms";
import { usePoll } from "@/lib/client/use-poll";
import { fmtBps, fmtBrs, fmtTime } from "@/lib/format";
import { claimCap, claimCapRefusal, claimWork, DUTIES } from "@/lib/operator";
import type { OperatorHistory } from "@/lib/server/operator";
import { claimsTimeline, type Ledger, type ReserveView } from "@/lib/view";

const REVOKED = "11111111111111111111111111111111";

function Framing() {
  const block = (when: string, body: ReactNode) => (
    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 10 }}>
      <p className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)", margin: "0 0 4px" }}>{when}</p>
      <p className="font-body" style={{ fontSize: 14, color: "var(--color-text)", margin: 0, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
  return (
    <div className="grid-2" style={{ gap: 16, marginTop: 14 }}>
      {block("Today · launch and hackathon", <>MUTAV&apos;s team operates the reserve by hand from this page, with the operator wallet. The wallet signs each instruction.</>)}
      {block("Later", <>This moves to MUTAV&apos;s backend: the same instructions, sent automatically by mutav-app with a KMS-held operator key.</>)}
    </div>
  );
}

function Who({ r, history }: { r: ReserveView; history: OperatorHistory | null }) {
  const { address } = useWallet();
  const revoked = r.config.operator === REVOKED;
  const isOperator = !!address && address === r.config.operator;
  const badge = revoked
    ? { color: "var(--color-error)", label: "OPERATOR REVOKED · ACTIONS DISABLED" }
    : isOperator
      ? { color: "var(--color-success)", label: "CONNECTED AS OPERATOR · ACTIONS ENABLED" }
      : { color: "var(--color-copper)", label: address ? "READ-ONLY · THIS WALLET IS NOT THE OPERATOR" : "READ-ONLY · NO WALLET CONNECTED" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusBadge bordered color={badge.color} label={badge.label} />
        {!isOperator && !revoked && <span className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)" }}>Connect the operator wallet to act.</span>}
      </div>
      <Mono dim style={{ fontSize: 12 }}>
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
    </div>
  );
}

// ── Bounds shown before each action ─────────────────────────────────────────

function Bound({ children }: { children: ReactNode }) {
  return (
    <div style={{ border: "1px dashed var(--color-border-input)", padding: "10px 12px", margin: "12px 0 4px", display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="font-mono" style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-3)" }}>Bound before you sign · on-chain</span>
      <div className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

const kv = (k: string, v: ReactNode) => (
  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
    <span>{k}</span>
    <Mono style={{ fontSize: 12 }}>{v}</Mono>
  </div>
);

function PayBound() {
  const { reserve, ledger } = useLive();
  const cap = claimCap(reserve.config, reserve.state, reserve.now);
  const filed = claimsTimeline(ledger).filter((c) => c.stage === "filed");
  return (
    <Bound>
      {kv("Max per call", fmtBrs(cap.perCall))}
      {kv("Left in the last 31 days", `${fmtBrs(cap.remaining)} of ${fmtBrs(cap.perPeriod)}`)}
      {kv("Liquid BRS in the reserve", fmtBrs(reserve.state.brsBalance))}
      {filed.map((c) => {
        const refusal = claimCapRefusal(cap, c.provision);
        return kv(`PREVIEW · ${c.guaranteeId.slice(0, 8)}… ${fmtBrs(c.provision, 0)}`, <span style={{ color: refusal ? "var(--color-error)" : "var(--color-success)" }}>{refusal ? `refused: ${refusal}` : "within the caps"}</span>);
      })}
      <span>Never solvency-gated: under-coverage does not stop a claim payment. The destination is fixed to the payments account.</span>
    </Bound>
  );
}

function SettleBound() {
  const { ledger } = useLive();
  const paid = claimsTimeline(ledger).filter((c) => c.stage === "paid");
  return (
    <Bound>
      {paid.length === 0 && <span>No paid claim waiting for settlement.</span>}
      {paid.map((p) => kv(`${p.guaranteeId.slice(0, 8)}… ${p.leg} · ${fmtBrs(p.amount ?? 0n, 0)}`, <span>paid {p.paidAt !== null ? fmtTime(p.paidAt) : "—"}</span>))}
      <span>The program sets no settlement deadline: the payout SLA is the operator platform&apos;s (ADR 0019).</span>
    </Bound>
  );
}

function RegisterBound() {
  const { reserve } = useLive();
  const c = reserve.config.caps;
  return (
    <Bound>
      {kv("Free capital (new cover must fit)", fmtBrs(reserve.solvency.freeCapital))}
      {kv("Max cover per guarantee", fmtBrs(c.maxCoverPerGuarantee, 0))}
      {kv("Coverage ratio", fmtBps(reserve.config.coverageRatioBps))}
      <span>Refused while paused or under-covered. The gate preview below replays the rules with the client&apos;s math mirror.</span>
    </Bound>
  );
}

function IncomeBound() {
  const { reserve } = useLive();
  return (
    <Bound>
      {kv("Income inbox (paid, not swept)", fmtBrs(reserve.incomeInbox.amount))}
      <span>
        Nora pays the monthly revenue share into the income inbox (<Explorer value={reserve.incomeInbox.address} />), the vault authority&apos;s BRS account. It counts toward nothing until swept. Sweep exactly the amount on the statement: at most the inbox balance, each statement reference once. The vault authority moves it into the reserve; NAV rises for every holder and no shares are minted. Never paused, never gated.
      </span>
    </Bound>
  );
}

function Console({ locked }: { locked: boolean }) {
  const { reserve } = useLive();
  return (
    <ActionGate value={{ locked }}>
      <Tabs defaultValue="register">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="register">register_guarantee</TabsTrigger>
          <TabsTrigger value="fee">contribute_fees</TabsTrigger>
          <TabsTrigger value="income">sweep_income</TabsTrigger>
          <TabsTrigger value="file">file_claim</TabsTrigger>
          <TabsTrigger value="pay">pay_claim</TabsTrigger>
          <TabsTrigger value="settle">settle_payout</TabsTrigger>
          <TabsTrigger value="close">close_guarantee</TabsTrigger>
        </TabsList>
        <TabsContent value="register">
          <RegisterBound />
          <RegisterForm p="op-" />
        </TabsContent>
        <TabsContent value="fee">
          <Bound>
            {kv("Fee take to the treasury", fmtBps(reserve.config.feeTakeBps))}
            <span>Each invoice reference is recorded once (FeeReceipt). Fees are never paused or gated. The BRS comes from the operator wallet&apos;s own BRS account.</span>
          </Bound>
          <FeeForm p="op-" />
        </TabsContent>
        <TabsContent value="income">
          <IncomeBound />
          <IncomeForm p="op-" />
        </TabsContent>
        <TabsContent value="file">
          <Bound>
            <span>The amount may not exceed the leg&apos;s cover not yet paid or provisioned (shown as &quot;left&quot; for each guarantee). Filing lowers NAV at once. Not solvency-gated.</span>
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
  const rows = claimsTimeline(l);
  const work = claimWork(rows);
  const open = rows.filter((c) => c.stage !== "settled");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Mono style={{ fontSize: 12, color: "var(--color-text-2)" }}>
        {work.toPay} filed, waiting for pay_claim · {work.toSettle} paid, waiting for settle_payout
      </Mono>
      <div className="grid-2">
        <ClaimCapChart cap={claimCap(r.config, r.state, r.now)} />
        <div style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", padding: "14px 16px" }}>
          <p className="font-body" style={{ fontSize: 13, fontWeight: 600, margin: "0 0 12px" }}>Room for new guarantees</p>
          <SolvencyChart s={r.solvency} ratioBps={r.config.coverageRatioBps} compact />
        </div>
      </div>
      {open.length > 0 ? <ClaimSpeedChart rows={open} now={r.now} /> : <Note>No claim is waiting for the operator. Settled claims are on <Link href="/reserve#claims" className="ext-link">/reserve</Link>.</Note>}
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
      {item("Caps bound every outflow", <>A stolen operator key can pay claims only to the fixed payments account, at most {fmtBrs(c.maxClaimPerCall, 0)} per call and {fmtBrs(c.maxClaimPerPeriod, 0)} in any 31 days, and only against filed claims within remaining cover. New guarantees stay inside the per-guarantee cap and the solvency gate.</>)}
      {item("The operator cannot touch config or capital", <>Config, caps, roles, the allowlist and the capital queue are Reserve Admin instructions (a time-locked Squads multisig). The operator never signs them.</>)}
      {item("The pauser can revoke it at once", <><Mono>revoke_operator</Mono>, signed by the pauser key or the admin with no time lock, sets the operator to the default key. Every operator instruction then fails, claim payments included, until the Reserve Admin appoints a new key with <Mono>set_roles</Mono>. The pilot binary has no admin-only claim-payment path.</>)}
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
    <Page
      title="Operator"
      lede={
        <>
          <RoleTag role="operator" bordered />
          <Framing />
        </>
      }
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)" }}>Reading the chain…</p>}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), history.refresh()]); } }}>
          <div style={{ padding: "0 0 24px" }}>
            <Who r={d.reserve} history={history.data} />
          </div>
          <Section id="limits" title="Limits now" kicker="Live from the chain" roles={<RoleLine items={[{ role: "admin", prefix: "caps and SLA set by" }]} />} action={<RefreshButton onConfirmed={poll.refresh} />}>
            <Limits r={d.reserve} l={d.ledger} />
          </Section>
          <Section id="console" title="Console" kicker={locked ? "Read-only" : "Operator wallet connected"} roles={<RoleLine items={[{ role: "operator", prefix: "every action signed by" }]}>The program checks the signer; the wallet signs; the app holds no key.</RoleLine>}>
            {locked && <Note tone="warn">Read-only: connect the operator wallet to act. The forms stay visible so anyone can see what the operator can do.</Note>}
            <Console locked={locked} />
            <Note>
              For the six-step story with the gate refusal, see the <Link href="/demo" className="ext-link">guided demo</Link>.
            </Note>
          </Section>
          <Section id="duties" title="Responsibilities" kicker="Today → later">
            <Duties />
          </Section>
          <Section id="activity" title="Recent activity" kicker="Operator transactions">
            <Activity history={history.data} error={history.error} />
          </Section>
          <Section id="safety" title="If the operator key is compromised" kicker="Safety">
            <Safety r={d.reserve} />
          </Section>
        </LiveProvider>
      )}
    </Page>
  );
}
