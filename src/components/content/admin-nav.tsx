import { COMMUNITY_ENABLED } from "@/lib/site";
import Link from "next/link";
import { getAccessContext } from "@/lib/auth/session";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/admin/devotionals", label: "Devotionals" },
  { href: "/admin/submissions", label: "Submissions" },
  { href: "/admin/themes", label: "Weekly themes" },
  { href: "/admin/translations", label: "Translations" },
  { href: "/admin/contributors", label: "Contributors" },
  { href: "/admin/resources", label: "Resources" },
  { href: "/admin/billing", label: "Plans and billing", adminOnly: true },
  { href: "/admin/analytics", label: "Analytics", adminOnly: true },
  { href: "/admin/launch", label: "Launch", adminOnly: true },
  { href: "/admin/pilot", label: "Pilot", adminOnly: true },
  { href: "/admin/feedback", label: "Feedback", adminOnly: true },
  { href: "/admin/audit", label: "Audit and retention", adminOnly: true },
  { href: "/community/moderation", label: "Moderation", moderationOnly: true },
  { href: "/admin", label: "Staff" },
] as const;

type NavLink = (typeof LINKS)[number];

/**
 * Navigation for staff screens. Which links appear is decided here from the signed-in person's
 * roles, so every page shows the same, correct set. Each destination checks the role again.
 */
export async function AdminNav({ current, isAdmin }: { current: string; isAdmin?: boolean }) {
  const ctx = await getAccessContext();
  const roles = ctx?.platformRoles ?? [];
  const admin = isAdmin ?? roles.includes("platform_admin");
  const moderator = admin || roles.includes("moderator");
  const visible = LINKS.filter((link) => {
    const l = link as NavLink & { adminOnly?: boolean; moderationOnly?: boolean };
    if (l.adminOnly) return admin;
    if (l.moderationOnly) return moderator && COMMUNITY_ENABLED;
    return true;
  });
  return (
    <nav aria-label="Staff tools" className="-mt-2 mb-8 flex flex-wrap gap-1 border-b border-line pb-3">
      {visible.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center rounded-control px-4 font-medium",
            link.href === current ? "bg-brand-soft text-brand" : "text-muted hover:bg-brand-soft hover:text-ink",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
