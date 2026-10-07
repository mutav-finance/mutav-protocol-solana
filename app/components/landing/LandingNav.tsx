"use client";

/**
 * Landing "two-nav swap".
 *
 * - The full wordmark nav sits over the hero (in flow, scrolls away with it).
 * - Past the hero, a compact pinned bar with a solid CTA slides in.
 *
 * Animation is compositor-only: `transform` + `visibility`, 300ms ease-out
 * (`.compact-bar` in globals.css); reduced motion drops the transition.
 *
 * Hysteresis: two IntersectionObserver sentinels. The bar SHOWS once the
 * sentinel at the bottom of the hero has scrolled above the viewport, and
 * HIDES only when the sentinel at mid-hero comes back into view. Between the
 * two points the state holds, so small scrolls around one threshold never
 * flicker it.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { ClusterBadge } from "@/components/ClusterBadge";
import { ConnectButton } from "@/components/ConnectButton";

export function useTwoNavSwap(showRef: RefObject<HTMLElement | null>, hideRef: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = showRef.current;
    const hide = hideRef.current;
    if (!show || !hide || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === show && !e.isIntersecting && e.boundingClientRect.top < 0) setVisible(true);
        if (e.target === hide && e.isIntersecting) setVisible(false);
      }
    });
    io.observe(show);
    io.observe(hide);
    return () => io.disconnect();
  }, [showRef, hideRef]);
  return visible;
}

const LINKS = [
  ["/reserve", "Reserve"],
  ["/investor", "Investor"],
  ["/demo", "Demo"],
  ["/admin", "Admin"],
] as const;

function Links({ size }: { size: number }) {
  return (
    <ul className="nav-links-desktop" style={{ gap: 22, margin: 0, padding: 0, alignItems: "center" }}>
      {LINKS.map(([href, label]) => (
        <li key={href} style={{ listStyle: "none" }}>
          <Link href={href} className="font-mono" style={{ fontSize: size, color: "var(--color-text-2)", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The full wordmark nav, in flow at the top of the hero. */
export function HeroNav() {
  return (
    <nav aria-label="Main navigation" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px var(--section-pad-x)", gap: 16 }}>
      <Link href="/" aria-label="MUTAV, home" style={{ display: "inline-flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo-mutav.svg" alt="" height={40} style={{ height: 40, width: "auto", display: "block" }} />
        <span className="font-display" style={{ fontSize: 30, letterSpacing: "0.06em", color: "var(--color-text)", lineHeight: 1 }}>
          MUTAV
        </span>
      </Link>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Links size={13} />
        <ClusterBadge />
      </div>
    </nav>
  );
}

/** The compact bar that pins past the hero. Hidden from the a11y tree until shown. */
export function CompactBar({ visible }: { visible: boolean }) {
  return (
    <div className="compact-bar" data-visible={visible} aria-hidden={!visible} data-testid="compact-bar">
      <nav aria-label="Pinned navigation" style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 var(--page-pad)", background: "var(--color-canvas)", borderBottom: "1px solid var(--color-border)", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <Link href="/" aria-label="MUTAV, home" tabIndex={visible ? 0 : -1} style={{ display: "inline-flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-mutav.svg" alt="" height={22} style={{ height: 22, width: "auto", display: "block" }} />
          </Link>
          <Links size={12} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ConnectButton />
          <Link
            href="/reserve"
            tabIndex={visible ? 0 : -1}
            className="font-body cta-fill"
            style={{ background: "var(--color-accent)", color: "var(--color-canvas)", fontSize: 13, fontWeight: 600, padding: "8px 14px", textDecoration: "none", whiteSpace: "nowrap" }}
          >
            See the reserve
          </Link>
        </div>
      </nav>
    </div>
  );
}

/** Hero wrapper that places both sentinels and drives the compact bar. */
export function HeroWithSwap({ children }: { children: React.ReactNode }) {
  const showRef = useRef<HTMLDivElement>(null);
  const hideRef = useRef<HTMLDivElement>(null);
  const visible = useTwoNavSwap(showRef, hideRef);
  return (
    <>
      <CompactBar visible={visible} />
      <header style={{ position: "relative", borderBottom: "1px solid var(--color-border)" }}>
        <HeroNav />
        {children}
        {/* Hide point: mid-hero. Show point: the hero's bottom edge. */}
        <div ref={hideRef} aria-hidden="true" style={{ position: "absolute", top: "50%", left: 0, width: 1, height: 1 }} />
        <div ref={showRef} aria-hidden="true" style={{ position: "absolute", bottom: 0, left: 0, width: 1, height: 1 }} />
      </header>
    </>
  );
}
