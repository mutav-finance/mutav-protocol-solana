"use client";

/**
 * /investor — the capital provider's view. Everyone can read it; only a
 * wallet whose Merkle proof verifies against the on-chain allowlist root can
 * send `request_deposit` / `request_redeem` (the server builds the proof from
 * ALLOWLIST). Cancels and claims need only the request's owner (spec §5.5).
 * The pilot runs on MUTAV's own capital and is not open to public investment;
 * its allowlisted capital provider is MUTAV's capital wallet.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { assetsFor } from "@mutav-finance/mutav-protocol-solana";
import { Page, ReadError, Section } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { MetricCard } from "@/components/MetricCard";
import { Mono } from "@/components/Mono";
import { RoleLine, RoleTag } from "@/components/RoleTag";
import { StatusBadge } from "@/components/StatusBadge";
import { useWallet } from "@/components/WalletProvider";
import { Action, Grid, LiveProvider, Note, TextField, useLive } from "@/components/demo/shared";
import { ALLOWLIST_TEXT, type AllowlistState } from "@/lib/allowlist";
import { usePoll } from "@/lib/client/use-poll";
import { fmtBps, fmtBrs, fmtShares, fmtTime, parseBrs, SHARE_DECIMALS } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import { investorRequests, type Ledger, type ReserveView } from "@/lib/view";

const STATE_BADGE: Record<AllowlistState, { label: string; color: string }> = {
  allowlisted: { label: "ALLOWLISTED", color: "var(--color-success)" },
  "not-listed": { label: "NOT ON THE ALLOWLIST · READ-ONLY", color: "var(--color-copper)" },
  "root-unset": { label: "ALLOWLIST EMPTY · READ-ONLY", color: "var(--color-copper)" },
  "list-mismatch": { label: "ALLOWLIST UNVERIFIABLE · READ-ONLY", color: "var(--color-error)" },
};

function Allowlist({ inv }: { inv: InvestorView | null }) {
  const { address } = useWallet();
  const state = address && inv?.owner === address ? inv.allowlist.state : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {state ? (
          <StatusBadge bordered color={STATE_BADGE[state].color} label={STATE_BADGE[state].label} />
        ) : (
          <StatusBadge bordered color="var(--color-text-3)" label={address ? "CHECKING THE ALLOWLIST…" : "NO WALLET CONNECTED · READ-ONLY"} />
        )}
        {address && <Explorer value={address} />}
      </div>
      <Note tone={state === "allowlisted" ? "ok" : "dim"}>
        {state ? ALLOWLIST_TEXT[state] : "Connect a wallet to check it against the allowlist. Without one, this view is read-only."}
      </Note>
      {inv && (
        <Mono dim style={{ fontSize: 11, wordBreak: "break-all" }}>
          {`on-chain root ${inv.allowlist.root.slice(0, 24)}… · ${inv.allowlist.listSize} wallet${inv.allowlist.listSize === 1 ? "" : "s"} in the server's public ALLOWLIST`}
        </Mono>
      )}
    </div>
  );
}

function Position({ r, inv, pending }: { r: ReserveView; inv: InvestorView | null; pending: { deposits: bigint; redeemShares: bigint } }) {
  const { address } = useWallet();
  if (!address || !inv || inv.owner !== address) return <Note>Connect a wallet to see its position.</Note>;
  const s = r.state;
  const shares = inv.shares.amount ?? 0n;
  const value = assetsFor(shares, s.sharesOutstanding, r.solvency.netAssets);
  const ownBps = s.sharesOutstanding === 0n ? 0n : (shares * 10_000n) / s.sharesOutstanding;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="grid-metrics">
        <MetricCard label="Reserve shares held" value={fmtShares(shares)} unit={inv.shares.amount === null ? "no share account yet" : `${fmtBps(ownBps)} of shares outstanding`} />
        <MetricCard label="Value at NAV now" value={fmtBrs(value)} unit="PREVIEW · math mirror: assets_for(shares)" tooltip="The client's math mirror of the program's assets_for, on the current accounts. A redemption is priced at the NAV of its fill, not now." />
        <MetricCard label="BRS in wallet" value={inv.brs.amount === null ? "—" : fmtBrs(inv.brs.amount)} unit={inv.brs.amount === null ? "no BRS account yet" : "associated token account"} />
        <MetricCard label="Deposits waiting" value={fmtBrs(pending.deposits)} unit="escrowed, not yet fulfilled" />
        <MetricCard label="Shares waiting to redeem" value={fmtShares(pending.redeemShares)} unit="escrowed, not yet filled" />
      </div>
    </div>
  );
}

const ACTION_LABEL = { cancel_deposit: "Cancel deposit", claim_shares: "Claim shares", cancel_redeem: "Cancel redemption", claim_assets: "Claim BRS" } as const;

function Requests({ owner }: { owner: string | null }) {
  const { reserve, ledger } = useLive();
  const rows = investorRequests(owner, reserve.state, ledger);
  if (!owner) return <Note>Connect a wallet to see its requests. The whole queue is public on <Link href="/reserve#queue" className="ext-link">/reserve</Link>.</Note>;
  if (rows.length === 0) return <Note>This wallet has no open request.</Note>;
  return (
    <div className="table-wrap">
      <table className="data-table" aria-label="Your queue entries">
        <thead>
          <tr>
            <th>Side</th>
            <th className="num">Seq</th>
            <th>Status</th>
            <th className="num">Position</th>
            <th className="num">Waiting</th>
            <th className="num">To claim</th>
            <th>Requested</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.address}>
              <td><Explorer value={x.address} label={x.side} /></td>
              <td className="num"><Mono>{x.seq.toString()}</Mono></td>
              <td><Mono>{x.status}</Mono></td>
              <td className="num"><Mono dim={x.position === null}>{x.position === null ? "—" : `#${x.position}`}</Mono></td>
              <td className="num"><Mono>{x.waiting === 0n ? "—" : x.side === "deposit" ? fmtBrs(x.waiting) : `${fmtShares(x.waiting)} sh`}</Mono></td>
              <td className="num"><Mono>{x.claimable === 0n ? "—" : x.side === "deposit" ? `${fmtShares(x.claimable)} sh` : fmtBrs(x.claimable)}</Mono></td>
              <td><Mono dim>{fmtTime(x.requestedAt)}</Mono></td>
              <td style={{ whiteSpace: "normal" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {x.actions.map((a) => (
                    <Action key={a} label={ACTION_LABEL[a]} variant={a.startsWith("cancel") ? "outline" : "default"} request={{ kind: a, seq: x.seq }} />
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Gate({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  return (
    <div aria-disabled={!allowed} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {children}
      {!allowed && <Note tone="warn">Read-only: only an allowlisted wallet can send this. The program checks the Merkle proof on-chain.</Note>}
    </div>
  );
}

function RequestForms({ allowed }: { allowed: boolean }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const [amount, setAmount] = useState("10000");
  const [sharesIn, setSharesIn] = useState("2000");
  const assets = parseBrs(amount);
  const shares = parseBrs(sharesIn, SHARE_DECIMALS);
  const depOut = assets !== null && (assets < caps.minRequest || assets > caps.maxRequest);
  const redValue = shares ? assetsFor(shares, reserve.state.sharesOutstanding, reserve.solvency.netAssets) : null;
  const redOut = redValue !== null && (redValue < caps.minRequest || redValue > caps.maxRequest);
  return (
    <div className="grid-2">
      <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px" }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Request a deposit</h3>
        <Note>BRS moves to the pending-deposits escrow and waits in FIFO order; the Reserve Admin fulfils it at the NAV of that moment, then you claim the shares.</Note>
        <Gate allowed={allowed}>
          <Grid>
            <TextField id="inv-dep" label="Deposit (BRS)" value={amount} onChange={setAmount} numeric hint={`allowed ${fmtBrs(caps.minRequest, 0)} – ${fmtBrs(caps.maxRequest, 0)} per request`} />
          </Grid>
          {depOut && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
          <Action label="request_deposit" disabled={!allowed} request={assets ? { kind: "request_deposit", assets } : null} />
        </Gate>
      </article>
      <article style={{ border: "1px solid var(--color-border)", padding: "16px 18px" }}>
        <h3 style={{ fontSize: 15, margin: 0 }}>Request a redemption</h3>
        <Note>Shares move to the pending-redemptions escrow. The Reserve Admin fills them in FIFO order, only out of free capital and never in under-coverage; you then claim the BRS.</Note>
        <Gate allowed={allowed}>
          <Grid>
            <TextField id="inv-red" label="Shares to redeem" value={sharesIn} onChange={setSharesIn} numeric hint={redValue !== null ? `PREVIEW ≈ ${fmtBrs(redValue)} at NAV now` : "reserve shares (6 decimals)"} />
          </Grid>
          {redOut && <Note tone="warn">Worth less than {fmtBrs(caps.minRequest, 0)} or more than {fmtBrs(caps.maxRequest, 0)} at the current NAV: the program will refuse it.</Note>}
          <Action label="request_redeem" disabled={!allowed} request={shares ? { kind: "request_redeem", shares } : null} />
        </Gate>
      </article>
    </div>
  );
}

export function InvestorPage() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const inv = usePoll<InvestorView>(`/api/investor${address ? `?owner=${address}` : ""}`, 10_000);
  const d = poll.data;
  const invData = inv.data && inv.data.owner === address ? inv.data : null;
  const allowed = invData?.allowlist.state === "allowlisted";
  const mine = d && address ? investorRequests(address, d.reserve.state, d.ledger) : [];
  const pending = {
    deposits: mine.filter((x) => x.side === "deposit").reduce((s, x) => s + x.waiting, 0n),
    redeemShares: mine.filter((x) => x.side === "redeem").reduce((s, x) => s + x.waiting, 0n),
  };
  return (
    <Page
      title="Investor"
      lede={
        <>
          <span style={{ display: "block", marginBottom: 10 }}>
            <RoleTag role="investor" bordered />
          </span>
          <strong style={{ color: "var(--color-text)" }}>The pilot runs on MUTAV&apos;s own capital and is not open to public investment.</strong> This is the capital provider&apos;s side of the
          reserve: allowlist status, position, queue entries and requests. Anyone can read it; only a wallet on the on-chain allowlist (KYC done off-chain) can
          send requests, and in the pilot that is MUTAV&apos;s capital wallet. Nothing here is an offer to invest.
        </>
      }
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <p className="font-mono" style={{ fontSize: 12, color: "var(--color-text-3)" }}>Reading the chain…</p>}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), inv.refresh()]); } }}>
          <Section id="allowlist" title="Allowlist" kicker="Who may request" roles={<RoleLine items={[{ role: "admin", prefix: "root set by" }]}>through set_allowlist_root; the proof is built for you from the public list.</RoleLine>}>
            {inv.error && !inv.data ? <ReadError error={inv.error} /> : <Allowlist inv={invData} />}
          </Section>
          <Section id="position" title="Position" kicker="Read from the chain">
            <Position r={d.reserve} inv={invData} pending={pending} />
          </Section>
          <Section id="requests" title="Your queue entries" kicker="FIFO" roles={<RoleLine items={[{ role: "investor", prefix: "requested, cancelled and claimed by" }, { role: "admin", prefix: "fulfilled by" }]} />}>
            <Requests owner={address} />
            <Note>Cancelling and claiming need only the request&apos;s owner, not the allowlist, and are never paused.</Note>
          </Section>
          <Section id="request" title="New request" kicker={allowed ? "Allowlisted" : "Read-only"} roles={<RoleLine items={[{ role: "investor", prefix: "signed by" }]}>with a Merkle proof of the wallet against the on-chain root.</RoleLine>}>
            <RequestForms allowed={allowed} />
          </Section>
        </LiveProvider>
      )}
    </Page>
  );
}
