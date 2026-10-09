"use client";

/**
 * Access dialog over the dashboard: no wallet connected, or a wallet that is
 * not on the allowlist. It blocks the page until a wallet connects; "Back"
 * leaves for the home page. Under the dev mock chain, Escape also closes it
 * so the page can be reviewed without a wallet.
 * A canvas scrim and a bordered surface card: no glass, no shadow, and no
 * amber fill (the connect button is the one amber element on screen).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConnectButton } from "@/components/ConnectButton";
import { StatusBadge } from "@/components/StatusBadge";
import type { AllowlistState } from "@/lib/allowlist";
import { MOCK } from "./shared";

export function AccessGate({ connected, state }: { connected: boolean; state: AllowlistState | null }) {
  const [open, setOpen] = useState(true);
  const blocked = !connected || (state !== null && state !== "allowlisted");
  useEffect(() => {
    if (!MOCK || !open || !blocked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, blocked]);
  if (!open || !blocked) return null;
  const title = connected ? "Wallet not allowlisted" : "Connect your wallet";
  const body = connected ? "This wallet can only view the dashboard." : "Connect the allowlisted wallet to send requests.";
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: "color-mix(in oklab, var(--color-canvas) 80%, transparent)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="gate-h" aria-describedby="gate-b" className="bg-(--color-surface) flex w-full max-w-[400px] flex-col gap-4 border p-6">
        <StatusBadge color="var(--color-copper)" label="ALLOWLIST ONLY" />
        <div className="flex flex-col gap-2">
          <h2 id="gate-h" className="font-display text-(--color-text) m-0 text-lg font-bold">
            {title}
          </h2>
          <p id="gate-b" className="font-body text-(--color-text) m-0 text-sm">
            {body}
          </p>
          <p className="font-body text-(--color-text-3) m-0 text-xs leading-relaxed">The pilot runs on MUTAV&apos;s own capital and is not open to public investment.</p>
        </div>
        {/* Connect sits on the right so its wallet menu (right-aligned) opens inside the card. */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button asChild variant="ghost">
            <Link href="/">Back</Link>
          </Button>
          {!connected && <ConnectButton />}
        </div>
      </div>
    </div>
  );
}
