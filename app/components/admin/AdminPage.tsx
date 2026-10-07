"use client";

/**
 * /admin — for Squads members. Shows VaultConfig, builds each admin action
 * as a Squads v4 vault-transaction proposal (create + the creator's
 * approval), lists recent proposals with approvals and the time-lock
 * countdown, and lets members approve and execute from their own wallets.
 * When the configured admin is not a Squads vault (localnet only), actions
 * can be signed directly, clearly labelled.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { address as toAddress } from "@solana/kit";
import { buildAllowlist, MIN_COVERAGE_RATIO_BPS } from "@mutav-finance/mutav-protocol-solana";
import { Page, ReadError, Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/components/WalletProvider";
import { CLUSTER } from "@/lib/client/env";
import { postJson } from "@/lib/client/api";
import { usePoll } from "@/lib/client/use-poll";
import { useTx } from "@/lib/client/use-tx";
import { fmtBps, fmtBrs, fmtDuration, fmtTime, parseBrs } from "@/lib/format";
import { bytesToHex } from "@/lib/serde";
import type { AdminTx, TxRequest } from "@/lib/tx-kinds";
import { capitalQueue, configSummary, type Ledger, type ReserveView } from "@/lib/view";
import { Action, Grid, LiveProvider, Note, TextField, useLive } from "@/components/demo/shared";
import Link from "next/link";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { ACCOUNT_ROLES } from "@/lib/roles";

type ProposalView = {
  index: bigint;
  transaction: string;
  proposal: string;
  status: string;
  statusAt: bigint | null;
  approvals: string[];
  rejections: string[];
  executable: boolean;
  executableAt: bigint | null;
  instructions: string[];
};
type SquadsResp =
  | { configured: false; admin: string; cluster: string }
  | {
      configured: true;
      adminIsVault: boolean;
      now: bigint;
      multisig: { address: string; vault: string; threshold: number; timeLock: number; members: { key: string; permissions: number }[]; transactionIndex: bigint; proposals: ProposalView[] };
    };

/** How admin actions are sent on this deployment. */
type Mode = { via: "squads" | "direct"; label: string } | null;

function modeOf(sq: SquadsResp | null): Mode {
  if (sq?.configured && sq.adminIsVault) return { via: "squads", label: "Squads proposal" };
  if (CLUSTER === "localnet") return { via: "direct", label: "Direct signing · localnet only" };
  return null;
}

// ── Config ──────────────────────────────────────────────────────────────────

function RoleKey({ label, a }: { label: string; a: (typeof ACCOUNT_ROLES)[keyof typeof ACCOUNT_ROLES] }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {label}
      {a.role && <RoleTag role={a.role} suffix={<span style={{ color: "var(--color-text-3)", textTransform: "none", letterSpacing: 0 }}>· {a.note}</span>} />}
    </span>
  );
}

