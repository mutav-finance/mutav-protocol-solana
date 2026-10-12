"use client";

/**
 * One form per instruction. Inputs are labels (lease, invoice, notice, PIX
 * end-to-end id) hashed to the 32-byte references the program stores, and
 * the agency, mapped to an opaque random id;
 * amounts are BRS. Previews are computed with the client's math mirror from
 * the last read and labelled PREVIEW.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { isValidIncomePeriod, takeSplit } from "@mutav-finance/mutav-protocol-solana";
import { Mono } from "@/components/Mono";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { previewRegisterGuarantee, REFUSAL_TEXT } from "@/lib/gate";
import { fmtBrs, fmtPct, fmtTime, parseBrs, parseHundredths } from "@/lib/format";
import { agencyIdFor, agencyNames, knownLeases, refsSaltFor } from "@/lib/client/operator-refs";
import { refusalReason } from "@/lib/tx-error";
import { nextRef, REF } from "@/lib/refs";
import { claimCap } from "@/lib/operator";
import { bytesToHex } from "@/lib/serde";
import { claimsTimeline, GUARANTEE_ACTIVE, isUnpaid } from "@/lib/view";
import { Action, Field, Grid, LastAction, Note, RoleWarning, TextField, useLastAction, useLive } from "./shared";

/**
 * Lease references this browser registered, by guarantee id (hex), and agency
 * names by agency id: the operator's off-chain mapping (lib/client/operator-refs).
 * Guarantees registered elsewhere fall back to their short id.
 */
function useLeaseRefs(): { lease: Map<string, string>; agency: Map<string, string> } {
  const { ledger } = useLive();
  const [refs, setRefs] = useState<{ lease: Map<string, string>; agency: Map<string, string> }>({ lease: new Map(), agency: new Map() });
  const count = ledger.guarantees.length;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const lease = new Map<string, string>();
      for (const l of knownLeases()) lease.set(await REF.guaranteeId(l), l);
      if (!cancelled) setRefs({ lease, agency: agencyNames() });
    })();
    return () => {
      cancelled = true;
    };
  }, [count]);
  return refs;
}

/** A guarantee's lease reference when known here, else its short id. */
const refOf = (refs: Map<string, string>, idHex: string) => refs.get(idHex) ?? `${idHex.slice(0, 8)}…`;

const hex = (b: ArrayLike<number>) => bytesToHex(Uint8Array.from(b));

function PreviewBox({ ok, title, children }: { ok: boolean | null; title: string; children: ReactNode }) {
  const color = ok === null ? "var(--color-border)" : ok ? "var(--color-success)" : "var(--color-error)";
  return (
    <div data-testid="gate-preview" style={{ border: `1px solid ${color}`, background: "var(--color-surface)", padding: "12px 14px", margin: "8px 0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
        <span className="preview-label">Preview (same rules as the program)</span>
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
  <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, maxWidth: 640 }}>
    <span className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)" }}>{k}</span>
    <Mono style={{ fontSize: 12, color }}>{v}</Mono>
  </div>
);

// ── Guarantees ──────────────────────────────────────────────────────────────

/**
 * The recording script's prefill (docs/demo): the first lease reference, the
 * agency, the rent and both cover multiples. Every field stays editable.
 */
export const REGISTER_DEFAULTS = { lease: "MTV-PF-0100", agency: "Imobiliária Planalto", rent: "1500", defMult: "6", exitMult: "6" } as const;

