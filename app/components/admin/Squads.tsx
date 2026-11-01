"use client";

/**
 * The Squads v4 multisig behind the Reserve Admin: its status, time lock,
 * every live proposal and the last finished ones, each decoded with every
 * argument open and red flags marked (A3, A-R3-3, NEW-R3-2). Read-only on
 * devnet: members approve, reject, cancel and execute in the Squads app,
 * after the local verification step (NEW-R3-1; founder decision 2026-10-29).
 * Localnet builds only (`IN_APP_APPROVAL`) keep in-app votes and execute,
 * because the Squads app cannot reach a local validator; there, execute
 * refuses a set_config built against values that have moved (stale carry).
 */
import { useEffect, useState } from "react";
import { ReadError } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { StatusBadge } from "@/components/StatusBadge";
import { TxStatus } from "@/components/TxStatus";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/WalletProvider";
import { Note } from "@/components/demo/shared";
import { postJson } from "@/lib/client/api";
import { CLUSTER } from "@/lib/client/env";
import type { Cluster } from "@/lib/cluster";
import { IN_APP_APPROVAL } from "@/lib/flags";
import { squadsApproval, VERIFY_BEFORE_APPROVING } from "@/lib/squads-link";
import { useTx } from "@/lib/client/use-tx";
import { fmtDuration, fmtTime } from "@/lib/format";
import { SQUADS_CONFIG_CHANGE, squadsPermissions, type DecodedInstruction } from "@/lib/proposal-decode";

export type ProposalView = {
  index: bigint;
  transaction: string;
  proposal: string;
  status: string;
  statusAt: bigint | null;
  approvals: string[];
  rejections: string[];
  cancellations: string[];
  stale: boolean;
  executable: boolean;
  executableAt: bigint | null;
  instructions: string[];
  /** Every instruction decoded: arguments, checks against the chain now, red flags. */
  decoded: DecodedInstruction[];
  /** Program ids of foreign (non-MUTAV, non-Compute Budget) instructions. */
  foreign: string[];
};
export type SquadsResp =
  | { configured: false; admin: string; cluster: string }
  | {
      configured: true;
      adminIsVault: boolean;
      now: bigint;
      multisig: { address: string; vault: string; threshold: number; timeLock: number; members: { key: string; permissions: number }[]; transactionIndex: bigint; proposals: ProposalView[] };
    };

function useNow(serverNow: bigint | null) {
  const [offset] = useState(() => (serverNow === null ? 0n : serverNow - BigInt(Math.floor(Date.now() / 1000))));
  const [now, setNow] = useState(() => BigInt(Math.floor(Date.now() / 1000)) + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(BigInt(Math.floor(Date.now() / 1000)) + offset), 1000);
    return () => clearInterval(t);
  }, [offset]);
  return now;
}

type Act = "approve" | "reject" | "cancel" | "execute";

const isConfigChange = (p: ProposalView) => p.decoded.some((d) => d.name === SQUADS_CONFIG_CHANGE);

function DetailList({ items, warn = false }: { items: DecodedInstruction["details"]; warn?: boolean }) {
  return (
    <ul className="font-mono" style={{ margin: "2px 0 0", paddingLeft: 14, fontSize: 11, color: warn ? "var(--color-error)" : "var(--color-text-2)", listStyle: "square", overflowWrap: "anywhere" }}>
      {items.map((x, j) => (
        <li key={j}>
          {x.label}: {x.value}
        </li>
      ))}
    </ul>
  );
}

