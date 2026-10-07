"use client";

/** The live reserve strip on the landing page: six on-chain numbers linking to /reserve, and coverage against the reserve as a chart. */
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { SolvencyChart } from "@/components/charts/Charts";
import { usePoll } from "@/lib/client/use-poll";
import { fmtBrs, fmtNav } from "@/lib/format";
import { MODE_LABEL, type ReserveView } from "@/lib/view";

export function LiveStrip() {
  const { data, error } = usePoll<ReserveView>("/api/reserve", 15_000);
  const cells: [string, string, string?][] = data
    ? [
        ["Reserve", fmtBrs(data.solvency.stableAssets)],
        ["Coverage required", fmtBrs(data.solvency.coverageRequired)],
        ["Free capital", fmtBrs(data.solvency.freeCapital)],
        ["NAV per share", fmtNav(data.state.navPerShare)],
        ["Active guarantees", String(data.state.activeGuarantees)],
        ["Mode", MODE_LABEL(data.state.mode), data.state.mode === 0 ? "var(--color-success)" : "var(--color-error)"],
      ]
    : ["Reserve", "Coverage required", "Free capital", "NAV per share", "Active guarantees", "Mode"].map((k) => [k, "—"]);

  return (
    <section aria-label="Live reserve" data-testid="live-strip" style={{ borderBottom: "1px solid var(--color-border)", padding: "0 var(--section-pad-x)" }}>
      <Link href="/reserve" style={{ display: "block", textDecoration: "none", color: "inherit" }} aria-label="Live reserve numbers — open the reserve page">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 0 0" }}>
          <span className="live-dot" aria-hidden="true" />
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.08em", color: "var(--color-text-3)" }}>
            {data ? `LIVE FROM ${data.cluster.toUpperCase()} · SLOT ${data.slot}` : error ? ((error as { notConfigured?: boolean }).notConfigured ? "DEPLOYING TO DEVNET · LIVE NUMBERS SOON" : "COULD NOT READ THE CHAIN") : "READING THE CHAIN…"}
          </span>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 0, margin: 0, padding: "10px 0 18px" }}>
          {cells.map(([k, v, color]) => (
            <div key={k} style={{ padding: "6px 16px 6px 0" }}>
              <dt className="font-body" style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-2)" }}>
                {k}
              </dt>
              <dd style={{ margin: "6px 0 0" }}>
                <Mono style={{ fontSize: 20, color: color ?? "var(--color-text)" }}>{v}</Mono>
              </dd>
            </div>
          ))}
        </dl>
      </Link>
      {data && (
        <div style={{ padding: "0 0 18px", maxWidth: 720 }}>
          <SolvencyChart s={data.solvency} ratioBps={data.config.coverageRatioBps} compact />
        </div>
      )}
    </section>
  );
}
