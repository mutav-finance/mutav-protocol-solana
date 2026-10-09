"use client";

/**
 * Top navigation for the app routes (STYLE.md §3.6): 56px bar on the canvas,
 * logo left, tabs centred with a 1px amber border on the active one, wallet
 * right; hamburger below 768px. The landing page uses its own two-nav swap.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@/components/ConnectButton";
import { ClusterBadge } from "@/components/ClusterBadge";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/", label: "home" },
  { href: "/dashboard", label: "dashboard" },
  { href: "/reserve", label: "transparency" },
  { href: "/operator", label: "operator" },
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
    // "/" is active only on the home page itself; the others also match their sub-routes.
    const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
    if (!mobile)
      return (
        <li key={l.href} className="flex list-none items-stretch">
          <Link href={l.href} aria-current={active ? "page" : undefined} className="nav-tab font-body">
            {l.label}
          </Link>
        </li>
      );
    return (
      <li key={l.href} className="flex list-none">
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          onClick={() => setOpen(false)}
          className={`font-body flex min-h-11 w-full items-center text-sm capitalize no-underline ${active ? "text-(--color-text) font-medium" : "text-(--color-text-2) hover:text-(--color-text)"}`}
          style={{ borderLeft: active ? "2px solid var(--color-accent)" : "2px solid transparent", paddingLeft: 12 }}
        >
          {l.label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main navigation" className="bg-(--color-canvas) sticky top-0 z-[100] border-b">
      <div className="relative flex h-14 items-stretch justify-between" style={{ padding: "0 var(--section-pad-x)" }}>
        <Link href="/" aria-label="MUTAV, home" className="flex shrink-0 items-center gap-2.5 no-underline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-mutav.svg" alt="MUTAV" height={24} style={{ height: 24, width: "auto", display: "block" }} />
          {/* Wordmark (STYLE.md §3.6): "mutav", Geist Bold lowercase, amber. */}
          <span className="font-display text-(--color-accent) text-xl font-bold leading-none" aria-hidden="true">mutav</span>
        </Link>
        <div className="nav-links-desktop pointer-events-none absolute inset-0 justify-center">
          <ul className="pointer-events-auto m-0 flex items-stretch p-0">{LINKS.map((l) => link(l, false))}</ul>
        </div>
        <div className="relative flex shrink-0 items-center gap-3">
          <span className="nav-cluster-desktop">
            <ClusterBadge />
          </span>
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
        <ul id="nav-mobile-panel" className="nav-mobile-panel m-0 border-t" style={{ padding: "8px var(--section-pad-x) 16px" }}>
          {LINKS.map((l) => link(l, true))}
          <li className="list-none pt-3">
            <ClusterBadge />
          </li>
        </ul>
      )}
    </nav>
  );
}