/** What the vault transaction will do: each instruction, its decoded arguments and red flags (A3). */
function ProposalInstructions({ p }: { p: ProposalView }) {
  if (p.decoded.length === 0) return <Mono style={{ fontSize: 12 }}>{p.instructions.join(", ") || "—"}</Mono>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {p.foreign.length > 0 && <StatusBadge bordered color="var(--color-error)" label={isConfigChange(p) ? "SQUADS CONFIG CHANGE" : "FOREIGN INSTRUCTION"} />}
      <ol aria-label={`instructions in proposal ${p.index}`} style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
        {p.decoded.map((d, k) => (
          <li key={k}>
            {d.program === "foreign" ? (
              <Mono style={{ fontSize: 12, color: "var(--color-error)" }}>{d.name} · program {d.programId}</Mono>
            ) : (
              <Mono style={{ fontSize: 12 }}>{d.name}</Mono>
            )}
            {/* Every argument stays open; red flags first (A-R3-3). */}
            {d.details.some((x) => x.warn) && <DetailList items={d.details.filter((x) => x.warn)} warn />}
            {d.details.some((x) => !x.warn) && <DetailList items={d.details.filter((x) => !x.warn)} />}
          </li>
        ))}
      </ol>
    </div>
  );
}

const statusText = (p: ProposalView, left: bigint | null) =>
  p.status === "Approved" ? (left !== null && left <= 0n ? "Executable" : "Approved · time lock") : p.stale && (p.status === "Active" || p.status === "Draft") ? `${p.status} · stale` : p.status;

/** Where and how members approve: the Squads app, after the local check. */
function ApproveElsewhere({ p, multisig, cluster }: { p: ProposalView; multisig: string; cluster: Cluster }) {
  const link = squadsApproval(cluster, multisig, p.index);
  const open = p.status === "Active" || p.status === "Approved" || p.status === "Draft";
  if (!link || !open) return <Mono dim>—</Mono>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <a href={link.href} target="_blank" rel="noopener noreferrer" className="font-mono ext-link" style={{ fontSize: 12 }}>
        {link.label} ↗
      </a>
      <Mono style={{ fontSize: 11, color: "var(--color-text-3)" }}>{link.steps}</Mono>
      <Mono style={{ fontSize: 11, color: "var(--color-error)" }}>{VERIFY_BEFORE_APPROVING}</Mono>
    </div>
  );
}

