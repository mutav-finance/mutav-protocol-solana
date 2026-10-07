import { NavShell } from "@/components/NavShell";
import { SiteFooter } from "@/components/SiteFooter";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <NavShell />
      <div id="main-content" tabIndex={-1} style={{ outline: "none", display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
        {children}
      </div>
      <SiteFooter />
    </>
  );
}
