"use client";

/** The live reserve strip on the landing page: six on-chain numbers linking to /reserve, and coverage against the reserve as a chart. */
import type { ReactNode } from "react";
import Link from "next/link";
import { Mono } from "@/components/Mono";
import { Money, MoneyProvider, UsdSource } from "@/components/MoneyProvider";
import { CoverageChart } from "@/components/charts/Charts";
import { usePoll } from "@/lib/client/use-poll";
import { fmtNav } from "@/lib/format";
import { MODE_LABEL, type ReserveView } from "@/lib/view";

/** BRS figures with their US$ hints (MoneyProvider reads /api/fx). */
export function LiveStrip() {
  return (
    <MoneyProvider>
      <Strip />
    </MoneyProvider>
  );
}

function Strip() {
  const { data, error } = usePoll<ReserveView>("/api/reserve", 15_000);
  const cells: [string, ReactNode, string?][] = data
    ? [
        ["Reserve", <Money key="r" brs={data.coverage.stableAssets} block />],
        ["Coverage required", <Money key="c" brs={data.coverage.coverageRequired} block />],
        ["Free capital", <Money key="f" brs={data.coverage.freeCapital} block />],
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
      <UsdSource className="pb-4" />
      {data && (
        <div style={{ padding: "0 0 18px", maxWidth: 720 }}>
          <CoverageChart s={data.coverage} ratioBps={data.config.coverageRatioBps} compact />
        </div>
      )}
    </section>
  );
}
