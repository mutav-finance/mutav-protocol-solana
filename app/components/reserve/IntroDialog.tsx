"use client";

/**
 * "How to read this page": three short steps that open on a reader's first
 * visit to /reserve and again from the ? beside the live line. Each step pairs
 * one sentence with one piece of evidence read from the chain.
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useFmt } from "@/components/MoneyProvider";
import type { ReserveView } from "@/lib/view";

/** localStorage key: set once the reader finishes or skips the steps. */
export const INTRO_SEEN_KEY = "mutav-transparency-intro-v1";

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    // Private windows and blocked storage: the steps simply open again next visit.
  }
}

export function IntroDialog({ r, onClose }: { r: ReserveView; onClose: () => void }) {
  const fmtBrs = useFmt();
  const [step, setStep] = useState(0);
  const next = useRef<HTMLButtonElement>(null);
  const covered = r.solvency.stableAssets >= r.solvency.coverageRequired;
  const steps = [
    {
      title: "Every number on this page is read from Solana.",
      body: "The page reads the MUTAV program's accounts every 10 seconds. Nothing is typed in by hand, and no wallet is needed to look.",
      evidence: `Program ${r.programId}`,
    },
    {
      title: "One question: can the reserve cover every guarantee?",
      body: "Stable assets must stay above coverage required. If they fall below it, the program stops new guarantees and redemptions, never claim payments.",
      evidence: `${fmtBrs(r.solvency.stableAssets)} held ${covered ? "≥" : "<"} ${fmtBrs(r.solvency.coverageRequired)} required`,
    },
    {
      title: "Check it yourself.",
      body: "Every figure links to its account on Solana Explorer. Open the Verify tab for the program, the keys that sign and every account.",
      evidence: "Governed by a Squads multisig",
    },
  ];
  const s = steps[step];
  const last = step === steps.length - 1;
  const close = () => {
    markSeen();
    onClose();
  };

  useEffect(() => next.current?.focus(), [step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(14,15,17,.92)" }}>
      <div role="dialog" aria-modal="true" aria-labelledby="intro-h" className="bg-(--color-surface) flex w-full max-w-[520px] flex-col border" style={{ borderTop: "3px solid var(--color-accent)" }}>
        <div className="flex flex-col gap-4 p-8">
          <span className="font-body text-(--color-text-3) text-[11px] uppercase tabular-nums" style={{ letterSpacing: "0.08em" }}>
            How to read this page · {step + 1} of {steps.length}
          </span>
          <h2 id="intro-h" className="font-display text-(--color-text) m-0 text-2xl leading-tight font-bold tracking-tight text-balance">
            {s.title}
          </h2>
          <p className="font-body text-(--color-text-2) m-0 text-sm leading-relaxed text-pretty">{s.body}</p>
          <span className="font-mono text-(--color-text) bg-(--color-surface-2) border px-4 py-3 text-xs break-all">{s.evidence}</span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t px-8 py-4">
          <span className="flex gap-1.5" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className="size-1.5" style={{ background: i === step ? "var(--color-accent)" : "#3A3D44" }} />
            ))}
          </span>
          <span className="flex items-center gap-3">
            <Button variant="ghost" className="text-(--color-text-2) h-10" onClick={close}>
              Skip
            </Button>
            <Button ref={next} className="h-10 px-5 font-semibold" onClick={() => (last ? close() : setStep(step + 1))}>
              {last ? "Open the reserve" : "Next →"}
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
