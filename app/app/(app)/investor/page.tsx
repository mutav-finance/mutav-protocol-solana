import { redirect } from "next/navigation";

/** /investor was renamed /dashboard; old links keep working. */
export default function Page() {
  redirect("/dashboard");
}
