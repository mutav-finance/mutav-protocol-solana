"use client";

/**
 * /dashboard — the capital provider's view (the Investor role). Everyone can
 * read it; only a wallet whose Merkle proof verifies against the on-chain
 * allowlist root can send `request_deposit` / `request_redeem` (the server
 * builds the proof from ALLOWLIST). Cancels and claims need only the request's
 * owner (spec §5.5). The pilot runs on MUTAV's own capital and is not open to
 * public investment; its allowlisted capital provider is MUTAV's capital wallet.
 *
 * Layout after lending/AMM dashboards: a summary strip, the wallet's requests,
 * and a deposit / redeem action card. Same reads and requests as before.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { assetsFor } from "@mutav-finance/mutav-protocol-solana";
import { ReadError } from "@/components/Section";
import { Explorer } from "@/components/Explorer";
import { InfoTooltip } from "@/components/InfoTooltip";
import { Mono } from "@/components/Mono";
import { RoleTag } from "@/components/RoleTag";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "@/components/WalletProvider";
import { Action, LiveProvider, Note, useLive } from "@/components/demo/shared";
import { ALLOWLIST_TEXT, type AllowlistState } from "@/lib/allowlist";
import { usePoll } from "@/lib/client/use-poll";
import { fmtBps, fmtBrs, fmtShares, fmtTime, parseBrs, SHARE_DECIMALS } from "@/lib/format";
import type { InvestorView } from "@/lib/server/investor";
import { investorRequests, type Ledger, type ReserveView } from "@/lib/view";

/** Dev only: with the mock chain and no wallet, preview MUTAV's capital wallet. */
const MOCK = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_MOCK_CHAIN === "1";

const STATE_BADGE: Record<AllowlistState, { label: string; color: string }> = {
  allowlisted: { label: "ALLOWLISTED", color: "var(--color-success)" },
  "not-listed": { label: "NOT ON THE ALLOWLIST · READ-ONLY", color: "var(--color-copper)" },
  "root-unset": { label: "ALLOWLIST EMPTY · READ-ONLY", color: "var(--color-copper)" },
  "list-mismatch": { label: "ALLOWLIST UNVERIFIABLE · READ-ONLY", color: "var(--color-error)" },
};

const ACTION_LABEL = { cancel_deposit: "Cancel deposit", claim_shares: "Claim shares", cancel_redeem: "Cancel redemption", claim_assets: "Claim BRS" } as const;

const label = "font-body text-(--color-text-2) text-xs font-medium uppercase";
const tracking = { letterSpacing: "0.01em" };

function Panel({ title, info, aside, children, flush = false }: { title: string; info?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="bg-(--color-surface) flex min-w-0 flex-col border">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <span className="flex items-center gap-2">
          <h2 className="font-display text-(--color-text) m-0 text-base font-bold">{title}</h2>
          {info && <InfoTooltip label={`About ${title}`}>{info}</InfoTooltip>}
        </span>
        {aside}
      </header>
      <div className={flush ? "flex flex-col" : "flex flex-col gap-4 p-6"}>{children}</div>
    </section>
  );
}

