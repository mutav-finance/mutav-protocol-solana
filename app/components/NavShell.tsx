"use client";

/**
 * Top navigation for the app routes (/reserve, /demo, /admin). Ported from
 * mutav-pulse: 56px bar, border-bottom only, amber underline on the active
 * link, hamburger below 768px. The landing page uses its own two-nav swap.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { ClusterBadge } from "@/components/ClusterBadge";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/reserve", label: "reserve" },
  { href: "/demo", label: "demo" },
  { href: "/admin", label: "admin" },
];

export function NavShell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        (document.querySelector(".nav-hamburger") as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const link = (l: (typeof LINKS)[number], mobile: boolean) => {
    const active = pathname.startsWith(l.href);
    return (
      <li key={l.href} style={{ listStyle: "none", display: "flex" }}>
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className="font-mono"
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: active ? "var(--color-text)" : "var(--color-text-2)",
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            borderBottom: active ? "1px solid var(--color-accent)" : "1px solid transparent",
            ...(mobile ? { width: "100%", minHeight: 44, display: "flex", alignItems: "center" } : { paddingBottom: 1 }),
          }}
        >
          {l.label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main navigation" style={{ background: "var(--color-canvas)", borderBottom: "1px solid var(--color-border)", position: "sticky", top: 0, zIndex: 100 }}>
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--page-pad)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <Link href="/" aria-label="MUTAV, home" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mutav.svg" alt="MUTAV" height={24} style={{ height: 24, width: "auto", display: "block" }} />
            <span className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)", letterSpacing: "0.08em" }}>
              PILOT
            </span>
          </Link>
          <ul className="nav-links-desktop" style={{ alignItems: "center", gap: 22, margin: 0, padding: 0 }}>
            {LINKS.map((l) => link(l, false))}
          </ul>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ClusterBadge />
          <ConnectButton />
          <Button
            type="button"
            variant="ghost"
            className="nav-hamburger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="nav-mobile-panel"
            onClick={() => setOpen((v) => !v)}
            style={{ width: 44, height: 44, border: "1px solid var(--color-border)", color: "var(--color-text-2)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" style={{ width: 18, height: 18 }}>
              {open ? <path d="M5 5l14 14M19 5L5 19" /> : <path d="M3 6h18M3 12h18M3 18h18" />}
            </svg>
          </Button>
        </div>
      </div>
      {open && (
        <ul id="nav-mobile-panel" className="nav-mobile-panel" style={{ margin: 0, padding: "8px var(--page-pad) 16px", borderTop: "1px solid var(--color-border)" }}>
          {LINKS.map((l) => link(l, true))}
        </ul>
      )}
    </nav>
  );
}
