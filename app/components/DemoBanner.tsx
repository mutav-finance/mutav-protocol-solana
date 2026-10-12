import type { Cluster } from "@/lib/cluster";
import { ACCELERATED_CLOCK } from "@/lib/flags";

/** Top-of-page row on every route: this is a demo, and not an offer (the legal floor). */
export function DemoBanner({ cluster }: { cluster: Cluster }) {
  // On localnet nothing is on a public chain: say it's a local simulation (and,
  // for the warped-clock recording, that the clock is accelerated).
  const kicker =
    cluster === "localnet"
      ? `Local simulation${ACCELERATED_CLOCK ? " · accelerated clock" : ""}`
      : `Pilot demo · Solana ${cluster}`;
  return (
    <div
      role="note"
      aria-label="Pilot demo"
      className="font-body"
      style={{
        background: "var(--color-surface-2)",
        borderBottom: "1px solid var(--color-copper-dim)",
        color: "var(--color-text)",
        fontSize: 12,
        lineHeight: 1.5,
        padding: "8px var(--section-pad-x, 16px)",
        textAlign: "center",
      }}
    >
      <span className="font-mono" style={{ color: "var(--color-copper)", letterSpacing: "0.08em", textTransform: "uppercase", marginRight: 8 }}>
        {kicker}
      </span>
      Not open to public investment. Capital participation will open only through a regulated vehicle, to eligible investors.
    </div>
  );
}