/** The position, inline in the page header: label over figure, no boxes. */
function HeaderStats({ r, inv, pending, owner }: { r: ReserveView; inv: InvestorView | null; pending: { deposits: bigint; redeemShares: bigint }; owner: string | null }) {
  if (!owner) return <Note>Connect a wallet to see its position.</Note>;
  const s = r.state;
  const shares = inv?.shares.amount ?? 0n;
  const value = assetsFor(shares, s.sharesOutstanding, r.solvency.netAssets);
  const ownBps = s.sharesOutstanding === 0n ? 0n : (shares * 10_000n) / s.sharesOutstanding;
  const stat = (k: string, v: ReactNode, note: ReactNode, tip?: ReactNode) => (
    <div className="flex min-w-0 max-w-[200px] flex-col gap-1">
      <span className="font-body text-(--color-text-2) flex items-center gap-2 text-xs">
        {k}
        {tip && <InfoTooltip label={`About ${k}`}>{tip}</InfoTooltip>}
      </span>
      <Mono style={{ fontSize: "clamp(17px, 4.6vw, 22px)", fontWeight: 700, lineHeight: 1.1, color: "var(--color-text)", whiteSpace: "nowrap" }}>{v}</Mono>
      <span className="font-mono text-(--color-text-3) text-2xs">{note}</span>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:flex-wrap sm:gap-x-8">
      {stat("Value at NAV now", inv ? fmtBrs(value) : "—", "PREVIEW · math mirror", "The client's math mirror of the program's assets_for(shares), on the current accounts. A redemption is priced at the NAV of its fill, not now.")}
      {stat("Reserve shares held", inv ? fmtShares(shares) : "—", inv?.shares.amount === null ? "no share account yet" : `${fmtBps(ownBps)} of shares outstanding`)}
      {stat("BRS in wallet", inv && inv.brs.amount !== null ? fmtBrs(inv.brs.amount) : "—", inv?.brs.amount === null ? "no BRS account yet" : "associated token account")}
      {stat("Waiting in the queue", fmtBrs(pending.deposits), `deposits · ${fmtShares(pending.redeemShares)} sh to redeem`, "Escrowed and not yet fulfilled (deposits) or filled (redemptions).")}
    </div>
  );
}

