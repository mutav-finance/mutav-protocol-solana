import { permanentRedirect } from "next/navigation";

/** /dashboard was folded into /investment, now /capital (requests, cancels and claims); old links keep working. */
export default function Page() {
  permanentRedirect("/capital");
}
