import type { Metadata } from "next";
import "./globals.css";
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-front="investidor" data-cluster={CLUSTER} className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <a href="#main-content" className="skip-link font-body">
          Skip to content
        </a>
        <WalletProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
