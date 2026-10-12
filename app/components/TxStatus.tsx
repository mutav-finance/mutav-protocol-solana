"use client";

/**
 * Inline transaction feedback, next to the action that sent it: phase, the
 * explorer link, the accounts the instruction touched and, when the program
 * refuses it, one plain line with the error name under it and the raw error
 * and logs behind "Details". Precision Brutalism: 6px status square, mono evidence.
 */
import type { TxState } from "@/lib/client/use-tx";
import { Explorer } from "@/components/Explorer";
import { refusalLine, type RefusalContext } from "@/lib/tx-error";

const PHASE: Record<TxState["phase"], string> = {
  idle: "",
  building: "Composing transaction…",
  signing: "Waiting for your wallet to sign…",
  sending: "Sending…",
  confirming: "Confirming…",
  confirmed: "Confirmed",
  failed: "Failed",
};

export function TxStatus({ state, showAccounts = true, refusal }: { state: TxState; showAccounts?: boolean; refusal?: RefusalContext }) {
  if (state.phase === "idle") return null;
  const color = state.phase === "confirmed" ? "var(--color-success)" : state.phase === "failed" ? "var(--color-error)" : "var(--color-copper)";
  return (
    <div role="status" aria-live="polite" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, background: color, flexShrink: 0 }} />
        <span className="font-body" style={{ fontSize: 12, color }}>
          {state.phase === "failed" && state.errorName ? "Refused" : PHASE[state.phase]}
          {state.proposalIndex !== null && state.phase === "confirmed" ? ` — Squads proposal #${state.proposalIndex} created and approved by you` : ""}
        </span>
        {state.signature && <Explorer kind="tx" value={state.signature} />}
      </div>
      {state.error && state.errorName ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <p className="font-body" style={{ fontSize: 14, color: "var(--color-text)", margin: 0, lineHeight: 1.5 }}>
            {refusalLine(state.errorName, refusal)}
          </p>
          <span className="font-mono" style={{ fontSize: 11, color: "var(--color-error)" }}>{state.errorName}</span>
          <details>
            <summary className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)", cursor: "pointer" }}>Details</summary>
            <pre className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)", margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {[state.error, ...(state.logs ?? [])].join("\n")}
            </pre>
          </details>
        </div>
      ) : state.error ? (
        <p className="font-mono" style={{ fontSize: 11, color: "var(--color-error)", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {state.error}
        </p>
      ) : null}
      {showAccounts && state.instructions && (
        <details>
          <summary className="font-mono" style={{ fontSize: 11, color: "var(--color-text-3)", cursor: "pointer" }}>
            Accounts touched ({state.instructions.reduce((n, ix) => n + ix.accounts.length, 0)})
          </summary>
          <ul style={{ margin: "8px 0 0", padding: 0 }}>
            {state.instructions.flatMap((ix, i) =>
              ix.accounts.map((a, j) => (
                <li key={`${i}-${j}`} style={{ listStyle: "none", display: "flex", gap: 8, alignItems: "baseline" }}>
                  <span className="font-mono" style={{ fontSize: 10, color: "var(--color-text-3)", width: 34 }}>
                    {a.signer ? "sig" : ""}
                    {a.writable ? (a.signer ? "+w" : "w") : a.signer ? "" : "r"}
                  </span>
                  <Explorer value={a.address} />
                </li>
              )),
            )}
          </ul>
        </details>
      )}
    </div>
  );
}
