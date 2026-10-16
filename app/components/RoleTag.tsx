/**
 * RoleTag — who does this. One colour per role on the brand's 6px-square
 * badge mark (STYLE.md: square + mono label), used on every page: Reserve
 * Admin, Operator, Investor filled; Anyone hollow. The pauser key, held on the
 * Reserve Admin side, gets the admin colour hollow ({@link PauserTag}). The
 * text label is always shown, so a role never reads from colour alone.
 */
import type { ReactNode } from "react";
import { ROLE_META, type Role } from "@/lib/roles";

/** The 6px square: filled, or a 1px hollow outline. */
export function SquareMark({ color, hollow = false, size = 6 }: { color: string; hollow?: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, flexShrink: 0, display: "inline-block", boxSizing: "border-box", background: hollow ? "transparent" : color, border: hollow ? `1px solid ${color}` : undefined }}
    />
  );
}

export function RoleMarker({ role, size = 6 }: { role: Role; size?: number }) {
  const { color, marker } = ROLE_META[role];
  return <SquareMark color={color} hollow={marker === "hollow"} size={size} />;
}

const TAG_STYLE = {
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: "2px 8px",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-2)",
  verticalAlign: "middle",
  maxWidth: "100%",
} as const;

/** The pauser key's tag: the admin colour, hollow (its own key on the Reserve Admin side, not the multisig). */
export function PauserTag({ suffix }: { suffix?: ReactNode }) {
  return (
    <span className="font-mono" data-role="pauser" style={TAG_STYLE}>
      <SquareMark color={ROLE_META.admin.color} hollow />
      <span style={{ color: "var(--color-text)", whiteSpace: "nowrap" }}>Pauser</span>
      {suffix}
    </span>
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
        ...TAG_STYLE,
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
export function RoleLegend({ withAnyone = false, centered = false }: { withAnyone?: boolean; centered?: boolean }) {
  const roles: Role[] = withAnyone ? ["admin", "operator", "investor", "anyone"] : ["admin", "operator", "investor"];
  return (
    <div role="list" aria-label="Roles" style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: centered ? "center" : undefined }}>
      {roles.map((r) => (
        <span role="listitem" key={r}>
          <RoleTag role={r} bordered />
        </span>
      ))}
    </div>
  );
}
