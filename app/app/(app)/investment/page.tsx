import { permanentRedirect } from "next/navigation";

/** /investment became /capital (the capital queue); old links keep working. */
export default function Page() {
  permanentRedirect("/capital");
}
