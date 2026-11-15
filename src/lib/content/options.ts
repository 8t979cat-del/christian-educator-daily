import type { SchoolRole } from "@/lib/auth/roles";

/** Fixed lists. Values match database constraints and reference rows (checked by tests). */

export const CATEGORIES = [
  { slug: "patience", name: "Patience" },
  { slug: "compassion", name: "Compassion" },
  { slug: "forgiveness", name: "Forgiveness" },
  { slug: "gratitude", name: "Gratitude" },
  { slug: "perseverance", name: "Perseverance" },
  { slug: "purpose", name: "Purpose" },
  { slug: "humility", name: "Humility" },
  { slug: "leadership", name: "Leadership" },
  { slug: "stewardship", name: "Stewardship" },
  { slug: "courage", name: "Courage" },
  { slug: "integrity", name: "Integrity" },
  { slug: "service", name: "Service" },
  { slug: "relationships", name: "Relationships" },
  { slug: "anxiety-uncertainty", name: "Anxiety and uncertainty" },
  { slug: "burnout-encouragement", name: "Burnout and encouragement" },
] as const;
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [string, ...string[]];
export const categoryName = (slug: string | null | undefined): string =>
  CATEGORIES.find((c) => c.slug === slug)?.name ?? "Uncategorized";

export const AUDIENCES = [
  { value: "teachers", label: "Classroom teachers" },
  { value: "school_leaders", label: "School leaders and administrators" },
  { value: "all_staff", label: "All faculty and staff" },
] as const;
export const AUDIENCE_VALUES = AUDIENCES.map((a) => a.value) as [string, ...string[]];

export const EDUCATIONAL_CATEGORIES = [
  { value: "classroom", label: "In the classroom" },
  { value: "faculty_community", label: "Faculty community" },
  { value: "faith_and_learning", label: "Faith and learning" },
  { value: "school_leadership", label: "School leadership" },
  { value: "personal_renewal", label: "Personal renewal" },
] as const;
export const EDUCATIONAL_CATEGORY_VALUES = EDUCATIONAL_CATEGORIES.map((c) => c.value) as [string, ...string[]];

export const GRADE_BANDS = [
  { value: "k2", label: "K to grade 2" },
  { value: "g35", label: "Grades 3 to 5" },
  { value: "g68", label: "Grades 6 to 8" },
  { value: "g912", label: "Grades 9 to 12" },
] as const;
export const GRADE_BAND_VALUES = GRADE_BANDS.map((g) => g.value) as [string, ...string[]];

export const label = <T extends readonly { value: string; label: string }[]>(list: T, value: string | null | undefined): string =>
  list.find((item) => item.value === value)?.label ?? "Not set";

/** Six workflow states. "Editorial" covers the first three, "publication" the last three. */
export const STATUSES = ["draft", "in_review", "approved", "scheduled", "published", "archived"] as const;
export type DevotionalStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<DevotionalStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  archived: "Archived",
};

export const editorialStatus = (s: DevotionalStatus): "Draft" | "In review" | "Approved" =>
  s === "draft" ? "Draft" : s === "in_review" ? "In review" : "Approved";

export const publicationStatus = (s: DevotionalStatus): "Unpublished" | "Scheduled" | "Published" | "Archived" =>
  s === "scheduled" ? "Scheduled" : s === "published" ? "Published" : s === "archived" ? "Archived" : "Unpublished";

export type { SchoolRole };
