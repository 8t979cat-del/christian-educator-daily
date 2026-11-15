import type { IconName } from "@/components/ui/icon";

export const SITE = {
  name: "Christian Educator Daily",
  shortName: "CED",
  description:
    "A daily devotional and school-ministry platform for Christian teachers, administrators and schools.",
} as const;

export type NavItem = { href: string; label: string; icon: IconName };

/** Primary navigation inside the signed-in application shell. */
export const APP_NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: "sun" },
  { href: "/archive", label: "Archive", icon: "calendar" },
  { href: "/library", label: "Library", icon: "book" },
  { href: "/resources", label: "Resources", icon: "file" },
  { href: "/community", label: "Community", icon: "users" },
  { href: "/school", label: "My School", icon: "building" },
];

/** Links in the public marketing header. */
export const MARKETING_NAV = [
  { href: "/#pillars", label: "What it offers" },
  { href: "/#classroom", label: "Classroom mode" },
  { href: "/#schools", label: "For schools" },
] as const;