function Requests({ owner }: { owner: string | null }) {
  const { reserve, ledger } = useLive();
  const rows = investorRequests(owner, reserve.state, ledger);
  if (!owner) return <div className="p-6"><Note>Connect a wallet to see its requests. The whole queue is public on <Link href="/reserve/queue" className="ext-link">/reserve/queue</Link>.</Note></div>;
  if (rows.length === 0) return <div className="p-6"><Note>This wallet has no open request.</Note></div>;
  return (
    <div className="table-wrap border-0">
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
                <div className="flex flex-wrap gap-2">
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

/** One side of the action card: a large amount field with the wallet balance and Max. */
function AmountField({ id, title, unit, value, onChange, balance, onMax }: { id: string; title: string; unit: string; value: string; onChange: (v: string) => void; balance: ReactNode; onMax?: () => void }) {
  return (
    <div className="bg-(--color-canvas) flex flex-col gap-3 border p-4">
      <label htmlFor={id} className={label} style={tracking}>
        {title}
      </label>
      <div className="flex items-center gap-3">
        <Input id={id} value={value} inputMode="decimal" onChange={(e) => onChange(e.target.value)} className="font-mono h-12 border-0 bg-transparent px-0 text-2xl font-bold shadow-none focus-visible:ring-0" />
        <span className="font-mono text-(--color-text-2) shrink-0 text-sm">{unit}</span>
      </div>
      <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
        <span>{balance}</span>
        {onMax && (
          <Button type="button" variant="ghost" size="sm" onClick={onMax} className="h-6 px-2 text-2xs">
            Max
          </Button>
        )}
      </div>
    </div>
  );
}

function ActionCard({ allowed, inv }: { allowed: boolean; inv: InvestorView | null }) {
  const { reserve } = useLive();
  const caps = reserve.config.caps;
  const [amount, setAmount] = useState("10000");
  const [sharesIn, setSharesIn] = useState("2000");
  const assets = parseBrs(amount);
  const shares = parseBrs(sharesIn, SHARE_DECIMALS);
  const depOut = assets !== null && (assets < caps.minRequest || assets > caps.maxRequest);
  const redValue = shares ? assetsFor(shares, reserve.state.sharesOutstanding, reserve.solvency.netAssets) : null;
  const redOut = redValue !== null && (redValue < caps.minRequest || redValue > caps.maxRequest);
  const brs = inv?.brs.amount ?? null;
  const held = inv?.shares.amount ?? null;
  const limits = `${fmtBrs(caps.minRequest, 0)} – ${fmtBrs(caps.maxRequest, 0)} per request`;
  const gate = !allowed && <Note tone="warn">Read-only: only an allowlisted wallet can send this. The program checks the Merkle proof on-chain.</Note>;
  return (
    <Panel title="New request" aside={<RoleTag role="investor" />} info="Signed by the Investor's wallet, with a Merkle proof of the wallet against the on-chain allowlist root.">
      <Tabs defaultValue="deposit">
        <TabsList className="w-full">
          <TabsTrigger value="deposit" className="flex-1">Deposit</TabsTrigger>
          <TabsTrigger value="redeem" className="flex-1">Redeem</TabsTrigger>
        </TabsList>
        <TabsContent value="deposit" className="flex flex-col gap-4">
          <AmountField
            id="dash-dep"
            title="You deposit"
            unit="BRS"
            value={amount}
            onChange={setAmount}
            balance={<>Wallet {brs === null ? "—" : fmtBrs(brs)}</>}
            onMax={brs !== null && brs > 0n ? () => setAmount((Number(brs) / 1e6).toString()) : undefined}
          />
          <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
            <span>limits {limits}</span>
            <InfoTooltip label="How a deposit works">BRS moves to the pending-deposits escrow and waits in FIFO order; the Reserve Admin fulfils it at the NAV of that moment, then you claim the shares.</InfoTooltip>
          </div>
          {depOut && <Note tone="warn">Outside the per-request limits: the program will refuse it.</Note>}
          <Action label="request_deposit" disabled={!allowed} request={assets ? { kind: "request_deposit", assets } : null} />
          {gate}
        </TabsContent>
        <TabsContent value="redeem" className="flex flex-col gap-4">
          <AmountField
            id="dash-red"
            title="You redeem"
            unit="shares"
            value={sharesIn}
            onChange={setSharesIn}
            balance={<>Held {held === null ? "—" : fmtShares(held)}</>}
            onMax={held !== null && held > 0n ? () => setSharesIn((Number(held) / 10 ** SHARE_DECIMALS).toString()) : undefined}
          />
          <div className="font-mono text-(--color-text-3) flex items-center justify-between gap-2 text-2xs">
            <span>{redValue !== null ? `PREVIEW ≈ ${fmtBrs(redValue)} at NAV now` : "reserve shares (6 decimals)"}</span>
            <InfoTooltip label="How a redemption works">Shares move to the pending-redemptions escrow. The Reserve Admin fills them in FIFO order, only out of free capital and never in under-coverage; you then claim the BRS.</InfoTooltip>
          </div>
          {redOut && <Note tone="warn">Worth less than {fmtBrs(caps.minRequest, 0)} or more than {fmtBrs(caps.maxRequest, 0)} at the current NAV: the program will refuse it.</Note>}
          <Action label="request_redeem" disabled={!allowed} request={shares ? { kind: "request_redeem", shares } : null} />
          {gate}
        </TabsContent>
      </Tabs>
    </Panel>
  );
}

function Allowlist({ inv, connected }: { inv: InvestorView | null; connected: boolean }) {
  const state = inv?.allowlist.state ?? null;
  return (
    <Panel
      title="Allowlist"
      aside={<RoleTag role="admin" />}
      info="The Reserve Admin sets the root through set_allowlist_root; the proof is built for you from the public list. KYC is done off-chain."
    >
      <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed">
        {state ? ALLOWLIST_TEXT[state] : connected ? "Checking the allowlist…" : "Connect a wallet to check it against the allowlist. Without one, this view is read-only."}
      </p>
      {inv && (
        <Mono dim style={{ fontSize: 11, wordBreak: "break-all" }}>
          {`on-chain root ${inv.allowlist.root.slice(0, 24)}… · ${inv.allowlist.listSize} wallet${inv.allowlist.listSize === 1 ? "" : "s"} in the server's public ALLOWLIST`}
        </Mono>
      )}
    </Panel>
  );
}

export function DashboardPage() {
  const { address } = useWallet();
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const d = poll.data;
  const previewOwner = !address && MOCK && d ? d.reserve.config.mutavCapitalWallet : null;
  const owner = address ?? previewOwner;
  const inv = usePoll<InvestorView>(`/api/investor${owner ? `?owner=${owner}` : ""}`, 10_000);
  const invData = inv.data && inv.data.owner === owner ? inv.data : null;
  const allowed = !!address && invData?.allowlist.state === "allowlisted";
  const mine = d && owner ? investorRequests(owner, d.reserve.state, d.ledger) : [];
  const pending = {
    deposits: mine.filter((x) => x.side === "deposit").reduce((s, x) => s + x.waiting, 0n),
    redeemShares: mine.filter((x) => x.side === "redeem").reduce((s, x) => s + x.waiting, 0n),
  };
  const state = owner && invData ? invData.allowlist.state : null;
  const pad = { paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" };
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6 border-b py-8" style={pad}>
        <div className="flex min-w-0 max-w-[400px] flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-(--color-text) m-0 text-3xl font-bold tracking-tight">Dashboard</h1>
            <RoleTag role="investor" bordered />
          </div>
          <p className="font-body text-(--color-text-2) m-0 text-sm">
            The pilot runs on MUTAV&apos;s own capital and is not open to public investment. Nothing here is an offer to invest.{" "}
            <InfoTooltip label="About this dashboard">
              The capital provider&apos;s side of the reserve: allowlist status, position, queue entries and requests. Anyone can read it; only a wallet on the on-chain
              allowlist (KYC done off-chain) can send requests, and in the pilot that is MUTAV&apos;s capital wallet.
            </InfoTooltip>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {state ? (
              <StatusBadge color={STATE_BADGE[state].color} label={STATE_BADGE[state].label} />
            ) : (
              <StatusBadge color="var(--color-text-3)" label={owner ? "CHECKING THE ALLOWLIST…" : "NO WALLET CONNECTED · READ-ONLY"} />
            )}
            {owner && <Explorer value={owner} />}
            {previewOwner && <span className="font-mono text-(--color-copper) text-2xs uppercase">mock · viewing as MUTAV&apos;s capital wallet</span>}
          </div>
        </div>
        {d && (inv.error && !inv.data ? <ReadError error={inv.error} /> : <HeaderStats r={d.reserve} inv={invData} pending={pending} owner={owner} />)}
      </header>
      <main className="flex w-full flex-1 flex-col gap-6 py-6 md:py-8" style={pad}>
      {poll.error && !d && <ReadError error={poll.error} />}
      {!d && !poll.error && <p className="font-mono text-(--color-text-3) text-xs">Reading the chain…</p>}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), inv.refresh()]); } }}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex min-w-0 flex-col lg:col-span-7">
              <ActionCard allowed={allowed} inv={invData} />
            </div>
            <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
              <Allowlist inv={invData} connected={!!owner} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-3">
              <Panel
                flush
                title="Your queue entries"
                aside={<span className="flex gap-3"><RoleTag role="investor" /><RoleTag role="admin" /></span>}
                info="Requested, cancelled and claimed by the Investor; fulfilled by the Reserve Admin in FIFO order. Cancelling and claiming need only the request's owner, not the allowlist, and are never paused."
              >
                <Requests owner={owner} />
              </Panel>
              <Mono dim style={{ fontSize: 11 }}>
                {invData?.holderState ? <>HolderState <Explorer value={invData.holderState.address} /> · last shares in {fmtTime(invData.holderState.lastSharesInTs)}</> : "No HolderState yet: it is created by the first request_deposit or claim_shares."}
              </Mono>
          </div>
        </LiveProvider>
      )}
      </main>
    </div>
  );
}
