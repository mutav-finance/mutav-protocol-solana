import { permanentRedirect } from "next/navigation";

/** Renamed to /reserve/ledger (the Money tab became Ledger). */
export default function Page() {
  permanentRedirect("/reserve/ledger");
}
