import { permanentRedirect } from "next/navigation";

/** No app landing: MUTAV's landing is mutav.finance; the pilot app opens on Transparency. */
export default function Page() {
  permanentRedirect("/reserve");
}
