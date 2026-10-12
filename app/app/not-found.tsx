import type { Metadata } from "next";
import Link from "next/link";
import { NavShell } from "@/components/NavShell";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Not found" };

/**
 * The app's 404: the same nav, dark canvas and footer as every route (the
 * root layout keeps the demo banner above it), an amber mono kicker and one
 * way back, to Transparency.
 */
export default function NotFound() {
  return (
    <>
      <NavShell />
      <main
        id="main-content"
        tabIndex={-1}
        className="bg-(--color-canvas) flex w-full flex-1 flex-col justify-center gap-4 py-20"
        style={{ outline: "none", paddingLeft: "var(--section-pad-x)", paddingRight: "var(--section-pad-x)" }}
      >
        <span className="font-mono text-(--color-accent) text-xs uppercase" style={{ letterSpacing: "0.12em" }}>
          404 · Not found
        </span>
        <h1 className="font-display text-(--color-text) m-0 leading-[1.05] uppercase" style={{ fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
          Nothing here
        </h1>
        <p className="font-body text-(--color-text-2) m-0 max-w-[560px] text-sm text-pretty">
          This address is not a page of the MUTAV pilot. The reserve&apos;s figures, read live from Solana, are on Transparency.
        </p>
        <div className="pt-2">
          <Button asChild variant="outline" className="h-10 px-5">
            <Link href="/reserve">Go to Transparency →</Link>
          </Button>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
