import { permanentRedirect } from "next/navigation";

/** /investor became /dashboard, then /investment, now /capital; old links keep working. */
export default function Page() {
  permanentRedirect("/capital");
}
