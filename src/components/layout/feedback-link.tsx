"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** "Report a problem" link. It carries only the path of the current page (never query text) so a report says where it happened. */
export function FeedbackLink() {
  const path = usePathname();
  const safe = path && /^\/[A-Za-z0-9/_\-\[\]]*$/.test(path) && !path.startsWith("/feedback") ? path : "";
  return (
    <Link
      href={safe ? `/feedback?page=${encodeURIComponent(safe)}` : "/feedback"}
      className="flex min-h-11 items-center rounded-control px-3 text-sm text-muted hover:bg-brand-soft hover:text-ink"
    >
      Feedback
    </Link>
  );
}
