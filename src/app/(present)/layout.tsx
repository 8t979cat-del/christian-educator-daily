import type { ReactNode } from "react";
import { requireAccess } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Full-screen layout for presenting to a class: no navigation, access still checked. */
export default async function PresentLayout({ children }: { children: ReactNode }) {
  await requireAccess();
  return <>{children}</>;
}
