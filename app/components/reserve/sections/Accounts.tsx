"use client";

/**
 * /reserve · Accounts. Renders on-chain values from /api/ledger; nothing is
 * computed here beyond sums and differences of account fields.
 */
import { Mono } from "@/components/Mono";
import { Explorer } from "@/components/Explorer";
import { type ReserveView } from "@/lib/view";
import { RoleTag } from "@/components/RoleTag";
import { ACCOUNT_ROLES, type AccountRole } from "@/lib/roles";

import { Section } from "@/components/Section";
import type { Data } from "@/components/reserve/sections/shared";

// ── Accounts ────────────────────────────────────────────────────────────────

type Row = [label: string, address: string, role: AccountRole];
type Signer = [...Row, check: string];
type Group = { id: string; title: string; rows: Row[] };

const LABEL = "font-body text-(--color-text-2) m-0 text-xs font-medium uppercase";

/** Plain-language notes for this page (lib/roles keeps the instruction-level wording for the operator and admin screens). */
const PLAIN_NOTE: Record<string, string> = {
  "signs every admin instruction": "governs the reserve (multisig)",
  "pause and revoke_operator only": "can pause the reserve and revoke the operator",
  "signs every operator instruction": "runs guarantees and claim payments",
  "written only by admin instructions": "the reserve's settings",
  "receives the fee take of contribute_fees": "receives MUTAV's fee take",
  "receives pay_claim": "receives claim payments",
  "program-owned; Nora pays issuer income here, outside NAV until swept": "issuer income lands here before it joins the reserve",
  "upgrade authority: the Reserve Admin": "upgradable by the Reserve Admin",
  "program-owned": "held by the program",
};

/** Role tag (or a dash for program-owned accounts) and its note. */
function RoleNote({ a }: { a: AccountRole }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {a.role ? <RoleTag role={a.role} /> : <Mono dim>—</Mono>}
      <span className="font-body text-(--color-text-3) text-2xs">{PLAIN_NOTE[a.note] ?? a.note}</span>
    </span>
  );
}

/** A full address that wraps inside narrow tiles instead of overflowing. */
const Address = ({ value }: { value: string }) => (
  <span style={{ wordBreak: "break-all" }}>
    <Explorer value={value} full />
  </span>
);

export function Accounts({ r }: { r: ReserveView }) {
  const P = ACCOUNT_ROLES.program;
  // The keys that sign: what a verifier checks first.
  const signers: Signer[] = [
    ["Admin (Squads vault)", r.config.admin, ACCOUNT_ROLES.admin, "Check: the address is a Squads vault, and the program's upgrade authority."],
    ["Pauser", r.config.pauser, ACCOUNT_ROLES.pauser, "Check: it can pause and revoke the operator, nothing else."],
    ["Operator", r.config.operator, ACCOUNT_ROLES.operator, "Check: its transactions register guarantees and pay claims, within the caps."],
    ["MUTAV capital wallet", r.config.mutavCapitalWallet, ACCOUNT_ROLES.capital, "Check: the only depositor in the pilot queue."],
  ];
  const groups: Group[] = [
    {
      id: "program",
      title: "Program and state",
      rows: [
        ["Program", r.programId, { role: null, note: "upgrade authority: the Reserve Admin" }],
        ["Reserve settings", r.addresses.config, ACCOUNT_ROLES.config],
        ["Reserve state", r.addresses.state, P],
        ["Reserve authority", r.addresses.vaultAuthority, P],
      ],
    },
    {
      id: "token",
      title: "Token accounts and escrows",
      rows: [
        ["Reserve token account", r.addresses.reserve, P],
        ["Pending deposits escrow", r.addresses.pendingDeposits, P],
        ["Pending redemptions escrow", r.addresses.pendingRedemptions, P],
        ["Filled redemptions escrow", r.addresses.claims, P],
      ],
    },
    {
      id: "money",
      title: "Money accounts",
      rows: [
        ["Income inbox (issuer income)", r.incomeInbox.address, ACCOUNT_ROLES.incomeInbox],
        ["Treasury account (fee take)", r.config.treasuryAccount, ACCOUNT_ROLES.treasury],
        ["Payments account (claim payments)", r.config.paymentsAccount, ACCOUNT_ROLES.payments],
      ],
    },
    {
      id: "mints",
      title: "Mints",
      rows: [
        ["Share mint", r.addresses.shareMint, P],
        ["BRS mint", r.config.reserveMint, { role: null, note: "issued by Nora" }],
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Lead: the role holders, one tile each. */}
      <div className="flex flex-col gap-3">
        <h3 id="accounts-signers" className={LABEL} style={{ letterSpacing: "0.01em" }}>
          Who signs
        </h3>
        <ul aria-labelledby="accounts-signers" className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {signers.map(([k, v, a, check]) => (
            <li key={k} className="bg-(--color-surface) flex flex-col justify-between gap-4 border p-6">
              <div className="flex flex-col gap-2">
                <span className="font-display text-(--color-text) text-base font-bold">{k}</span>
                <RoleNote a={a} />
                <span className="font-body text-(--color-text-2) text-xs leading-relaxed">{check}</span>
              </div>
              <Address value={v} />
            </li>
          ))}
        </ul>
      </div>

      {/* The rest, grouped by what each account does. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <div key={g.id} className="bg-(--color-surface) flex flex-col border">
            <h3 id={`accounts-${g.id}`} className={`${LABEL} border-b px-6 py-3`} style={{ letterSpacing: "0.01em" }}>
              {g.title}
            </h3>
            <ul aria-labelledby={`accounts-${g.id}`} className="m-0 list-none p-0">
              {g.rows.map(([k, v, a], i) => (
                <li key={k} className={`flex flex-col gap-2 px-6 py-4 ${i < g.rows.length - 1 ? "border-b" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <span className="font-body text-(--color-text) text-sm">{k}</span>
                    <RoleNote a={a} />
                  </div>
                  <Address value={v} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The Accounts section of /reserve: heading, roles and body. */
export function AccountsSection({ d }: { d: Data }) {
  return (
    <Section id="accounts" title="Accounts" kicker="Verify it yourself" subtitle="Open any address on Solana Explorer to check the numbers yourself.">
      <Accounts r={d.reserve} />
    </Section>
  );
}
