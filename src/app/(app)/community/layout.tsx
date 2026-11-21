import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { COMMUNITY_ENABLED } from "@/lib/site";

/** Community is not launched yet: every page under /community sends people to Today. */
export default function CommunityLayout({ children }: { children: ReactNode }) {
  if (!COMMUNITY_ENABLED) redirect("/today");
  return children;
}
