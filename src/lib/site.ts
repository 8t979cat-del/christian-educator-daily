import type { IconName } from "@/components/ui/icon";

export const SITE = {
  name: "Everyday Devotional: 180 Days",
  /** The wordmark and its numeral mark, set together in the logo. */
  wordmark: "Everyday Devotional",
  mark: "180",
  description:
    "A classroom devotional for every day of the school year, at your students' reading level, ready to present in a minute.",
} as const;

export type NavItem = { href: string; label: string; icon: IconName };

/**
 * Community (discussions, prayers, groups, moderation) is built but not launched.
 * While false it is left out of every menu and its pages send people to Today.
 * Set to true to turn it on.
 */
export const COMMUNITY_ENABLED = false;

/** Primary navigation inside the signed-in application shell. */
export const APP_NAV: NavItem[] = ([
  { href: "/today", label: "Today", icon: "sun" },
  { href: "/archive", label: "Archive", icon: "calendar" },
  { href: "/library", label: "Library", icon: "book" },
  { href: "/create", label: "Write", icon: "presentation" },
  { href: "/resources", label: "Resources", icon: "file" },
  { href: "/community", label: "Community", icon: "users" },
  { href: "/school", label: "My School", icon: "building" },
] satisfies NavItem[]).filter((item) => COMMUNITY_ENABLED || !item.href.startsWith("/community"));

/** Links in the public marketing header. */
export const MARKETING_NAV = [
  { href: "/#year", label: "How it works" },
  { href: "/#classroom", label: "Classroom mode" },
  { href: "/#founding", label: "Founding schools" },
] as const;