/** Localnet builds only: approve, reject, cancel and execute from the connected wallet. */
function InAppVotes({ p, now, onDone }: { p: ProposalView; now: bigint; onDone: () => void }) {
  const { address } = useWallet();
  const tx = useTx(onDone);
  const [last, setLast] = useState<Act | null>(null);
  const left = p.executableAt !== null ? p.executableAt - now : null;
  const voted = !!address && (p.approvals.includes(address) || p.rejections.includes(address));
  const send = (action: Act) => {
    setLast(action);
    return tx.runWith(() => postJson<{ tx: string }>("/api/squads", { action, index: p.index, member: address }));
  };
  const busy = !["idle", "confirmed", "failed"].includes(tx.state.phase);
  const canVote = p.status === "Active" && !p.stale && !!address && !voted;
  const canCancel = p.status === "Approved" && !!address && !p.cancellations.includes(address);
  const canExecute = p.status === "Approved" && left !== null && left <= 0n && !!address;
  return (
    <>
      {(canVote || canExecute) && p.decoded.some((d) => d.details.some((x) => x.warn)) && (
        <Mono style={{ display: "block", marginBottom: 6, fontSize: 11, color: "var(--color-error)" }}>Red flags above: read every one before approving.</Mono>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canVote && <Button size="sm" variant="outline" disabled={busy} onClick={() => send("approve")}>Approve</Button>}
        {canVote && <Button size="sm" variant="outline" disabled={busy} onClick={() => send("reject")}>Reject</Button>}
        {canExecute && <Button size="sm" variant={busy ? "outline" : "default"} disabled={busy} onClick={() => send("execute")}>Execute</Button>}
        {canCancel && <Button size="sm" variant="outline" disabled={busy} onClick={() => send("cancel")} title="Approved proposals: threshold cancel votes make it Cancelled">Cancel</Button>}
      </div>
      {last && <TxStatus state={tx.state} showAccounts={false} />}
    </>
  );
}

function ProposalRow({ p, threshold, now, onDone, multisig, cluster, inAppApproval }: { p: ProposalView; threshold: number; now: bigint; onDone: () => void; multisig: string; cluster: Cluster; inAppApproval: boolean }) {
  const left = p.executableAt !== null ? p.executableAt - now : null;
  const status = statusText(p, left);
  return (
    <tr>
      <td className="num"><Mono>#{p.index.toString()}</Mono></td>
      <td style={{ whiteSpace: "normal" }}>
        <ProposalInstructions p={p} />
      </td>
      <td><Mono style={{ color: status === "Executed" ? "var(--color-success)" : status === "Executable" ? "var(--color-accent)" : "var(--color-text-2)" }}>{status}</Mono></td>
      <td className="num">
        <Mono>{p.approvals.length}/{threshold}</Mono>
        {p.rejections.length > 0 && <Mono dim> · {p.rejections.length} rejected</Mono>}
        {p.cancellations.length > 0 && <Mono dim> · {p.cancellations.length} to cancel</Mono>}
      </td>
      <td><Mono dim>{left === null ? "—" : left > 0n ? `${fmtDuration(left)} left` : `since ${fmtTime(p.executableAt!)}`}</Mono></td>
      <td style={{ whiteSpace: "normal" }}>
        {p.foreign.length > 0 && !isConfigChange(p) && (
          <Mono style={{ display: "block", marginBottom: 6, fontSize: 11, color: "var(--color-error)" }}>
            Foreign instruction ({p.foreign.join(", ")}): the vault would sign it. Approve only if you know what it does.
          </Mono>
        )}
        {isConfigChange(p) && (
          <Mono style={{ display: "block", marginBottom: 6, fontSize: 11, color: "var(--color-error)" }}>
            Squads config change: it changes the multisig itself. Every action and argument is listed in red.
          </Mono>
        )}
        {inAppApproval ? <InAppVotes p={p} now={now} onDone={onDone} /> : <ApproveElsewhere p={p} multisig={multisig} cluster={cluster} />}
      </td>
      <td><Explorer value={p.proposal} /></td>
    </tr>
  );
}

export function SquadsPanel({
  sq,
  error,
  onDone,
  inAppApproval = IN_APP_APPROVAL,
  cluster = CLUSTER,
}: {
  sq: SquadsResp | null;
  error: Error | null;
  onDone: () => void;
  /** Narrows the build-time flag (never widens it: votes need IN_APP_APPROVAL too). */
  inAppApproval?: boolean;
  cluster?: Cluster;
}) {
  const now = useNow(sq && sq.configured ? sq.now : null);
  // Folds to false on devnet builds, so the vote code is dropped there.
  const votes = IN_APP_APPROVAL && inAppApproval;
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
      <Mono style={{ fontSize: 11, color: "var(--color-text-3)", overflowWrap: "anywhere" }}>
        members: {ms.members.map((m) => `${m.key} (${squadsPermissions(m.permissions)})`).join(" · ") || "none"}
      </Mono>
      {!votes && (
        <Note>
          Read-only here: members approve, reject, cancel and execute in the Squads app, not on this page. {VERIFY_BEFORE_APPROVING} Executing a set_config from the Squads app skips this app&apos;s stale-carry check, so confirm its diff still holds before executing.
        </Note>
      )}
      {ms.proposals.length === 0 ? (
        <Note>No live proposal, and none finished recently.</Note>
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
                <th>{votes ? "Actions" : "Approve in Squads"}</th>
                <th>Proposal</th>
              </tr>
            </thead>
            <tbody>
              {ms.proposals.map((p) => (
                <ProposalRow key={p.index.toString()} p={p} threshold={ms.threshold} now={now} onDone={onDone} multisig={ms.address} cluster={cluster} inAppApproval={votes} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