function KV({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <tbody>
          {rows.map(([k, v], i) => (
            <tr key={i}>
              <td className="font-body" style={{ fontSize: 13, width: "40%" }}>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConfigView({ r }: { r: ReserveView }) {
  const c = configSummary(r.config);
  const m = (x: string) => <Mono style={{ fontSize: 12 }}>{x}</Mono>;
  return (
    <div className="grid-2">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Roles</h3>
        <KV
          rows={[
            [<RoleKey key="a" label="Admin (Squads vault)" a={ACCOUNT_ROLES.admin} />, <Explorer key="a" value={c.roles.admin} full />],
            [<RoleKey key="p" label="Pauser" a={ACCOUNT_ROLES.pauser} />, <Explorer key="p" value={c.roles.pauser} full />],
            [<RoleKey key="o" label="Operator" a={ACCOUNT_ROLES.operator} />, <Explorer key="o" value={c.roles.operator} full />],
            [<RoleKey key="c" label="MUTAV capital wallet" a={ACCOUNT_ROLES.capital} />, <Explorer key="c" value={c.roles.mutavCapitalWallet} full />],
          ]}
        />
        <h3 style={{ fontSize: 15, margin: "8px 0 0" }}>Accounts</h3>
        <KV rows={[["Treasury account", <Explorer key="t" value={c.accounts.treasuryAccount} full />], ["Payments account", <Explorer key="p" value={c.accounts.paymentsAccount} full />], ["BRS mint", <Explorer key="m" value={c.accounts.reserveMint} full />], ["Share mint", <Explorer key="s" value={c.accounts.shareMint} full />]]} />
        <h3 style={{ fontSize: 15, margin: "8px 0 0" }}>Parameters</h3>
        <KV
          rows={[
            ["Coverage ratio", m(fmtBps(c.params.coverageRatioBps))],
            ["Fee take", m(fmtBps(c.params.feeTakeBps))],
            ["Payout SLA", m(fmtDuration(c.params.payoutSlaSecs))],
            ["Feature flags", m(`0x${c.params.featureFlags.toString(16)}${c.params.featureFlags === 0n ? " (none: pilot)" : ""}`)],
            ["Paused", m(String(c.params.paused))],
            ["Allowlist root", m(`${c.allowlistRoot.slice(0, 16)}…`)],
          ]}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Caps</h3>
        <KV
          rows={[
            ["Max reserve (TVL)", m(fmtBrs(c.caps.maxTvl, 0))],
            ["Max cover per guarantee", m(fmtBrs(c.caps.maxCoverPerGuarantee, 0))],
            ["Max cover per agency", m(fmtBrs(c.caps.maxCoverPerAgency, 0))],
            ["Max claim payment per call", m(fmtBrs(c.caps.maxClaimPerCall, 0))],
            ["Max claim payments per period", m(`${fmtBrs(c.caps.maxClaimPerPeriod, 0)} / ${fmtDuration(c.caps.claimPeriodSecs)}`)],
            ["TESOURO share", m(fmtBps(c.caps.maxTesouroShareBps))],
            ["Request size", m(`${fmtBrs(c.caps.minRequest, 0)} – ${fmtBrs(c.caps.maxRequest, 0)}`)],
            ["Partial-fill floor", m(fmtBrs(c.caps.minFillAssets, 0))],
          ]}
        />
        <h3 style={{ fontSize: 15, margin: "8px 0 0" }}>Price parameters</h3>
        <KV
          rows={[
            ["TESOURO price account", <Explorer key="pa" value={c.price.tesouroPriceAccount} />],
            ["Max staleness", m(fmtDuration(c.price.maxStalenessSecs))],
            ["Max deviation", m(fmtBps(c.price.maxDeviationBps))],
            ["Max NAV move per refresh", m(fmtBps(c.price.maxNavMoveBps))],
            ["y max", m(fmtBps(c.price.yMaxBps))],
          ]}
        />
      </div>
    </div>
  );
}

// ── Squads ──────────────────────────────────────────────────────────────────

function useNow(serverNow: bigint | null) {
  const [offset] = useState(() => (serverNow === null ? 0n : serverNow - BigInt(Math.floor(Date.now() / 1000))));
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)) + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000)) + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

function ProposalRow({ p, threshold, now, onDone }: { p: ProposalView; threshold: number; now: bigint; onDone: () => void }) {
  const { address } = useWallet();
  const approve = useTx(onDone);
  const execute = useTx(onDone);
  const left = p.executableAt !== null ? p.executableAt - now : null;
  const status = p.status === "Approved" ? (left !== null && left <= 0n ? "Executable" : "Approved · time lock") : p.status;
  const send = (action: "approve" | "execute", t: ReturnType<typeof useTx>) =>
    t.runWith(() => postJson<{ tx: string }>("/api/squads", { action, index: p.index, member: address }));
  return (
    <tr>
      <td className="num"><Mono>#{p.index.toString()}</Mono></td>
      <td><Mono style={{ fontSize: 12 }}>{p.instructions.join(", ") || "—"}</Mono></td>
      <td><Mono style={{ color: status === "Executed" ? "var(--color-success)" : status === "Executable" ? "var(--color-accent)" : "var(--color-text-2)" }}>{status}</Mono></td>
      <td className="num"><Mono>{p.approvals.length}/{threshold}</Mono></td>
      <td><Mono dim>{left === null ? "—" : left > 0n ? `${fmtDuration(left)} left` : `since ${fmtTime(p.executableAt!)}`}</Mono></td>
      <td style={{ whiteSpace: "normal" }}>
        <div style={{ display: "flex", gap: 8 }}>
          {p.status === "Active" && address && !p.approvals.includes(address) && (
            <Button size="sm" variant="outline" onClick={() => send("approve", approve)}>Approve</Button>
          )}
          {p.status === "Approved" && left !== null && left <= 0n && address && (
            <Button size="sm" onClick={() => send("execute", execute)}>Execute</Button>
          )}
        </div>
        <TxStatus state={approve.state} showAccounts={false} />
        <TxStatus state={execute.state} showAccounts={false} />
      </td>
      <td><Explorer value={p.proposal} /></td>
    </tr>
  );
}

function SquadsPanel({ sq, error, onDone }: { sq: SquadsResp | null; error: Error | null; onDone: () => void }) {
  const now = useNow(sq && sq.configured ? sq.now : null);
  if (error && !sq) return <ReadError error={error} />;
  if (!sq) return <Note>Reading the multisig…</Note>;
  if (!sq.configured) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <StatusBadge bordered color="var(--color-copper)" label="NO SQUADS MULTISIG CONFIGURED" />
        <Note>
          SQUADS_MULTISIG is not set, so no proposal can be built.{" "}
          {sq.cluster === "localnet" ? <>On localnet the admin is a plain key (<Explorer value={sq.admin} />): actions below are signed directly.</> : <>Set it to the multisig whose vault is VaultConfig.admin.</>}
        </Note>
      </div>
    );
  }
  const ms = sq.multisig;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusBadge bordered color={sq.adminIsVault ? "var(--color-success)" : "var(--color-error)"} label={sq.adminIsVault ? "ADMIN = SQUADS VAULT" : "ADMIN IS NOT THIS VAULT"} />
        <Mono style={{ fontSize: 12, color: "var(--color-text-2)" }}>
          threshold {ms.threshold} of {ms.members.length} · time lock {fmtDuration(BigInt(ms.timeLock))} · multisig <Explorer value={ms.address} /> · vault <Explorer value={ms.vault} />
        </Mono>
      </div>
      {ms.proposals.length === 0 ? (
        <Note>No proposals yet.</Note>
      ) : (
        <div className="table-wrap">
          <table className="data-table" aria-label="Squads proposals">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Instructions</th>
                <th>Status</th>
                <th className="num">Approvals</th>
                <th>Time lock</th>
                <th>Actions</th>
                <th>Proposal</th>
              </tr>
            </thead>
            <tbody>
              {ms.proposals.map((p) => (
                <ProposalRow key={p.index.toString()} p={p} threshold={ms.threshold} now={now} onDone={onDone} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

function AdminAction({ title, children, mode, request, label, note }: { title: string; children?: ReactNode; mode: Mode; request: AdminTx | TxRequest | null | (() => Promise<AdminTx | null>); label: string; note?: ReactNode }) {
  return (
    <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
      <h3 style={{ fontSize: 15, margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
        {title} <RoleTag role="admin" />
      </h3>
      {note && <Note>{note}</Note>}
      {children}
      {mode ? (
        <Action label={mode.via === "squads" ? `Propose: ${label}` : `Sign directly: ${label}`} request={request} via={mode.via} variant={mode.via === "direct" ? "outline" : "default"} />
      ) : (
        <Note tone="warn">No Squads multisig configured, and direct signing is localnet-only.</Note>
      )}
    </article>
  );
}

function Actions({ mode }: { mode: Mode }) {
  const { reserve, ledger } = useLive();
  const q = capitalQueue(reserve.state, ledger);
  const [depCount, setDepCount] = useState("8");
  const [redCount, setRedCount] = useState("8");
  const [maxAssets, setMaxAssets] = useState("");
  const [ratio, setRatio] = useState(String(reserve.config.coverageRatioBps));
  const [maxCoverPerGuarantee, setMcg] = useState("");
  const [maxCoverPerAgency, setMca] = useState("");
  const [maxTvl, setTvl] = useState("");
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

  const caps: NonNullable<Extract<AdminTx, { kind: "set_config" }>["caps"]> = {};
  for (const [k, v] of [["maxCoverPerGuarantee", maxCoverPerGuarantee], ["maxCoverPerAgency", maxCoverPerAgency], ["maxTvl", maxTvl]] as const) {
    const b = parseBrs(v);
    if (b) caps[k] = b;
  }
  const ratioN = Number(ratio);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      <AdminAction title="Fulfil deposits" label="fulfil_deposits" mode={mode} request={{ kind: "fulfil_deposits", count: Math.max(1, Number(depCount) || 1) }} note={`${q.deposits.length} pending in the FIFO queue (head seq ${reserve.state.depositHead}). Allowed in under-coverage; refused while a claim notice is open or fulfilment is halted.`}>
        <Grid><TextField id="adm-dep" label="Count" value={depCount} onChange={setDepCount} numeric /></Grid>
      </AdminAction>
      <AdminAction title="Fulfil redemptions" label="fulfil_redeems" mode={mode} request={{ kind: "fulfil_redeems", count: Math.max(1, Number(redCount) || 1), maxAssets: parseBrs(maxAssets) ?? (1n << 64n) - 1n }} note={`${q.redeems.length} pending. Each fill must fit in free capital; frozen in under-coverage.`}>
        <Grid>
          <TextField id="adm-red" label="Count" value={redCount} onChange={setRedCount} numeric />
          <TextField id="adm-max" label="Max BRS (blank = no limit)" value={maxAssets} onChange={setMaxAssets} numeric />
        </Grid>
      </AdminAction>
      <AdminAction title="Set config: coverage ratio and caps" label="set_config" mode={mode} request={Number.isInteger(ratioN) && ratioN >= MIN_COVERAGE_RATIO_BPS && ratioN <= 65_535 ? { kind: "set_config", coverageRatioBps: ratioN, caps } : null} note="Writes only the fields filled in; every other field is carried over as it is on-chain.">
        <Grid>
          <TextField id="adm-ratio" label={`Coverage ratio (bps, ≥ ${MIN_COVERAGE_RATIO_BPS})`} value={ratio} onChange={setRatio} numeric hint={Number.isFinite(ratioN) ? fmtBps(ratioN) : ""} />
          <TextField id="adm-mcg" label="Max cover per guarantee (BRS)" value={maxCoverPerGuarantee} onChange={setMcg} numeric hint={`now ${fmtBrs(reserve.config.caps.maxCoverPerGuarantee, 0)}`} />
          <TextField id="adm-mca" label="Max cover per agency (BRS)" value={maxCoverPerAgency} onChange={setMca} numeric hint={`now ${fmtBrs(reserve.config.caps.maxCoverPerAgency, 0)}`} />
          <TextField id="adm-tvl" label="Max reserve (BRS)" value={maxTvl} onChange={setTvl} numeric hint={`now ${fmtBrs(reserve.config.caps.maxTvl, 0)}`} />
        </Grid>
      </AdminAction>
      <AdminAction title="Set allowlist root" label="set_allowlist_root" mode={mode} request={ownerList.length ? { kind: "set_allowlist_root", owners: ownerList } : null} note="Built with the client's Merkle builder; proofs for request_deposit and request_redeem come from the same list (ALLOWLIST on the server), checked on /investor.">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Label htmlFor="adm-owners" className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)" }}>Allowlisted wallets (one per line)</Label>
          <textarea id="adm-owners" value={owners} onChange={(e) => setOwners(e.target.value)} rows={3} className="font-mono" style={{ background: "transparent", border: "1px solid var(--color-border-input)", color: "var(--color-text)", fontSize: 12, padding: 8 }} />
          <Mono style={{ fontSize: 11, color: "var(--color-text-3)", wordBreak: "break-all" }}>
            new root {rootPreview ? `${rootPreview.slice(0, 24)}…` : "—"} · on-chain {bytesToHex(Uint8Array.from(reserve.config.investorAllowlistRoot)).slice(0, 24)}…
          </Mono>
        </div>
      </AdminAction>
      <AdminAction title="Unpause" label="unpause" mode={mode} request={{ kind: "unpause" }} note={`The reserve is ${reserve.config.paused ? "paused" : "not paused"}. Pausing is the pauser's key (below), not a proposal.`} />
      <AdminAction title="Clear fulfil halt" label="clear_fulfil_halt" mode={mode} request={{ kind: "clear_fulfil_halt" }} note={`Fulfilment is ${reserve.state.fulfilHalted ? "HALTED by the NAV-move guard" : "not halted"}. Clearing resets the NAV baseline.`} />
      <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
        <h3 style={{ fontSize: 15, margin: 0, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          Pause <RoleTag role="admin" prefix="pauser key or" />
        </h3>
        <Note>Signed directly by the pauser key (or the admin): no time lock, so it can stop the reserve at once. Claim payments are never paused.</Note>
        <Action label="pause" request={{ kind: "pause" }} variant="destructive" />
      </article>
    </div>
  );
}

export function AdminPage() {
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const sq = usePoll<SquadsResp>("/api/squads", 10_000);
  const mode = modeOf(sq.data);
  const d = poll.data;
  return (
    <Page
      title="Admin console"
      lede={<><span style={{ display: "block", marginBottom: 10 }}><RoleTag role="admin" bordered /></span>For members of MUTAV&apos;s admin multisig. Every admin action is a Squads vault-transaction proposal: one member creates and approves it, others approve, and anyone executes it after the time lock. Wallets sign; this page holds no key.</>}
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), sq.refresh()]); } }}>
          {mode?.via === "direct" && (
            <div role="note" style={{ border: "1px solid var(--color-copper)", padding: "10px 14px", marginBottom: 8 }}>
              <StatusBadge color="var(--color-copper)" label="DIRECT SIGNING · LOCALNET ONLY" />
              <Note>The configured admin is a plain local key, not a Squads vault. Actions are signed directly by that key. On devnet every admin action is a proposal.</Note>
            </div>
          )}
          <Section id="config" title="VaultConfig" kicker="On-chain configuration" roles={<RoleLine items={[{ role: "admin", prefix: "written only by" }]}>The Operator and Investor wallets are listed here; they cannot change it.</RoleLine>}>
            <ConfigView r={d.reserve} />
          </Section>
          <Section id="proposals" title="Proposals" kicker="Squads v4" roles={<RoleLine items={[{ role: "admin", prefix: "approved and executed by members of the" }]} />}>
            <SquadsPanel sq={sq.data} error={sq.error} onDone={() => void sq.refresh()} />
          </Section>
          <Section id="actions" title="Actions" kicker={mode?.label ?? "Unavailable"} roles={<RoleLine items={[{ role: "admin", prefix: "every action here is signed by the" }]} />}>
            <Actions mode={mode} />
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              <RoleLine items={[{ role: "operator", prefix: "not here:" }]}>
                guarantees, guarantee fees and claims are on <Link href="/demo#panel" className="ext-link">/demo</Link>.
              </RoleLine>
              <RoleLine items={[{ role: "investor", prefix: "not here:" }]}>
                deposit and redemption requests are on <Link href="/investor" className="ext-link">/investor</Link>.
              </RoleLine>
            </div>
          </Section>
        </LiveProvider>
      )}
    </Page>
  );
}