export function RegisterForm({ onRefusedPreview, p = "", aside }: { onRefusedPreview?: (refused: boolean) => void; p?: string; aside?: ReactNode }) {
  const { reserve, ledger } = useLive();
  const n = ledger.guarantees.length + 1;
  const [lease, setLease] = useState<string>(REGISTER_DEFAULTS.lease);
  // Until the presenter types a reference, skip one already registered (a rehearsal), so the send never collides.
  const [leaseTyped, setLeaseTyped] = useState(false);
  const [agency, setAgency] = useState<string>(REGISTER_DEFAULTS.agency);
  const [rent, setRent] = useState<string>(REGISTER_DEFAULTS.rent);
  const [defMult, setDefMult] = useState<string>(REGISTER_DEFAULTS.defMult);
  const [exitMult, setExitMult] = useState<string>(REGISTER_DEFAULTS.exitMult);
  // The last confirmed registration stays on screen (status, signature, before/after) after "Register another".
  const last = useLastAction();
  // After a confirmed send the result holds (no preview against the new state)
  // until the user edits a field or asks for the next entry; `entry` remounts
  // the Action so its result clears.
  const [held, setHeld] = useState(false);
  const [entry, setEntry] = useState(0);
  const startNext = () => {
    setHeld(false);
    setEntry((e) => e + 1);
  };
  const edit = (set: (v: string) => void) => (v: string) => {
    set(v);
    if (held) startNext();
  };

  const rentBase = parseBrs(rent);
  // Multiples parsed once to exact hundredths (A8): no float math.
  const dm = parseHundredths(defMult);
  const em = parseHundredths(exitMult);
  const multOk = dm !== null && em !== null && dm <= 600n && em <= 600n;
  const defaultCover = rentBase && multOk ? (rentBase * dm) / 100n : 0n;
  const exitCover = rentBase && multOk ? (rentBase * em) / 100n : 0n;
  const preview = useMemo(
    () => (rentBase ? previewRegisterGuarantee(reserve.config, reserve.state, { defaultCover, exitCover }) : null),
    [reserve, rentBase, defaultCover, exitCover],
  );
  useEffect(() => onRefusedPreview?.(preview ? !preview.fits : false), [preview, onRefusedPreview]);

  const registered = useMemo(() => new Set(ledger.guarantees.map((g) => hex(g.data.id))), [ledger.guarantees]);
  useEffect(() => {
    if (leaseTyped || held) return;
    let cancelled = false;
    void (async () => {
      let ref = lease;
      for (let i = 0; i < 100 && registered.has(await REF.guaranteeId(ref.trim())); i++) ref = nextRef(ref, n);
      if (!cancelled && ref !== lease) setLease(ref);
    })();
    return () => {
      cancelled = true;
    };
  }, [lease, leaseTyped, held, registered, n]);

  const build = async () => {
    if (!rentBase || !lease.trim()) return null;
    return {
      kind: "register_guarantee" as const,
      id: await REF.guaranteeId(lease.trim()),
      // Opaque random id per agency and a refs-hash salt per lease, both kept by the operator.
      agencyId: agencyIdFor(agency.trim()),
      refsHash: await REF.refsHash(lease.trim(), refsSaltFor(lease.trim())),
      defaultCover,
      exitCover,
    };
  };

  // The gate's plain-English refusal, in the words of the result line: required coverage against what the reserve holds.
  const refusedTitle = (pv: NonNullable<typeof preview>) =>
    pv.refusal === "InsufficientFreeCapital"
      ? `Would be refused: needs ${fmtBrs(pv.needed)} of required coverage; the reserve holds ${fmtBrs(pv.stableAssets)}`
      : pv.refusal === "GuaranteeCapExceeded"
        ? `Would be refused: ${fmtBrs(pv.newCover)} of cover is above the ${fmtBrs(reserve.config.caps.maxCoverPerGuarantee)} per-guarantee cap`
        : `Would be refused: ${refusalReason(pv.refusal ?? "")}`;
  const ref = lease.trim();

  return (
    <div>
      {!held && <LastAction last={last.last} />}
      {/* Two columns from wide screens: the fields and the send on the left, the bounds and the gate preview beside them, so the button stays above the fold. */}
      <div className="grid items-start gap-x-8 gap-y-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <Grid>
            <TextField
              id={`${p}reg-lease`}
              label="Lease reference"
              value={lease}
              onChange={(v) => {
                setLeaseTyped(true);
                edit(setLease)(v);
              }}
              hint="hashed to the guarantee id"
            />
            <TextField id={`${p}reg-agency`} label="Agency" value={agency} onChange={edit(setAgency)} hint="opaque id, kept off-chain" />
            <TextField id={`${p}reg-rent`} label="Monthly rent (BRS)" value={rent} onChange={edit(setRent)} numeric />
            <TextField id={`${p}reg-def`} label="Default cover (× rent)" value={defMult} onChange={edit(setDefMult)} numeric hint={fmtBrs(defaultCover, 0)} />
            <TextField id={`${p}reg-exit`} label="Exit cover (× rent)" value={exitMult} onChange={edit(setExitMult)} numeric hint={fmtBrs(exitCover, 0)} />
          </Grid>
          <RoleWarning need="operator" />
          <div style={{ marginTop: 8 }}>
            <Action
              key={entry}
              label={preview && !preview.fits ? "Send anyway: watch the program refuse it" : "Register guarantee"}
              ix="register_guarantee"
              confirmedTitle={`Confirmed · ${ref}`}
              variant={preview && !preview.fits ? "outline" : "default"}
              request={build}
              disabled={!rentBase || !multOk}
              onConfirmed={(signature, before) => {
                setHeld(true);
                last.confirmed(`Registered · ${ref}`)(signature, before);
              }}
              onDone={last.done}
              refusal={preview ? { gate: { needed: preview.needed, stableAssets: preview.stableAssets, newCover: preview.newCover, maxCover: reserve.config.caps.maxCoverPerGuarantee } } : undefined}
              next={
                <Button
                  variant="outline"
                  onClick={() => {
                    setLease(nextRef(lease, n));
                    startNext();
                  }}
                >
                  Register another ({nextRef(lease, n)})
                </Button>
              }
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col">
          {aside}
          {preview && !held && (
            <PreviewBox ok={preview.fits} title={preview.fits ? "Fits: the program should accept it" : refusedTitle(preview)}>
              {!preview.fits && preview.refusal && <Note tone="error">{REFUSAL_TEXT[preview.refusal]}</Note>}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {kv("New cover", fmtBrs(preview.newCover))}
                {kv("Reserve balance", fmtBrs(preview.stableAssets))}
                {kv("Coverage required after", `${fmtBrs(preview.coverageRequiredAfter)} (${fmtPct(reserve.config.coverageRatioBps)} of cover)`)}
                {kv("Free capital", fmtBrs(preview.freeCapitalBefore))}
                {kv("Free capital after", `${preview.headroomAfter < 0n ? "−" : ""}${fmtBrs(preview.headroomAfter < 0n ? -preview.headroomAfter : preview.headroomAfter)}`, preview.headroomAfter < 0n ? "var(--color-error)" : "var(--color-success)")}
              </div>
            </PreviewBox>
          )}
        </div>
      </div>
    </div>
  );
}

