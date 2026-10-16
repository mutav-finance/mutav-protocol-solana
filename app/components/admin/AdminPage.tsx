"use client";

/**
 * /admin — for Squads members, in three sections: General controls (the
 * cross-cutting settings and the stop switches), Money in & out (each flow
 * with its settings and the admin's queue fills), and Allocation (where the
 * reserve's assets sit). Every admin change is a Squads v4 vault-transaction
 * proposal signed from members' wallets; pause and revoke_operator are signed
 * directly by the pauser key. When the configured admin is not a Squads vault
 * (localnet only), actions can be signed directly, clearly labelled.
 */
import { useEffect, useState } from "react";
import { Page, ReadError } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { MoneyProvider } from "@/components/MoneyProvider";
import { ReserveStats } from "@/components/ReserveStats";
import { RoleTag } from "@/components/RoleTag";
import { LiveProvider, Note } from "@/components/demo/shared";
import { PendingSetConfig, type Mode } from "@/components/admin/shared";
import { pendingSetConfig } from "@/lib/config-diff";
import type { SquadsResp } from "@/components/admin/Squads";
import { General } from "@/components/admin/General";
import { Money } from "@/components/admin/Money";
import { Allocation } from "@/components/admin/Allocation";
import { ADMIN_SECTIONS } from "@/lib/admin";
import { CLUSTER } from "@/lib/client/env";
import { usePoll } from "@/lib/client/use-poll";
import type { Ledger, ReserveView } from "@/lib/view";

function modeOf(sq: SquadsResp | null): Mode {
  if (sq?.configured && sq.adminIsVault) return { via: "squads", label: "Squads proposal" };
  if (CLUSTER === "localnet") return { via: "direct", label: "Direct signing · localnet only" };
  return null;
}

/**
 * Sticky in-page nav under the site bar, in the /reserve tab style: body
 * font, 2px amber underline on the section in view.
 */
function SectionNav() {
  const [active, setActive] = useState<string>(ADMIN_SECTIONS[0].id);
  useEffect(() => {
    const els = ADMIN_SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
  return (
    <div className="bg-(--color-canvas) sticky top-14 z-[90] mb-2 border-b">
      <nav aria-label="Admin sections" className="scroll-dark scroll-fade-x -mb-px flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {ADMIN_SECTIONS.map((s) => {
          const on = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "location" : undefined}
              onClick={() => setActive(s.id)}
              className={`font-body inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm whitespace-nowrap no-underline ${on ? "text-(--color-text) border-(--color-accent) font-medium" : "text-(--color-text-2) hover:text-(--color-text) border-transparent"}`}
            >
              {s.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}

export function AdminPage() {
  const poll = usePoll<{ reserve: ReserveView; ledger: Ledger }>("/api/ledger", 10_000);
  const sq = usePoll<SquadsResp>("/api/squads", 10_000);
  const mode = modeOf(sq.data);
  const d = poll.data;
  return (
    <MoneyProvider>
    <Page
      kicker={`Admin · Solana ${CLUSTER}`}
      title="Admin console"
      lede={<>For members of MUTAV&apos;s admin multisig: general controls, the money flows the admin acts on, and where the reserve&apos;s assets sit. Every change is a Squads proposal; wallets sign; this page holds no key.</>}
      aside={<RoleTag role="admin" bordered />}
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), sq.refresh()]); } }}>
          <PendingSetConfig.Provider value={sq.data?.configured ? pendingSetConfig(sq.data.multisig.proposals) : null}>
          <ReserveStats r={d.reserve} />
          <SectionNav />
          {mode?.via === "direct" && (
            <div role="note" style={{ border: "1px solid var(--color-border)", padding: "10px 14px", marginBottom: 8 }}>
              <StatusBadge color="var(--color-text-3)" label="DIRECT SIGNING · LOCALNET ONLY" />
              <Note>The configured admin is a plain local key, not a Squads vault. Actions are signed directly by that key. On devnet every admin action is a proposal.</Note>
            </div>
          )}
          <General mode={mode} sq={sq.data} sqError={sq.error} onSquadsDone={() => void sq.refresh()} />
          <Money mode={mode} />
          <Allocation mode={mode} />
          </PendingSetConfig.Provider>
        </LiveProvider>
      )}
    </Page>
    </MoneyProvider>
  );
}
