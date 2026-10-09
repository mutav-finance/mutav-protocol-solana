/**
 * Landing header: the same app nav as every other page (NavShell, sticky), over
 * the hero. One navigation across the site, same font and position.
 */
import { NavShell } from "@/components/NavShell";

/** Hero wrapper: the shared nav, then the hero content. */
export function HeroWithSwap({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavShell />
      <header style={{ position: "relative", borderBottom: "1px solid var(--color-border)" }}>{children}</header>
    </>
  );
}
