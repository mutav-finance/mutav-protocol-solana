"use client";

/**
 * /reserve · Accounts. Answers "who can act on the reserve, and where do I
 * check it?". Lead: the three accounts a reader checks first (ProofCards),
 * then the four keys that sign. Then the program and every
 * account it uses, grouped by job, each with copy and Explorer. Addresses come
 * from /api/ledger; nothing is hardcoded.
 */
import type { ReactNode } from "react";
import { PauserTag, RoleTag } from "@/components/RoleTag";
import { type ReserveView } from "@/lib/view";
import { ACCOUNT_ROLES, type AccountRole } from "@/lib/roles";
import { Section } from "@/components/Section";
import { ProofCards } from "@/components/reserve/ProofCards";
import { AddressLine } from "@/components/reserve/accounts/AddressLine";
import { BlockHead, PlusMark } from "@/components/reserve/sections/shared";
import type { Data } from "@/components/reserve/sections/shared";

type Signer = { name: string; address: string; a: AccountRole; does: string; tag?: ReactNode };
type Row = { name: string; address: string; a: AccountRole };
type Group = { id: string; title: string; open?: boolean; rows: Row[] };

const LABEL = "font-body text-(--color-text-2) m-0 text-xs font-medium uppercase";
const LABEL_STYLE = { letterSpacing: "0.01em" } as const;

/**
 * Plain notes for this page, keyed by the instruction-level wording in
 * lib/roles. Program-owned accounts get no note: the "Program-owned" tag says it.
 */
const PLAIN_NOTE: Record<string, string> = {
  "written only by admin instructions": "The reserve's settings",
  "receives the fee take of contribute_fees": "Receives the MUTAV fee",
  "receives pay_claim": "Receives claim payments",
  "program-owned; Nora pays issuer income here, outside NAV until swept": "Issuer income waits here until swept",
  "upgrade authority: the Reserve Admin": "Upgradable by the Reserve Admin",
  "issued by Nora": "Issued by Nora",
};

/** Who owns the account: its role tag, or "Program-owned". */
function Owner({ a }: { a: AccountRole }) {
  if (a.role) return <RoleTag role={a.role} />;
  // The program itself and the BRS mint are not program-owned: their note says who controls them.
  if (!a.note.startsWith("program-owned")) return null;
  return (
    <span className="font-mono text-(--color-text-3) text-2xs uppercase" style={{ letterSpacing: "0.06em" }}>
      Program-owned
    </span>
  );
}

/** One account row: name, owner and note on the left; full address with copy and Explorer on the right. */
function AccountRow({ row, last }: { row: Row; last: boolean }) {
  const note = PLAIN_NOTE[row.a.note];
  return (
    <li className={`grid grid-cols-1 gap-2 px-6 py-4 md:grid-cols-[minmax(200px,280px)_1fr] md:items-center md:gap-6 ${last ? "" : "border-b"}`}>
      <div className="flex flex-col gap-1">
        <span className="font-body text-(--color-text) text-sm">{row.name}</span>
        <span className="inline-flex flex-wrap items-center gap-2">
          <Owner a={row.a} />
          {note && <span className="font-body text-(--color-text-3) text-2xs">{note}</span>}
        </span>
      </div>
      <AddressLine value={row.address} label={row.name} />
    </li>
  );
}

