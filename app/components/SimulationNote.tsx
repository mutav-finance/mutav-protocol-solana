"use client";

/**
 * The accelerated-clock caveat: on a localnet recording with
 * `NEXT_PUBLIC_ACCELERATED_CLOCK=1`, the share price moves months in minutes,
 * so figures that grow with time say they are a simulation. Renders nothing
 * on devnet or without the flag.
 */
import { ACCELERATED_CLOCK } from "@/lib/flags";
import { CLUSTER } from "@/lib/client/env";

export const SIMULATION_NOTE = "Simulation of reserve mechanics · not an expected return";

/** Whether the caveat shows: the accelerated clock on localnet only. */
export const showSimulationNote = (flag: boolean = ACCELERATED_CLOCK, cluster: string = CLUSTER) => flag && cluster === "localnet";

export function SimulationNote({ className = "" }: { className?: string }) {
  if (!showSimulationNote()) return null;
  return (
    <span data-testid="simulation-note" className={`font-body text-(--color-text-3) text-2xs leading-snug ${className}`}>
      {SIMULATION_NOTE}
    </span>
  );
}
