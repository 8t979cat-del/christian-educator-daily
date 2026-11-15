import Link from "next/link";
import type { GroupRole } from "@/lib/community/types";

export type GroupTab = "feed" | "members" | "moderation" | "settings";

/** Section navigation for one group. Only tabs the person can use are shown. */
export function GroupTabs({ groupId, current, role }: { groupId: string; current: GroupTab; role: GroupRole | null }) {
  const base = `/community/groups/${groupId}`;
  const tabs: Array<{ key: GroupTab; label: string; href: string; show: boolean }> = [
    { key: "feed", label: "Conversation", href: base, show: true },
    { key: "members", label: "Members", href: `${base}/members`, show: role !== null },
    { key: "moderation", label: "Moderation", href: `${base}/moderation`, show: role === "owner" || role === "moderator" },
    { key: "settings", label: "Settings", href: `${base}/settings`, show: role === "owner" },
  ];
  return (
    <nav aria-label="Group sections" className="mb-6 border-b border-line">
      <ul className="-mb-px flex flex-wrap gap-1">
        {tabs.filter((t) => t.show).map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              aria-current={current === t.key ? "page" : undefined}
              className={"inline-flex min-h-11 items-center border-b-2 px-4 font-semibold " + (current === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink")}
            >
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
