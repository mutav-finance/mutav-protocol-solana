"use client";

/**
 * /admin "General controls": the cross-cutting settings. The emergency strip
 * (pause, revoke_operator, clear_fulfil_halt), roles and the Squads multisig
 * (explained once), coverage ratio and reserve limits, the allowlist and the
 * accounts. Per-flow settings live in Money in & out; asset settings in
 * Allocation.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { address as toAddress } from "@solana/kit";
import { buildAllowlist, MIN_COVERAGE_RATIO_BPS } from "@mutav-finance/mutav-protocol-solana";
import { Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { Label } from "@/components/ui/label";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { Action, Grid, Note, TextField, useLive } from "@/components/demo/shared";
import { AdminAction, Cards, Facts, KV, Meaning, PauserAction, Sub, WhatThis, type Mode } from "@/components/admin/shared";
import { ConfigCard, brsField, bpsField } from "@/components/admin/ConfigCard";
import { StatusBadge } from "@/components/StatusBadge";
import { UNSET_ADDRESS } from "@/lib/reserve-assets";
import { SquadsPanel, type SquadsResp } from "@/components/admin/Squads";
import { rolesError } from "@/lib/admin";
import { fmtBps, fmtBrs } from "@/lib/format";
import { ACCOUNT_ROLES } from "@/lib/roles";
import { bytesToHex } from "@/lib/serde";

const m = (x: ReactNode) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;

function RoleKey({ label, a }: { label: string; a: (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES] }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label}
      {a.role && <RoleTag role={a.role} suffix={<span style={{ color: "var(--color-text-3)", textTransform: "none", letterSpacing: 0 }}>· {a.note}</span>} />}
    </span>
  );
}

// ── Emergency ───────────────────────────────────────────────────────────────

/** The reserve's stop switches: state now, and who can flip each one (verified against the signer constraints). */
function Emergency({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const paused = reserve.config.paused;
  const halted = reserve.state.fulfilHalted;
  const revoked = reserve.config.operator === UNSET_ADDRESS;
  const flag = (bad: boolean, on: string, off: string) => <StatusBadge bordered color={bad ? "var(--color-error)" : "var(--color-success)"} label={bad ? on : off} />;
  return (
    <div id="general-emergency" role="region" aria-label="Emergency" style={{ border: "1px solid var(--color-error)", borderLeftWidth: 4, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12, marginTop: 20, scrollMarginTop: 112 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h3 style={{ fontSize: 17, margin: 0 }}>Emergency</h3>
        {flag(paused, "PAUSED", "NOT PAUSED")}
        {flag(halted, "FULFIL HALTED", "FULFIL OPEN")}
        {flag(revoked, "OPERATOR REVOKED", "OPERATOR ACTIVE")}
      </div>
      <p className="font-body" style={{ fontSize: 13, color: "var(--color-text-2)", margin: 0, lineHeight: 1.6 }}>
        <RoleTag role="admin" prefix="pauser key or" /> can <Mono>pause</Mono> and <Mono>revoke_operator</Mono> at once, signing directly, without the multisig or its time lock.{" "}
        <RoleTag role="admin" /> alone can <Mono>unpause</Mono> and <Mono>clear_fulfil_halt</Mono>, through a Squads proposal. Claim payments are never paused.
      </p>
      <Cards>
        <PauserAction title="Pause" note="Stops capital flows and new guarantees. Fees, income sweeps and claim payments stay open.">
          <Action label="pause" request={{ kind: "pause" }} variant="destructive" disabled={paused} />
        </PauserAction>
        <AdminAction title="Unpause" label="unpause" mode={mode} request={paused ? { kind: "unpause" } : null} note={paused ? "Reopens what pause stopped." : "The reserve is not paused."} />
        <PauserAction title="Revoke operator" note={revoked ? "The operator role is already revoked: appoint a new key with set_roles below." : "Clears the operator key if it is compromised: every operator instruction fails until the admin appoints a new one with set_roles."}>
          <Action label="revoke_operator" request={{ kind: "revoke_operator" }} variant="destructive" disabled={revoked} />
        </PauserAction>
        <AdminAction title="Clear fulfil halt" label="clear_fulfil_halt" mode={mode} request={halted ? { kind: "clear_fulfil_halt" } : null} note={halted ? "The NAV-move guard halted both queues. Clearing resets the NAV baseline (ADR 0015)." : "Fulfilment is not halted."} />
        <ConfigCard
          title="NAV-move guard"
          mode={mode}
          fields={[bpsField("maxNavMoveBps", "Max NAV move per refresh (bps)", reserve.config.price.maxNavMoveBps, 10_000)]}
          build={(v) => ({ kind: "set_config", price: { maxNavMoveBps: v.maxNavMoveBps as number } })}
          bound="0–10000 bps"
          does="If NAV per share moves more than this in one refresh (net of fees and swept income), refresh sets fulfil_halted and both capital queues stop until clear_fulfil_halt. Lower it for the real pilot; the devnet example uses 100%."
        />
      </Cards>
    </div>
  );
}

// ── Roles & multisig ────────────────────────────────────────────────────────

function RolesTable() {
  const { reserve } = useLive();
  const c = reserve.config;
  return (
    <KV
      rows={[
        [<RoleKey key="a" label="Admin (Squads vault)" a={ACCOUNT_ROLES.admin} />, <Explorer key="a" value={c.admin} full />],
        [<RoleKey key="o" label="Operator" a={ACCOUNT_ROLES.operator} />, c.operator === UNSET_ADDRESS ? m("revoked") : <Explorer key="o" value={c.operator} full />],
        [<RoleKey key="p" label="Pauser" a={ACCOUNT_ROLES.pauser} />, <Explorer key="p" value={c.pauser} full />],
        [<RoleKey key="c" label="MUTAV capital wallet" a={ACCOUNT_ROLES.capital} />, <Explorer key="c" value={c.mutavCapitalWallet} full />],
      ]}
    />
  );
}

// ── Coverage & reserve limits ───────────────────────────────────────────────

function CoverageControl({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const c = reserve.config;
  return (
    <ConfigCard
      title="Coverage ratio and reserve limits"
      mode={mode}
      fields={[
        bpsField("coverageRatioBps", "Coverage ratio c (bps)", c.coverageRatioBps, 65_535, MIN_COVERAGE_RATIO_BPS),
        brsField("maxTvl", "Max reserve (BRS)", c.caps.maxTvl),
        brsField("maxCoverPerGuarantee", "Max cover per guarantee (BRS)", c.caps.maxCoverPerGuarantee),
        brsField("maxCoverPerAgency", "Max cover per agency (BRS)", c.caps.maxCoverPerAgency),
      ]}
      build={(v) => {
        const caps: Record<string, bigint> = {};
        for (const k of ["maxTvl", "maxCoverPerGuarantee", "maxCoverPerAgency"]) if (v[k] !== undefined) caps[k] = v[k] as bigint;
        return { kind: "set_config", coverageRatioBps: v.coverageRatioBps as number | undefined, caps };
      }}
      bound={`c ≥ ${fmtBps(MIN_COVERAGE_RATIO_BPS)} (ADR 0016)`}
      does="c sizes the reserve against the book: coverage required = c × remaining cover (never below open provisions). The limits bound the reserve and each guarantee and agency."
    />
  );
}

function CoverageTable() {
  const { reserve } = useLive();
  const c = reserve.config;
  return (
    <KV
      rows={[
        [<Meaning key="c" label="Coverage ratio c">Share of remaining cover the reserve must hold in stable assets (≥ 10%, ADR 0016).</Meaning>, m(fmtBps(c.coverageRatioBps))],
        [<Meaning key="t" label="Max reserve (TVL)">fulfil_deposits stops at this size.</Meaning>, m(fmtBrs(c.caps.maxTvl, 0))],
        [<Meaning key="g" label="Max cover per guarantee">register_guarantee refuses a larger lease.</Meaning>, m(fmtBrs(c.caps.maxCoverPerGuarantee, 0))],
        [<Meaning key="a" label="Max cover per agency">register_guarantee refuses beyond it per agency.</Meaning>, m(fmtBrs(c.caps.maxCoverPerAgency, 0))],
        ["Feature flags", m(`0x${c.featureFlags.toString(16)}${c.featureFlags === 0n ? " (none: pilot)" : ""}`)],
      ]}
    />
  );
}

// ── Allowlist & accounts ────────────────────────────────────────────────────

function AccountsTable() {
  const { reserve } = useLive();
  const c = reserve.config;
  return (
    <KV
      rows={[
        [<Meaning key="r" label="Allowlist root">Merkle root of the wallets allowed to request deposits and redemptions.</Meaning>, m(`${bytesToHex(Uint8Array.from(c.investorAllowlistRoot)).slice(0, 24)}…`)],
        [<Meaning key="t" label="Treasury account">Receives the fee take and the income take. Outside the reserve.</Meaning>, <Explorer key="t" value={c.treasuryAccount} full />],
        [<Meaning key="p" label="Payments account">Receives every pay_claim; MUTAV forwards it to the landlord by PIX.</Meaning>, <Explorer key="p" value={c.paymentsAccount} full />],
        [<Meaning key="m" label="BRS mint">The reserve asset (issued by Nora). Fixed at initialize.</Meaning>, <Explorer key="m" value={c.reserveMint} full />],
        ["Share mint", <Explorer key="s" value={c.shareMint} full />],
      ]}
    />
  );
}

function RolesControl({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const [operator, setOperator] = useState<string>(reserve.config.operator);
  const [pauser, setPauser] = useState<string>(reserve.config.pauser);
  const req = { kind: "set_roles" as const, operator: operator.trim(), pauser: pauser.trim() };
  const bad = rolesError(req, reserve.config.admin);
  return (
    <AdminAction title="Operator and pauser keys" label="set_roles" mode={mode} request={bad ? null : req}>
      <Facts now={<><Explorer value={reserve.config.operator} /> · <Explorer value={reserve.config.pauser} /></>} bound={m("set, distinct from the admin and from each other")} does="Appoints a new operator key (for example after revoke_operator) or a new pauser key." />
      <Grid>
        <TextField id="adm-operator" label="Operator" value={operator} onChange={setOperator} />
        <TextField id="adm-pauser" label="Pauser" value={pauser} onChange={setPauser} />
      </Grid>
      {bad && <Note tone="warn">{bad}</Note>}
    </AdminAction>
  );
}

function PaymentsControl({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const [acct, setAcct] = useState("");
  const a = acct.trim();
  let bad: string | null = null;
  try {
    if (a) toAddress(a);
  } catch {
    bad = "not an address";
  }
  if (!bad && a === reserve.config.treasuryAccount) bad = "must differ from the treasury account";
  return (
    <AdminAction title="Payments account" label="set_payments_account" mode={mode} request={a && !bad ? { kind: "set_payments_account", paymentsAccount: a } : null}>
      <Facts now={<Explorer value={reserve.config.paymentsAccount} />} bound={m("a BRS token account; not the treasury; not owned by the capital wallet or the vault authority")} does="Where pay_claim sends BRS. The program checks the mint and the owners on-chain (spec §2.1)." />
      <Grid>
        <TextField id="adm-payments" label="New payments token account" value={acct} onChange={setAcct} hint={bad ?? undefined} />
      </Grid>
    </AdminAction>
  );
}

function AllowlistControl({ mode }: { mode: Mode }) {
  const { reserve } = useLive();
  const [owners, setOwners] = useState<string>(reserve.config.mutavCapitalWallet);
  const [rootPreview, setRootPreview] = useState<string | null>(null);
  const ownerList = useMemo(() => owners.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean), [owners]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await buildAllowlist(ownerList.map((o) => toAddress(o)));
        if (alive) setRootPreview(bytesToHex(t.root));
      } catch (e) {
        if (alive) setRootPreview(`invalid: ${(e as Error).message}`);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ownerList]);
  return (
    <AdminAction title="Investor allowlist" label="set_allowlist_root" mode={mode} request={ownerList.length ? { kind: "set_allowlist_root", owners: ownerList } : null}>
      <Facts
        now={m(`${bytesToHex(Uint8Array.from(reserve.config.investorAllowlistRoot)).slice(0, 24)}…`)}
        bound={m("any 32-byte root")}
        does="Built with the client's Merkle builder. Proofs for request_deposit and request_redeem come from the same list (ALLOWLIST on the server), checked on /investor."
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "12px 0" }}>
        <Label htmlFor="adm-owners" className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)" }}>Allowlisted wallets (one per line)</Label>
        <textarea id="adm-owners" value={owners} onChange={(e) => setOwners(e.target.value)} rows={3} className="font-mono" style={{ background: "transparent", border: "1px solid var(--color-border-input)", color: "var(--color-text)", fontSize: 12, padding: 8 }} />
        <Mono style={{ fontSize: 11, color: "var(--color-text-3)", wordBreak: "break-all" }}>new root {rootPreview ? `${rootPreview.slice(0, 24)}…` : "—"}</Mono>
      </div>
    </AdminAction>
  );
}

// ── Section ─────────────────────────────────────────────────────────────────

export function General({ mode, sq, sqError, onSquadsDone }: { mode: Mode; sq: SquadsResp | null; sqError: Error | null; onSquadsDone: () => void }) {
  return (
    <Section id="general" kicker="Governance" title="General controls" roles={<RoleLine items={[{ role: "admin", prefix: "written only by the" }]}>The pauser key can also pause and revoke the operator.</RoleLine>}>
      <WhatThis>The settings that cut across every flow: the stop switches, who holds each role, how much cover the reserve backs, and who may hold shares. Per-flow settings sit with their flow; asset settings sit under Allocation.</WhatThis>
      <Emergency mode={mode} />
      <Sub id="general-roles" title="Roles & multisig">
        <Note>
          Every admin change on this page is a Squads vault-transaction proposal: one member creates and approves it, the others approve from their own wallets, and anyone executes it once the threshold is met and the time lock has passed. This page holds no key.
        </Note>
        <SquadsPanel sq={sq} error={sqError} onDone={onSquadsDone} />
        <div className="grid-2">
          <RolesTable />
          <RolesControl mode={mode} />
        </div>
      </Sub>
      <Sub id="general-coverage" title="Coverage & reserve limits">
        <div className="grid-2">
          <CoverageTable />
          <CoverageControl mode={mode} />
        </div>
      </Sub>
      <Sub id="general-accounts" title="Allowlist & accounts">
        <AccountsTable />
        <Cards>
          <AllowlistControl mode={mode} />
          <PaymentsControl mode={mode} />
        </Cards>
      </Sub>
    </Section>
  );
}
