/**
 * Mono — shared Evidence-layer span (JetBrains Mono, tabular nums).
 *
 * Use only for figures, addresses, hashes, timestamps and code identifiers.
 * Prose, sub-notes, captions, labels, empty states and helper text use the
 * body font (`font-body`). Layer 3 of the MUTAV three-layer typography system.
 */

import React from "react";

interface MonoProps {
  children: React.ReactNode;
  /** Inline style overrides (color, fontSize, etc.) */
  style?: React.CSSProperties;
  /** Additional Tailwind / CSS classes */
  className?: string;
  /** Dim variant — uses --color-text-3 instead of inheriting */
  dim?: boolean;
  /** Copper variant — uses --color-copper instead of inheriting */
  copper?: boolean;
}

export function Mono({ children, style, className = "", dim = false, copper = false }: MonoProps) {
  return (
    <span
      className={`font-mono ${className}`}
      style={{
        fontFeatureSettings: '"tnum" 1',
        fontVariantNumeric: "tabular-nums",
        ...(dim ? { color: "var(--color-text-3)" } : {}),
        ...(copper ? { color: "var(--color-copper)" } : {}),
        ...style,
      }}
    >
      {children}
    </span>
  );
}
