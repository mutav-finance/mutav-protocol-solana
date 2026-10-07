/**
 * RoleTag — who does this. One colour and one shape per role, used on every
 * page: Reserve Admin ■, Operator ◆, Investor ▲, Anyone ○. The text label is
 * always shown, so a role never reads from colour alone.
 */
import type { ReactNode } from "react";
import { ROLE_META, type Role } from "@/lib/roles";

export function RoleMarker({ role, size = 8 }: { role: Role; size?: number }) {
  const { color, marker } = ROLE_META[role];
  const s = size;
  return (
    <svg width={s} height={s} viewBox="0 0 10 10" aria-hidden="true" style={{ flexShrink: 0, display: "block" }}>
      {marker === "square" && <rect x="1" y="1" width="8" height="8" fill={color} />}
      {marker === "diamond" && <path d="M5 0 L10 5 L5 10 L0 5 Z" fill={color} />}
      {marker === "triangle" && <path d="M5 0.5 L9.8 9.5 L0.2 9.5 Z" fill={color} />}
      {marker === "ring" && <rect x="1.5" y="1.5" width="7" height="7" fill="none" stroke={color} strokeWidth="1.5" />}
    </svg>
  );
}

/**
 * `bordered`: a standalone chip with a role-coloured hairline. Plain: marker +
 * label, for table cells and inline text. `prefix` reads before the label
 * ("by", "requested by").
 */
export function RoleTag({ role, bordered = false, prefix, suffix }: { role: Role; bordered?: boolean; prefix?: string; suffix?: ReactNode }) {
  const m = ROLE_META[role];
  return (
    <span
      className="font-mono"
      data-role={role}
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: "2px 6px",
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: "var(--color-text-2)",
        verticalAlign: "middle",
        maxWidth: "100%",
        ...(bordered ? { border: `1px solid ${m.color}`, padding: "3px 8px", background: "var(--color-surface)" } : {}),
      }}
    >
      <RoleMarker role={role} />
      {prefix && <span style={{ color: "var(--color-text-3)" }}>{prefix}</span>}
      <span style={{ color: "var(--color-text)", whiteSpace: "nowrap" }}>{m.label}</span>
      {suffix}
    </span>
  );
}

/** "Signed by" line under a section or action: one tag per role involved. */
export function RoleLine({ items, children }: { items: { role: Role; prefix?: string }[]; children?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 14px" }}>
      {items.map((it) => (
        <RoleTag key={`${it.prefix ?? ""}${it.role}`} role={it.role} prefix={it.prefix} />
      ))}
      {children && (
        <span className="font-body" style={{ fontSize: 12, color: "var(--color-text-3)" }}>
          {children}
        </span>
      )}
    </div>
  );
}

/** A compact key of the three roles (plus "Anyone" when asked), for page headers. */
export function RoleLegend({ withAnyone = false }: { withAnyone?: boolean }) {
  const roles: Role[] = withAnyone ? ["admin", "operator", "investor", "anyone"] : ["admin", "operator", "investor"];
  return (
    <div role="list" aria-label="Roles" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {roles.map((r) => (
        <span role="listitem" key={r}>
          <RoleTag role={r} bordered />
        </span>
      ))}
    </div>
  );
}
