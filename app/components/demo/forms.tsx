"use client";

/**
 * One form per instruction. Inputs are labels (lease, agency, invoice, notice,
 * PIX end-to-end id) hashed to the 32-byte references the program stores;
 * amounts are BRS. Previews are computed with the client's math mirror from
 * the last read and labelled PREVIEW.
 */
import { useEffect, useMemo, useState } from "react";
import { isValidIncomePeriod, previewRedeemFulfil, takeSplit } from "@mutav-finance/mutav-protocol-solana";
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previewRegisterGuarantee, REFUSAL_TEXT } from "@/lib/gate";
import { fmtBps, fmtBrs, fmtShares, fmtTime, parseBrs } from "@/lib/format";
import { REF } from "@/lib/refs";
import { bytesToHex } from "@/lib/serde";
import { claimsTimeline, DEPOSIT_FULFILLED, GUARANTEE_ACTIVE } from "@/lib/view";
import { Action, Field, Grid, Note, RoleWarning, TextField, useLive } from "./shared";

const hex = (b: ArrayLike<number>) => bytesToHex(Uint8Array.from(b));

function useHash(label: string, fn: (s: string) => Promise<string>) {
  const [h, setH] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!label.trim()) {
      // Clearing the label clears the hash; no async work to wait for.
      void Promise.resolve().then(() => alive && setH(null));
    } else {
      void fn(label.trim()).then((x) => alive && setH(x));
    }
    return () => {
      alive = false;
    };
  }, [label, fn]);
  return h;
}

