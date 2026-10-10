import { permanentRedirect } from "next/navigation";

/** /dashboard was folded into /investment (requests, cancels and claims); old links keep working. */
export default function Page() {
  permanentRedirect("/investment");
}
