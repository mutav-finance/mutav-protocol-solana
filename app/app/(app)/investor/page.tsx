import { permanentRedirect } from "next/navigation";

/** /investor became /dashboard, then /investment; old links keep working. */
export default function Page() {
  permanentRedirect("/investment");
}