function PreviewBox({ ok, title, children }: { ok: boolean | null; title: string; children: React.ReactNode }) {
  const color = ok === null ? "var(--color-border)" : ok ? "var(--color-success)" : "var(--color-error)";
  return (
    <div data-testid="gate-preview" style={{ border: `1px solid ${color}`, background: "var(--color-surface)", padding: "12px 14px", margin: "8px 0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="preview-label">Preview · math mirror</span>
        <span className="font-display" style={{ fontSize: 15, color: ok === null ? "var(--color-text-2)" : color }}>
          {title}
        </span>
      </div>
      {children}
      <Note>A preview replays the program&apos;s rules on the last read. The program decides; state can move before the transaction lands.</Note>
    </div>
  );
}

const kv = (k: string, v: string, color?: string) => (
  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
    <span className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)" }}>{k}</span>
    <Mono style={{ fontSize: 12, color }}>{v}</Mono>
  </div>
);

// ── Capital (MUTAV capital wallet + admin) ──────────────────────────────────

export function DepositForm({ p = "" }: { p?: string }) {
  const [amount, setAmount] = useState("10000");
  const assets = parseBrs(amount);
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const outOfRange = assets !== null && (assets < caps.minRequest || assets > caps.maxRequest);
  return (
    <div>
      <Grid>
        <TextField id={`${p}dep-amount`} label="Deposit (BRS)" value={amount} onChange={setAmount} numeric hint={`allowed ${fmtBrs(caps.minRequest, 0)} – ${fmtBrs(caps.maxRequest, 0)} per request`} />
      </Grid>
      {outOfRange && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
      <RoleWarning need="capital" />
      <Action label="request_deposit" request={assets ? { kind: "request_deposit", assets } : null} />
    </div>
  );
}

/** Fulfilled deposit requests still waiting for `claim_shares`. */
export function ClaimSharesList() {
  const { ledger } = useLive();
  const ready = ledger.deposits.filter((d) => d.data.status === DEPOSIT_FULFILLED);
  if (ready.length === 0) return <Note>No fulfilled deposit waiting to be claimed.</Note>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RoleWarning need="capital" />
      {ready.map((d) => (
        <div key={d.address} style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Mono style={{ fontSize: 12 }}>seq {d.data.seq.toString()} · {fmtBrs(d.data.assets)} → {fmtShares(d.data.sharesOut)} shares</Mono>
          <Action label="claim_shares" request={{ kind: "claim_shares", seq: d.data.seq }} variant="outline" />
        </div>
      ))}
    </div>
  );
}

export function PendingDeposits() {
  const { ledger, reserve } = useLive();
  const pending = ledger.deposits.filter((d) => d.data.status === 0).sort((a, b) => Number(a.data.seq - b.data.seq));
  return pending.length === 0 ? (
    <Note>No deposit waiting in the queue.</Note>
  ) : (
    <ul style={{ margin: 0, padding: 0 }}>
      {pending.map((d) => (
        <li key={d.address} style={{ listStyle: "none" }}>
          <Mono style={{ fontSize: 12 }}>
            seq {d.data.seq.toString()} · {fmtBrs(d.data.assets)} from <Explorer value={d.data.owner} />
            {d.data.seq === reserve.state.depositHead ? " · queue head" : ""}
          </Mono>
        </li>
      ))}
    </ul>
  );
}

// ── Guarantees ──────────────────────────────────────────────────────────────

export function RegisterForm({ onRefusedPreview, p = "" }: { onRefusedPreview?: (refused: boolean) => void; p?: string }) {
  const { reserve, ledger } = useLive();
  const n = ledger.guarantees.length + 1;
  const [lease, setLease] = useState(`lease-demo-${String(n).padStart(3, "0")}`);
  const [agency, setAgency] = useState("Imobiliária Paulista");
  const [rent, setRent] = useState("1500");
  const [defMult, setDefMult] = useState("3");
  const [exitMult, setExitMult] = useState("1");
  const agencyHex = useHash(agency, REF.agencyId);

  const rentBase = parseBrs(rent);
  const dm = Number(defMult);
  const em = Number(exitMult);
  const multOk = Number.isInteger(dm * 100) && Number.isInteger(em * 100) && dm >= 0 && em >= 0 && dm <= 6 && em <= 6;
  const defaultCover = rentBase && multOk ? (rentBase * BigInt(Math.round(dm * 100))) / 100n : 0n;
  const exitCover = rentBase && multOk ? (rentBase * BigInt(Math.round(em * 100))) / 100n : 0n;
  const exposure = ledger.exposures.find((e) => hex(e.data.agencyId) === agencyHex);
  const agencyOutstanding = exposure?.data.outstandingCover ?? 0n;

  const preview = useMemo(
    () => (rentBase ? previewRegisterGuarantee(reserve.config, reserve.state, { rent: rentBase, defaultCover, exitCover, agencyOutstanding }) : null),
    [reserve, rentBase, defaultCover, exitCover, agencyOutstanding],
  );
  useEffect(() => onRefusedPreview?.(preview ? !preview.fits : false), [preview, onRefusedPreview]);

  const build = async () => {
    if (!rentBase || !lease.trim()) return null;
    return {
      kind: "register_guarantee" as const,
      id: await REF.guaranteeId(lease.trim()),
      agencyId: await REF.agencyId(agency.trim()),
      refsHash: await REF.refsHash(lease.trim()),
      rent: rentBase,
      defaultMultiplierBps: Math.round(dm * 10_000),
      exitMultiplierBps: Math.round(em * 10_000),
      defaultCover,
      exitCover,
    };
  };

  return (
    <div>
      <Grid>
        <TextField id={`${p}reg-lease`} label="Lease reference" value={lease} onChange={setLease} hint="hashed to the guarantee id" />
        <TextField id={`${p}reg-agency`} label="Agency" value={agency} onChange={setAgency} hint={agencyOutstanding > 0n ? `outstanding ${fmtBrs(agencyOutstanding, 0)}` : "new agency"} />
        <TextField id={`${p}reg-rent`} label="Monthly rent (BRS)" value={rent} onChange={setRent} numeric />
        <TextField id={`${p}reg-def`} label="Default cover (× rent)" value={defMult} onChange={setDefMult} numeric hint={fmtBrs(defaultCover, 0)} />
        <TextField id={`${p}reg-exit`} label="Exit cover (× rent)" value={exitMult} onChange={setExitMult} numeric hint={fmtBrs(exitCover, 0)} />
      </Grid>
      {preview && (
        <PreviewBox ok={preview.fits} title={preview.fits ? "Fits: the program should accept it" : `Would be refused: ${preview.refusal}`}>
          {!preview.fits && preview.refusal && <Note tone="error">{REFUSAL_TEXT[preview.refusal]}</Note>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {kv("New cover", fmtBrs(preview.newCover))}
            {kv("Free capital before", fmtBrs(preview.freeCapitalBefore))}
            {kv("Coverage required after", `${fmtBrs(preview.coverageRequiredAfter)} (${fmtBps(reserve.config.coverageRatioBps)} of cover)`)}
            {kv("Stable assets", fmtBrs(preview.stableAssets))}
            {kv("Headroom after", fmtBrs(preview.headroomAfter < 0n ? -preview.headroomAfter : preview.headroomAfter), preview.headroomAfter < 0n ? "var(--color-error)" : "var(--color-success)")}
          </div>
        </PreviewBox>
      )}
      <RoleWarning need="operator" />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Action label={preview && !preview.fits ? "Send anyway: watch the program refuse it" : "register_guarantee"} variant={preview && !preview.fits ? "outline" : "default"} request={build} disabled={!rentBase || !multOk} onDone={() => setLease(`lease-demo-${String(n + 1).padStart(3, "0")}`)} />
      </div>
    </div>
  );
}

function GuaranteeSelect({ id, value, onChange, filter }: { id: string; value: string; onChange: (v: string) => void; filter?: (g: { openClaims: number; active: boolean }) => boolean }) {
  const { ledger } = useLive();
  const options = ledger.guarantees.filter((g) => (filter ? filter({ openClaims: g.data.openClaims, active: g.data.status === GUARANTEE_ACTIVE }) : g.data.status === GUARANTEE_ACTIVE));
  return (
    <Field id={id} label="Guarantee">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full font-mono">
          <SelectValue placeholder="Choose a guarantee" />
        </SelectTrigger>
        <SelectContent>
          {options.map((g) => (
            <SelectItem key={g.address} value={g.address} className="font-mono">
              {hex(g.data.id).slice(0, 8)}… · default left {fmtBrs(g.data.defaultCover - g.data.defaultPaid - g.data.provisionDefault, 0)} · exit left {fmtBrs(g.data.exitCover - g.data.exitPaid - g.data.provisionExit, 0)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

export function CloseGuaranteeForm({ p = "" }: { p?: string }) {
  const [g, setG] = useState("");
  return (
    <div>
      <Grid>
        <GuaranteeSelect id={`${p}close-g`} value={g} onChange={setG} filter={(x) => x.active && x.openClaims === 0} />
      </Grid>
      <Note>Releases the guarantee&apos;s remaining cover. Refused while it has open claims.</Note>
      <RoleWarning need="operator" />
      <Action label="close_guarantee" request={g ? { kind: "close_guarantee", guarantee: g } : null} variant="outline" />
    </div>
  );
}

// ── Fees ────────────────────────────────────────────────────────────────────

export function FeeForm({ p = "" }: { p?: string }) {
  const { reserve, ledger } = useLive();
  const [invoice, setInvoice] = useState(`INV-2026-${String(ledger.fees.length + 1).padStart(4, "0")}`);
  const [amount, setAmount] = useState("1200");
  const gross = parseBrs(amount);
  const take = gross ? (gross * BigInt(reserve.config.feeTakeBps)) / 10_000n : 0n;
  return (
    <div>
      <Grid>
        <TextField id={`${p}fee-inv`} label="Invoice reference" value={invoice} onChange={setInvoice} hint="each invoice is recorded once" />
        <TextField id={`${p}fee-amt`} label="Guarantee fee received (BRS)" value={amount} onChange={setAmount} numeric />
      </Grid>
      {gross && (
        <PreviewBox ok={null} title="Split">
          {kv(`MUTAV take (${fmtBps(reserve.config.feeTakeBps)}) → treasury`, fmtBrs(take))}
          {kv("Net → reserve (raises NAV for every holder)", fmtBrs(gross - take))}
        </PreviewBox>
      )}
      <RoleWarning need="operator" />
      <Action label="contribute_fees" request={async () => (gross && invoice.trim() ? { kind: "contribute_fees", invoiceRefHash: await REF.invoice(invoice.trim()), amount: gross } : null)} onDone={() => setInvoice(`INV-2026-${String(ledger.fees.length + 2).padStart(4, "0")}`)} />
    </div>
  );
}

// ── Issuer income (ADR 0017) ────────────────────────────────────────────────

/** This month as YYYYMM, from the cluster clock of the last read. */
const periodOf = (unix: bigint) => {
  const d = new Date(Number(unix) * 1000);
  return String(d.getUTCFullYear() * 100 + d.getUTCMonth() + 1);
};

export function IncomeForm({ p = "" }: { p?: string }) {
  const { reserve, ledger } = useLive();
  const [statement, setStatement] = useState(`NORA-${periodOf(reserve.now)}-${String(ledger.income.length + 1).padStart(2, "0")}`);
  const [period, setPeriod] = useState(periodOf(reserve.now));
  const [amount, setAmount] = useState("");
  const gross = parseBrs(amount);
  const inbox = reserve.incomeInbox.amount;
  const month = Number(period);
  const periodOk = isValidIncomePeriod(month);
  const split = gross ? takeSplit(gross, reserve.config.incomeTakeBps) : null;
  const overInbox = gross !== null && gross > inbox;
  return (
    <div>
      <Grid>
        <TextField id={`${p}inc-ref`} label="Nora statement reference" value={statement} onChange={setStatement} hint="each statement is recorded once" />
        <TextField id={`${p}inc-period`} label="Statement month (YYYYMM)" value={period} onChange={setPeriod} numeric />
        <TextField id={`${p}inc-amt`} label="Amount on the statement (BRS)" value={amount} onChange={setAmount} numeric hint={`in the inbox now: ${fmtBrs(inbox)}`} />
      </Grid>
      {split && (
        <PreviewBox ok={overInbox || !periodOk ? false : null} title={overInbox ? "Refused: IncomeExceedsInbox" : !periodOk ? "Refused: the month must be YYYYMM" : "Split"}>
          {kv(`MUTAV take (${fmtBps(reserve.config.incomeTakeBps)}) → treasury`, fmtBrs(split.take))}
          {kv("Net → reserve (raises NAV for every holder)", fmtBrs(split.net))}
          {kv("Left in the inbox, untracked", fmtBrs(overInbox ? inbox : inbox - gross!))}
        </PreviewBox>
      )}
      <RoleWarning need="operator" />
      <Action
        label="sweep_income"
        request={async () => (gross && periodOk && statement.trim() ? { kind: "sweep_income", incomeRefHash: await REF.income(statement.trim()), period: month, amount: gross } : null)}
        onDone={() => setStatement(`NORA-${periodOf(reserve.now)}-${String(ledger.income.length + 2).padStart(2, "0")}`)}
      />
    </div>
  );
}

// ── Claims ──────────────────────────────────────────────────────────────────

export function FileClaimForm({ p = "" }: { p?: string }) {
  const { ledger } = useLive();
  const [g, setG] = useState("");
  const [leg, setLeg] = useState<"0" | "1">("0");
  const [amount, setAmount] = useState("1500");
  const [notice, setNotice] = useState(`notice-demo-${ledger.filings.length + 1}`);
  const value = parseBrs(amount);
  return (
    <div>
      <Grid>
        <GuaranteeSelect id={`${p}fc-g`} value={g} onChange={setG} />
        <Field id={`${p}fc-leg`} label="Leg">
          <Select value={leg} onValueChange={(v) => setLeg(v as "0" | "1")}>
            <SelectTrigger id={`${p}fc-leg`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">default (rent arrears)</SelectItem>
              <SelectItem value="1">exit (property recovery)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <TextField id={`${p}fc-amt`} label="Claim amount (BRS)" value={amount} onChange={setAmount} numeric />
        <TextField id={`${p}fc-notice`} label="Notice reference" value={notice} onChange={setNotice} hint="one filing and one payment per notice" />
      </Grid>
      <Note>Filing books a provision: NAV drops immediately, before any money moves. Not solvency-gated.</Note>
      <RoleWarning need="operator" />
      <Action
        label="file_claim"
        request={async () => (g && value && notice.trim() ? { kind: "file_claim", guarantee: g, leg: Number(leg) as 0 | 1, amount: value, noticeRefHash: await REF.notice(notice.trim()) } : null)}
        onDone={() => setNotice(`notice-demo-${ledger.filings.length + 2}`)}
      />
    </div>
  );
}

/** Filed, unpaid claims, each with a Pay button (`pay_claim` for the filed provision). */
export function PayClaimList() {
  const { reserve, ledger } = useLive();
  const open = claimsTimeline(ledger, reserve.config.payoutSlaSecs, reserve.now).filter((c) => c.stage === "filed");
  if (open.length === 0) return <Note>No filed claim waiting for payment. File one first.</Note>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <RoleWarning need="operator" />
      {open.map((c) => (
        <div key={c.filing} style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Mono style={{ fontSize: 12, minWidth: 280 }}>
            {c.guaranteeId.slice(0, 8)}… · {c.leg} leg · {fmtBrs(c.provision)} · filed {fmtTime(c.filedAt)}
          </Mono>
          <Action label={`pay_claim ${fmtBrs(c.provision, 0)}`} request={{ kind: "pay_claim", guarantee: c.guarantee, leg: c.leg === "exit" ? 1 : 0, amount: c.provision, noticeRefHash: c.noticeRefHash }} />
        </div>
      ))}
    </div>
  );
}

/** Paid claims waiting for the PIX settlement record. */
export function SettleList() {
  const { reserve, ledger } = useLive();
  const paid = claimsTimeline(ledger, reserve.config.payoutSlaSecs, reserve.now).filter((c) => c.stage === "paid");
  const [e2e, setE2e] = useState<Record<string, string>>({});
  if (paid.length === 0) return <Note>No paid claim waiting for settlement.</Note>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <RoleWarning need="operator" />
      {paid.map((c) => {
        const id = e2e[c.filing] ?? `E12345678${new Date().toISOString().slice(0, 10).replace(/-/g, "")}demo${c.noticeRefHash.slice(0, 6)}`;
        return (
          <div key={c.filing} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Mono style={{ fontSize: 12 }}>
              {c.guaranteeId.slice(0, 8)}… · {c.leg} leg · {fmtBrs(c.amount ?? 0n)} paid {fmtTime(c.paidAt ?? 0n)} {c.overdue ? "· past the SLA" : ""}
            </Mono>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 320 }}>
                <TextField id={`pix-${c.filing}`} label="PIX end-to-end id" value={id} onChange={(v) => setE2e((m) => ({ ...m, [c.filing]: v }))} hint="only its SHA-256 goes on-chain" />
              </div>
              <Action label="settle_payout" request={async () => ({ kind: "settle_payout", guarantee: c.guarantee, noticeRefHash: c.noticeRefHash, pixE2eHash: await REF.pixE2e(id.trim()) })} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Under-coverage previews ─────────────────────────────────────────────────

export function BlockedPreview() {
  const { reserve, ledger } = useLive();
  const reg = previewRegisterGuarantee(reserve.config, reserve.state, { rent: 1_000_000_000n, defaultCover: 3_000_000_000n, exitCover: 1_000_000_000n, agencyOutstanding: 0n });
  const heads = ledger.redeems
    .filter((r) => r.data.sharesRemaining > 0n)
    .sort((a, b) => Number(a.data.seq - b.data.seq))
    .map((r) => ({ seq: r.data.seq, sharesRemaining: r.data.sharesRemaining, requestedAt: r.data.requestedAt }));
  const red = previewRedeemFulfil(reserve.config, reserve.state, heads.length ? heads : [{ seq: 0n, sharesRemaining: 1_000_000n, requestedAt: reserve.now }], { now: reserve.now });
  return (
    <PreviewBox ok={reg.fits && red.stoppedBy === null} title={reserve.state.mode === 0 && !reserve.solvency.underCovered ? "Reserve covered: gated actions open" : "Under-covered: gated actions blocked"}>
      {kv("New guarantee (R$4,000 cover)", reg.fits ? "would be accepted" : `refused: ${reg.refusal}`, reg.fits ? "var(--color-success)" : "var(--color-error)")}
      {kv(heads.length ? "Redemption fill (queue head)" : "Redemption fill (hypothetical 1 share)", red.stoppedBy ? `refused: ${red.stoppedBy}` : "would be filled", red.stoppedBy ? "var(--color-error)" : "var(--color-success)")}
      {kv("Claim payment", "never solvency-gated", "var(--color-success)")}
    </PreviewBox>
  );
}

