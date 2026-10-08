"use client";

/**
 * The Squads v4 multisig behind the Reserve Admin: its status, time lock and
 * recent proposals, with approve and execute from the member's own wallet.
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
import { useTx } from "@/lib/client/use-tx";
import { fmtDuration, fmtTime } from "@/lib/format";

export type ProposalView = {
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

export function SquadsPanel({ sq, error, onDone }: { sq: SquadsResp | null; error: Error | null; onDone: () => void }) {
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

