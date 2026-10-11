/**
 * "Who does what": the three roles, each with the instructions the program
 * accepts its signature for (from lib/roles, which mirrors the program's
 * signer checks). Same tags as on /reserve, /investor, /demo and /admin.
 */
import Link from "next/link";
import { RoleMarker, RoleTag } from "@/components/RoleTag";
import { instructionsBy, PAUSER_OR_ADMIN, ROLE_META, type Role } from "@/lib/roles";

const NOTE: Partial<Record<Role, string>> = {
  admin: "Every change goes through a time-locked Squads proposal. Only pause is instant, and a separate pauser key can also send it.",
  operator: "The only writer for guarantees, guarantee fees and claims. It cannot change config or fulfil the queue. Today MUTAV's team signs by hand; later mutav-app's backend sends these with a KMS-held key.",
  investor: "The pilot runs on MUTAV's own capital and is not open to public investment. Requests are gated by an allowlist (KYC off-chain, Merkle proof on-chain); in the pilot the allowlisted capital provider is MUTAV's capital wallet.",
};

const PAGE: Partial<Record<Role, [string, string]>> = {
  admin: ["/admin", "Admin console"],
  operator: ["/operator", "Operator console"],
  investor: ["/investor", "Investor view"],
};

export function WhoDoesWhat() {
  const roles: Role[] = ["admin", "operator", "investor"];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ol className="role-grid" style={{ margin: 0, padding: 0 }}>
        {roles.map((role) => {
          const m = ROLE_META[role];
          return (
            <li key={role} data-role={role} style={{ listStyle: "none", borderTop: `2px solid ${m.color}`, background: "var(--color-surface)", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ fontSize: 18, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                <RoleMarker role={role} size={12} />
                {m.label}
              </h3>
              <p className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)", margin: 0 }}>{m.holder}</p>
              <p className="font-body" style={{ fontSize: 14, color: "var(--color-text)", margin: 0, lineHeight: 1.5 }}>{m.duty}</p>
              <ul aria-label={`Instructions signed by the ${m.label}`} style={{ margin: 0, padding: 0, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {instructionsBy(role).map((ix) => (
                  <li key={ix} style={{ listStyle: "none" }}>
                    <code className="font-mono" style={{ fontSize: 11, color: "var(--color-text-2)", border: "1px solid var(--color-border)", padding: "2px 6px", display: "inline-block" }}>
                      {ix}
                      {PAUSER_OR_ADMIN.has(ix) ? " · pauser" : ""}
                    </code>
                  </li>
                ))}
              </ul>
              {NOTE[role] && <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-2)", margin: 0, lineHeight: 1.5 }}>{NOTE[role]}</p>}
              {PAGE[role] && (
                <Link href={PAGE[role]![0]} className="font-mono ext-link" style={{ fontSize: 12, alignSelf: "flex-start", marginTop: "auto" }}>
                  {PAGE[role]![1]} →
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      <p className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)", margin: 0, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <RoleTag role="anyone" /> can send <code className="font-mono">refresh</code> and <code className="font-mono">advance_queue_head</code>: cranks that move no funds.
      </p>
    </div>
  );
}
