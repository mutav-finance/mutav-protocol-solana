"use client";

/**
 * A full on-chain address with its two verify actions: copy and open on
 * Solana Explorer. The address wraps instead of overflowing narrow cells.
 */
import { useEffect, useState } from "react";
import { Explorer } from "@/components/Explorer";
import { Button } from "@/components/ui/button";

export function CopyAddress({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="font-mono text-(--color-text-2) h-7 px-2 text-2xs uppercase"
      style={{ letterSpacing: "0.06em" }}
      aria-label={`Copy the ${label} address`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => setCopied(true), () => {});
      }}
    >
      <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
    </Button>
  );
}

/** Address (full, linked to Explorer) and a copy action, on one line when it fits. */
export function AddressLine({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="min-w-0" style={{ wordBreak: "break-all" }}>
        <Explorer value={value} full />
      </span>
      <CopyAddress value={value} label={label} />
    </span>
  );
}
