import { describe, expect, it } from "vitest";
import { SIMULATION_NOTE, showSimulationNote } from "@/components/SimulationNote";

describe("accelerated-clock simulation note", () => {
  it("shows only with the accelerated clock on localnet", () => {
    expect(showSimulationNote(true, "localnet")).toBe(true);
    expect(showSimulationNote(true, "devnet")).toBe(false);
    expect(showSimulationNote(false, "localnet")).toBe(false);
  });
  it("says it is a simulation, not a return", () => {
    expect(SIMULATION_NOTE).toBe("Simulation of reserve mechanics · not an expected return");
  });
});
