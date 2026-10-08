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
import { Page, ReadError } from "@/components/Section";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleTag } from "@/components/RoleTag";
import { LiveProvider, Note } from "@/components/demo/shared";
import { type Mode } from "@/components/admin/shared";
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

/** Sticky in-page nav, under the site bar (56px + hairline). */
function SectionNav() {
  return (
    <nav aria-label="Admin sections" style={{ position: "sticky", top: 57, zIndex: 90, background: "var(--color-canvas)", borderBottom: "1px solid var(--color-border)", margin: "0 0 8px", padding: "10px 0", display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
      {ADMIN_SECTIONS.map((s, i) => (
        <a key={s.id} href={`#${s.id}`} className="font-mono ext-link" style={{ fontSize: 12, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {String(i + 1).padStart(2, "0")} {s.label}
        </a>
      ))}
    </nav>
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
      lede={<><span style={{ display: "block", marginBottom: 10 }}><RoleTag role="admin" bordered /></span>For members of MUTAV&apos;s admin multisig: general controls, the money flows the admin acts on, and where the reserve&apos;s assets sit. Wallets sign; this page holds no key.</>}
    >
      {poll.error && !d && <ReadError error={poll.error} />}
      {d && (
        <LiveProvider value={{ reserve: d.reserve, ledger: d.ledger, refresh: async () => { await Promise.all([poll.refresh(), sq.refresh()]); } }}>
          <SectionNav />
          {mode?.via === "direct" && (
            <div role="note" style={{ border: "1px solid var(--color-copper)", padding: "10px 14px", marginBottom: 8 }}>
              <StatusBadge color="var(--color-copper)" label="DIRECT SIGNING · LOCALNET ONLY" />
              <Note>The configured admin is a plain local key, not a Squads vault. Actions are signed directly by that key. On devnet every admin action is a proposal.</Note>
            </div>
          )}
          <General mode={mode} sq={sq.data} sqError={sq.error} onSquadsDone={() => void sq.refresh()} />
          <Money mode={mode} />
          <Allocation mode={mode} />
        </LiveProvider>
      )}
    </Page>
  );
}