function GuaranteeSelect({ id, value, onChange, filter }: { id: string; value: string; onChange: (v: string) => void; filter?: (g: { openClaims: number; active: boolean }) => boolean }) {
  const { ledger } = useLive();
  const refs = useLeaseRefs();
  const options = ledger.guarantees.filter((g) => (filter ? filter({ openClaims: g.data.openClaims, active: g.data.status === GUARANTEE_ACTIVE }) : g.data.status === GUARANTEE_ACTIVE));
  return (
    <Field id={id} label="Guarantee">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full font-mono">
          <SelectValue placeholder="Choose a guarantee" />
        </SelectTrigger>
        <SelectContent>
          {options.map((g) => {
            const d = g.data;
            const left = d.defaultCover - d.defaultPaid - d.provisionDefault + (d.exitCover - d.exitPaid - d.provisionExit);
            const agency = refs.agency.get(hex(d.agencyId));
            return (
              <SelectItem key={g.address} value={g.address} className="font-mono">
                {refOf(refs.lease, hex(d.id))}
                {agency ? ` · ${agency}` : ""} · {fmtBrs(left, 0)} left
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </Field>
  );
}

/** `close_guarantee` reasons (ADR 0020): the program stores the one given. */
const CLOSE_REASONS = {
  "1": { label: "RELEASED: the lease ended", note: "Releases the remaining cover. Refused while the guarantee has an open claim." },
  "2": { label: "VOID: registered in error", note: "For a guarantee that never ran: refused if anything was paid or a claim is open." },
} as const;

export function CloseGuaranteeForm({ p = "" }: { p?: string }) {
  const { ledger } = useLive();
  const [g, setG] = useState("");
  const [reason, setReason] = useState<"1" | "2">("1");
  const picked = ledger.guarantees.find((x) => x.address === g)?.data;
  const paid = picked ? picked.defaultPaid + picked.exitPaid : 0n;
  const voidRefused = reason === "2" && paid > 0n;
  return (
    <div>
      <Grid>
        <GuaranteeSelect id={`${p}close-g`} value={g} onChange={setG} filter={(x) => x.active && x.openClaims === 0} />
        <Field id={`${p}close-reason`} label="Reason">
          <Select value={reason} onValueChange={(v) => setReason(v as "1" | "2")}>
            <SelectTrigger id={`${p}close-reason`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(CLOSE_REASONS) as ("1" | "2")[]).map((k) => (
                <SelectItem key={k} value={k}>{CLOSE_REASONS[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Grid>
      <Note>{CLOSE_REASONS[reason].note}</Note>
      {voidRefused && <Note tone="warn">This guarantee has paid {fmtBrs(paid)}: the program refuses VOID. Close it as RELEASED.</Note>}
      <RoleWarning need="operator" />
      <Action label="Close guarantee" ix="close_guarantee" request={g ? { kind: "close_guarantee", guarantee: g, reason: Number(reason) as 1 | 2 } : null} variant="outline" />
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
          {kv(`MUTAV take (${fmtPct(reserve.config.feeTakeBps)}) → treasury`, fmtBrs(take))}
          {kv("Net → reserve (raises the coverage ceiling)", fmtBrs(gross - take))}
        </PreviewBox>
      )}
      <RoleWarning need="operator" />
      <Action label="Book guarantee fee" ix="contribute_fees" request={async () => (gross && invoice.trim() ? { kind: "contribute_fees", invoiceRefHash: await REF.invoice(invoice.trim()), amount: gross } : null)} onDone={() => setInvoice(`INV-2026-${String(ledger.fees.length + 2).padStart(4, "0")}`)} />
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
  // No take on issuer income (ADR 0019): all of it builds the reserve.
  const split = gross ? takeSplit(gross, 0) : null;
  const overInbox = gross !== null && gross > inbox;
  return (
    <div>
      <Grid>
        <TextField id={`${p}inc-ref`} label="Nora statement reference" value={statement} onChange={setStatement} hint="each statement is recorded once" />
        <TextField id={`${p}inc-period`} label="Statement month (YYYYMM)" value={period} onChange={setPeriod} numeric />
        <TextField id={`${p}inc-amt`} label="Amount on the statement (BRS)" value={amount} onChange={setAmount} numeric hint={`in the inbox now: ${fmtBrs(inbox)}`} />
      </Grid>
      {split && (
        <PreviewBox ok={overInbox || !periodOk ? false : null} title={overInbox ? `Would be refused: ${refusalReason("IncomeExceedsInbox")}` : !periodOk ? "Would be refused: the month must be YYYYMM" : "Split"}>
          {kv("Net → reserve (raises the coverage ceiling)", fmtBrs(split.net))}
          {kv("Left in the inbox, untracked", fmtBrs(overInbox ? inbox : inbox - gross!))}
        </PreviewBox>
      )}
      <RoleWarning need="operator" />
      <Action
        label="Sweep issuer income"
        ix="sweep_income"
        request={async () => (gross && periodOk && statement.trim() ? { kind: "sweep_income", incomeRefHash: await REF.income(statement.trim()), period: month, amount: gross } : null)}
        onDone={() => setStatement(`NORA-${periodOf(reserve.now)}-${String(ledger.income.length + 2).padStart(2, "0")}`)}
      />
    </div>
  );
}

// ── Claims ──────────────────────────────────────────────────────────────────

/** The first notice reference: the next ones auto-increment past those already filed. */
export const NOTICE_DEFAULT = "NTC-PF-0001";

export function FileClaimForm({ p = "" }: { p?: string }) {
  const { ledger } = useLive();
  const [picked, setG] = useState("");
  // Until one is chosen: the most recently registered active guarantee (the one the script just registered).
  const latest = ledger.guarantees
    .filter((x) => x.data.status === GUARANTEE_ACTIVE)
    .reduce<(typeof ledger.guarantees)[number] | null>((a, x) => (!a || x.data.registeredAt > a.data.registeredAt ? x : a), null);
  const g = picked || latest?.address || "";
  const [leg, setLeg] = useState<"1" | "2">("1");
  const [amount, setAmount] = useState("1500");
  const [notice, setNotice] = useState<string>(NOTICE_DEFAULT);
  // Until the presenter types a reference, skip one already filed, so the send never collides.
  const [noticeTyped, setNoticeTyped] = useState(false);
  const [entry, setEntry] = useState(0);
  // The notice just filed: the result holds (and the prefill stops moving) until "File another".
  const [held, setHeld] = useState<string | null>(null);
  const filed = useMemo(() => new Set(ledger.filings.map((f) => hex(f.data.noticeRefHash))), [ledger.filings]);
  useEffect(() => {
    if (noticeTyped || held) return;
    let cancelled = false;
    void (async () => {
      let ref = notice;
      for (let i = 0; i < 100 && filed.has(await REF.notice(ref.trim())); i++) ref = nextRef(ref, ledger.filings.length + 1);
      if (!cancelled && ref !== notice) setNotice(ref);
    })();
    return () => {
      cancelled = true;
    };
  }, [notice, noticeTyped, held, filed, ledger.filings.length]);
  const value = parseBrs(amount);
  const sent = notice.trim();
  return (
    <div>
      <Grid>
        {/* Two columns wide from tablet up, so "MTV-PF-0100 · agency · R$ left" reads whole. */}
        <div className="min-w-0 md:col-span-2">
          <GuaranteeSelect id={`${p}fc-g`} value={g} onChange={setG} />
        </div>
        <Field id={`${p}fc-leg`} label="Leg">
          <Select value={leg} onValueChange={(v) => setLeg(v as "1" | "2")}>
            <SelectTrigger id={`${p}fc-leg`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">default (rent arrears)</SelectItem>
              <SelectItem value="2">exit (property recovery)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <TextField id={`${p}fc-amt`} label="Claim amount (BRS)" value={amount} onChange={setAmount} numeric />
        <TextField
          id={`${p}fc-notice`}
          label="Notice reference"
          value={notice}
          onChange={(v) => {
            setNoticeTyped(true);
            setNotice(v);
          }}
          hint="one filing and one payment per notice"
        />
      </Grid>
      <Note>Filing books a provision: it lowers the share price at once, before any money moves. Not gated by required coverage.</Note>
      <RoleWarning need="operator" />
      <div style={{ marginTop: 8 }}>
        <Action
          key={entry}
          label="File claim"
          ix="file_claim"
          confirmedTitle={`Filed · ${held ?? sent}`}
          onConfirmed={() => setHeld(sent)}
          request={async () => (g && value && sent ? { kind: "file_claim", guarantee: g, leg: Number(leg) as 1 | 2, amount: value, noticeRefHash: await REF.notice(sent) } : null)}
          next={
            <Button
              variant="outline"
              onClick={() => {
                setHeld(null);
                setNoticeTyped(false);
                setEntry((e) => e + 1);
              }}
            >
              File another
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** Filed, unpaid claims, each with a Pay button (`pay_claim` for the filed provision). */
export function PayClaimList() {
  const { ledger, reserve } = useLive();
  const cap = claimCap(reserve.config, reserve.state, reserve.now);
  const open = claimsTimeline(ledger).filter((c) => isUnpaid(c.stage));
  const last = useLastAction();
  const refs = useLeaseRefs();
  if (open.length === 0) {
    return (
      <>
        <LastAction last={last.last} />
        <Note>No filed claim waiting for payment. File one first.</Note>
      </>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <LastAction last={last.last} />
      <RoleWarning need="operator" />
      {open.map((c) => (
        <div key={c.filing} style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <Mono style={{ fontSize: 12, minWidth: 280 }}>
            {refOf(refs.lease, c.guaranteeId)} · {c.leg} leg · {fmtBrs(c.provision)} · filed {fmtTime(c.filedAt)}
          </Mono>
          <Action
            label={`Pay claim ${fmtBrs(c.provision, 0)}`}
            ix="pay_claim"
            request={{ kind: "pay_claim", guarantee: c.guarantee, leg: c.leg === "exit" ? 2 : 1, amount: c.provision, noticeRefHash: c.noticeRefHash }}
            refusal={{ claim: { amount: c.provision, perCall: cap.perCall, remaining: cap.remaining } }}
            onConfirmed={last.confirmed(`Paid ${fmtBrs(c.provision)} · ${refOf(refs.lease, c.guaranteeId)}`)}
            onDone={last.done}
          />
        </div>
      ))}
    </div>
  );
}

/** Paid claims waiting for the PIX settlement record. */
export function SettleList() {
  const { ledger } = useLive();
  const paid = claimsTimeline(ledger).filter((c) => c.stage === "paid");
  const [e2e, setE2e] = useState<Record<string, string>>({});
  const last = useLastAction();
  const refs = useLeaseRefs();
  if (paid.length === 0) {
    return (
      <>
        <LastAction last={last.last} />
        <Note>No paid claim waiting for settlement.</Note>
      </>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <LastAction last={last.last} />
      <RoleWarning need="operator" />
      {paid.map((c) => {
        const id = e2e[c.filing] ?? `E12345678${new Date().toISOString().slice(0, 10).replace(/-/g, "")}demo${c.noticeRefHash.slice(0, 6)}`;
        return (
          <div key={c.filing} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Mono style={{ fontSize: 12 }}>
              {refOf(refs.lease, c.guaranteeId)} · {c.leg} leg · {fmtBrs(c.amount ?? 0n)} paid {fmtTime(c.paidAt ?? 0n)}
            </Mono>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 320 }}>
                <TextField id={`pix-${c.filing}`} label="PIX end-to-end id" value={id} onChange={(v) => setE2e((m) => ({ ...m, [c.filing]: v }))} hint="only its SHA-256 goes on-chain" />
              </div>
              <Action
                label="Settle payout"
                ix="settle_payout"
                request={async () => ({ kind: "settle_payout", guarantee: c.guarantee, noticeRefHash: c.noticeRefHash, pixE2eHash: await REF.pixE2e(id.trim()) })}
                onConfirmed={last.confirmed(`Settled ${fmtBrs(c.amount ?? 0n)} · ${refOf(refs.lease, c.guaranteeId)}`)}
                onDone={last.done}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
