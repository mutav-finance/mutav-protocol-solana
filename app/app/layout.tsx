import type { Metadata } from "next";
import { connection } from "next/server";
import "./globals.css";
import { DemoBanner } from "@/components/DemoBanner";
import { WalletProvider } from "@/components/WalletProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { parseCluster } from "@/lib/cluster";

// Fail the build and every render on a mainnet (or unknown) cluster.
const CLUSTER = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);

export const metadata: Metadata = {
  title: { default: "MUTAV pilot reserve", template: "%s · MUTAV pilot" },
  description:
    "MUTAV is an institutional rental guarantor in Brazil. Every guarantee is backed by a reserve anyone can verify on Solana.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render per request, so Next can put proxy.ts's CSP nonce on its scripts (A6).
  await connection();
  return (
    <html lang="en" data-front="investidor" data-cluster={CLUSTER} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link font-body">
          Skip to content
        </a>
        <DemoBanner cluster={CLUSTER} />
        <WalletProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