export function Accounts({ r }: { r: ReserveView }) {
  const P = ACCOUNT_ROLES.program;

  // Hero: the keys that sign. What a verifier checks first.
  const signers: Signer[] = [
    { name: "Reserve Admin (Squads multisig)", address: r.config.admin, a: ACCOUNT_ROLES.admin, does: "Governs the reserve. Also the program's upgrade authority." },
    {
      name: "Pauser",
      address: r.config.pauser,
      a: ACCOUNT_ROLES.pauser,
      does: "Can pause and revoke the operator. Nothing else.",
      // Its own key, held on the Reserve Admin side: a PAUSER tag (admin colour, hollow), so it does not read as the admin.
      tag: <PauserTag suffix={<span className="font-body text-(--color-text-3) text-2xs normal-case" style={{ letterSpacing: 0 }}>held on the Reserve Admin side</span>} />,
    },
    { name: "Operator", address: r.config.operator, a: ACCOUNT_ROLES.operator, does: "Registers guarantees and pays claims, within the caps." },
    { name: "MUTAV capital wallet", address: r.config.mutavCapitalWallet, a: ACCOUNT_ROLES.capital, does: "Requests deposits and redemptions through the queue, like any approved wallet." },
  ];

  // The root every account below derives from: always visible.
  const program: Row = { name: "Program", address: r.programId, a: { role: null, note: "upgrade authority: the Reserve Admin" } };

  // Ordered by what a reader looks for: where money lands, then state, escrows, mints.
  const groups: Group[] = [
    {
      id: "money",
      title: "Money accounts",
      open: true,
      rows: [
        { name: "Issuer income account", address: r.incomeInbox.address, a: ACCOUNT_ROLES.incomeInbox },
        { name: "MUTAV fee account", address: r.config.treasuryAccount, a: ACCOUNT_ROLES.treasury },
        { name: "Payments account", address: r.config.paymentsAccount, a: ACCOUNT_ROLES.payments },
      ],
    },
    {
      id: "state",
      title: "Reserve state",
      rows: [
        { name: "Reserve settings", address: r.addresses.config, a: ACCOUNT_ROLES.config },
        { name: "Reserve state", address: r.addresses.state, a: P },
        { name: "Reserve authority", address: r.addresses.vaultAuthority, a: P },
      ],
    },
    {
      id: "token",
      title: "Token accounts and the line",
      rows: [
        { name: "Reserve token account", address: r.addresses.reserve, a: P },
        { name: "Deposits waiting in line", address: r.addresses.pendingDeposits, a: P },
        { name: "Redemptions waiting in line", address: r.addresses.pendingRedemptions, a: P },
        { name: "Collection account (redeemed BRS)", address: r.addresses.claims, a: P },
      ],
    },
    {
      id: "mints",
      title: "Mints",
      rows: [
        { name: "Share mint", address: r.addresses.shareMint, a: P },
        { name: "BRS mint", address: r.config.reserveMint, a: { role: null, note: "issued by Nora" } },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* [B] Hero: who signs. One strip, 1px dividers, full addresses. */}
      <div className="flex flex-col gap-3">
        <BlockHead id="accounts-signers" title="Who signs" />
        <ul aria-labelledby="accounts-signers" className="bg-(--color-border) m-0 grid list-none grid-cols-1 gap-px border p-0 md:grid-cols-2">
          {signers.map((s) => (
            <li key={s.name} className="bg-(--color-surface) flex flex-col gap-4 p-6">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <span className="font-display text-(--color-text) text-base font-bold">{s.name}</span>
                  {s.tag ?? <Owner a={s.a} />}
                </div>
                <span className="font-body text-(--color-text-2) text-sm">{s.does}</span>
              </div>
              <AddressLine value={s.address} label={s.name} />
            </li>
          ))}
        </ul>
      </div>

      {/* [E] Detail: the program, then every account it uses, grouped by job. */}
      <div className="flex flex-col gap-3">
        <BlockHead id="accounts-all" title="Every account" />

        <div className="flex flex-col border" aria-labelledby="accounts-all" role="group">
          <ul className="bg-(--color-surface) m-0 list-none border-b p-0">
            <AccountRow row={program} last />
          </ul>
          {groups.map((g, gi) => (
            <details key={g.id} open={g.open} className={`group ${gi < groups.length - 1 ? "border-b" : ""}`}>
              <summary className="font-body text-(--color-text-2) hover:text-(--color-text) flex cursor-pointer list-none items-center gap-3 px-6 py-3 [&::-webkit-details-marker]:hidden">
                <PlusMark />
                <span id={`accounts-${g.id}`} className={LABEL} style={LABEL_STYLE}>
                  {g.title}
                </span>
                <span className="font-mono text-(--color-text-3) text-2xs">{g.rows.length}</span>
              </summary>
              <ul aria-labelledby={`accounts-${g.id}`} className="bg-(--color-surface) m-0 list-none border-t p-0">
                {g.rows.map((row, i) => (
                  <AccountRow key={row.name} row={row} last={i === g.rows.length - 1} />
                ))}
              </ul>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The Accounts section of /reserve: heading and body. */
export function AccountsSection({ d }: { d: Data }) {
  return (
    <Section id="accounts" title="Accounts" kicker="Verify it yourself" subtitle="Who can act on the reserve, and every address to check.">
      <div className="flex flex-col gap-10">
        <ProofCards r={d.reserve} />
        <Accounts r={d.reserve} />
      </div>
    </Section>
  );
}
