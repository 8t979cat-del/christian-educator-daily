import { EMPTY_DOC, sanitizeRichDoc, type RichDoc } from "./richtext";
import type { DevotionalStatus } from "./options";
import { toLevels, type Levels } from "./levels";

export type DevotionalRecord = {
  id: string;
  title: string;
  devotional_date: string;
  theme_id: string | null;
  daily_topic: string;
  category_slug: string | null;
  scripture_reference: string;
  translation_code: string | null;
  scripture_text: string | null;
  reflection: RichDoc;
  prayer: RichDoc;
  discussion_question: RichDoc;
  practical_application: RichDoc;
  /** Versions written for an age band; see levels.ts. */
  levels: Levels;
  audience: string | null;
  access_level: "free" | "plus";
  grade_levels: string[];
  educational_category: string | null;
  author_id: string | null;
  author_name: string;
  status: DevotionalStatus;
  publish_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
};

const doc = (value: unknown): RichDoc => sanitizeRichDoc(value) ?? EMPTY_DOC;

/** Maps a database row to a typed record. Rich-text columns are re-validated on the way out. */
export function toDevotional(row: Record<string, unknown>): DevotionalRecord {
  return {
    ...(row as unknown as DevotionalRecord),
    reflection: doc(row.reflection),
    prayer: doc(row.prayer),
    discussion_question: doc(row.discussion_question),
    practical_application: doc(row.practical_application),
    levels: toLevels(row.levels),
    grade_levels: Array.isArray(row.grade_levels) ? (row.grade_levels as string[]) : [],
  };
}

export type ThemeRecord = {
  id: string;
  title: string;
  summary: string;
  week_start: string;
  category_slug: string | null;
  published_at: string | null;
};

export type SearchHit = {
  id: string;
  title: string;
  devotional_date: string;
  daily_topic: string;
  category_slug: string | null;
  scripture_reference: string;
  theme_id: string | null;
  status: DevotionalStatus;
  author_name: string;
  excerpt: string;
  total: number | string;
};
