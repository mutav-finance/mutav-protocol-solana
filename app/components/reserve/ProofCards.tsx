"use client";

/**
 * The accounts a reader checks first, each on Explorer with one plain-English
 * line: the program (and who can upgrade it), the reserve token account, and
 * the BRS mint (and who can freeze it). Leads the Verify tab.
 */
import { Explorer } from "@/components/Explorer";
import { Mono } from "@/components/Mono";
import { Lead } from "@/components/reserve/sections/shared";
import type { ReserveView } from "@/lib/view";

type Extra = { label: string; value: React.ReactNode; note?: string };

function Card({ title, address, what, extra, rpc }: { title: string; address: string; what: [string, string]; extra?: Extra; rpc: string }) {
  return (
    <li className="bg-(--color-surface) flex min-w-0 list-none flex-col gap-3 border p-6">
      <span className="font-body text-(--color-text-2) text-xs font-medium uppercase" style={{ letterSpacing: "0.01em" }}>
        {title}
      </span>
      <span className="min-w-0 text-sm">
        <Explorer value={address} rpc={rpc} />
      </span>
      <Lead lead={what[0]}>{what[1]}</Lead>
      {extra && (
        <span className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-3">
          <span className="font-body text-(--color-text-3) text-xs">{extra.label}</span>
          <span className="text-sm">{extra.value}</span>
          {extra.note && <span className="font-body text-(--color-text-3) text-xs">{extra.note}</span>}
        </span>
      )}
    </li>
  );
}

export function ProofCards({ r }: { r: ReserveView }) {
  const rpc = r.explorerRpc;
  return (
    <section aria-labelledby="proof-h" className="flex flex-col gap-4">
      <h3 id="proof-h" className="font-display text-(--color-text) m-0 text-base font-bold">
        On-chain, by design
      </h3>
      <ul className="m-0 grid gap-4 p-0" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))" }}>
        <Card
          title="Program"
          address={r.programId}
          rpc={rpc}
          what={["The code that enforces the reserve's rules.", "Every capital movement, fee and claim payment runs through it."]}
          extra={{ label: "Upgrade authority", value: <Explorer value={r.config.admin} rpc={rpc} />, note: "Reserve Admin (Squads multisig)" }}
        />
        <Card title="Reserve token account" address={r.addresses.reserve} rpc={rpc} what={["Where the reserve balance sits.", "Only the program can move it, and only by its rules."]} />
        <Card
          title="BRS mint"
          address={r.token.mint}
          rpc={rpc}
          what={["The token the reserve holds.", "BRS, a stablecoin pegged to the Brazilian real, from the BRS issuer (Nora)."]}
          extra={{
            label: "Freeze authority",
            value: r.token.freezeAuthority ? <Explorer value={r.token.freezeAuthority} rpc={rpc} /> : <Mono style={{ fontSize: 12 }}>none</Mono>,
            note: r.token.freezeAuthority ? "can freeze any BRS account, the reserve's included" : undefined,
          }}
        />
      </ul>
    </section>
  );
}
