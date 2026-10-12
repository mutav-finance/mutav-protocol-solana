import { ReserveShell } from "@/components/reserve/ReserveShell";

export default function ReserveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <ReserveShell>{children}</ReserveShell>;
}
