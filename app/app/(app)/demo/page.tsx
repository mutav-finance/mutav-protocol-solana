import { permanentRedirect } from "next/navigation";

/** The guided demo folded into the operator console (/operator); old links keep working. */
export default function Page() {
  permanentRedirect("/operator");
}
