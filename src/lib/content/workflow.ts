import { isRichDocEmpty, type RichDoc } from "./richtext";
import type { DevotionalStatus } from "./options";

/**
 * The editorial state machine. The database enforces the same table in
 * devotional_transition_allowed(); tests compare the two so they cannot drift.
 */
export const TRANSITIONS: Record<DevotionalStatus, readonly DevotionalStatus[]> = {
  draft: ["in_review"],
  in_review: ["draft", "approved"],
  approved: ["draft", "scheduled", "published"],
  scheduled: ["approved", "published"],
  published: ["approved", "archived"],
  archived: ["draft"],
};

export const canTransition = (from: DevotionalStatus, to: DevotionalStatus): boolean => TRANSITIONS[from].includes(to);

export type WorkflowAction = {
  to: DevotionalStatus;
  label: string;
  help: string;
  /** Needs a publication time. */
  needsTime?: boolean;
  /** A written reason is required (and recorded). */
  needsNote?: boolean;
  tone?: "primary" | "secondary" | "danger";
};

const ACTIONS: Record<DevotionalStatus, WorkflowAction[]> = {
  draft: [{ to: "in_review", label: "Submit for review", help: "Locks nothing, but asks another editor to approve it.", tone: "primary" }],
  in_review: [
    { to: "approved", label: "Approve", help: "Marks the content ready to schedule. The author cannot approve their own work.", tone: "primary" },
    { to: "draft", label: "Request changes", help: "Returns it to draft with a note for the author.", tone: "secondary" },
  ],
  approved: [
    { to: "scheduled", label: "Schedule", help: "Goes live automatically at the time you choose.", needsTime: true, tone: "primary" },
    { to: "published", label: "Publish now", help: "Goes live immediately.", tone: "secondary" },
    { to: "draft", label: "Return to draft", help: "Withdraws the approval.", tone: "secondary" },
  ],
  scheduled: [
    { to: "approved", label: "Unschedule", help: "Cancels the scheduled time. It stays approved.", tone: "secondary" },
    { to: "published", label: "Publish now", help: "Goes live immediately instead of waiting.", tone: "primary" },
  ],
  published: [
    { to: "approved", label: "Unpublish", help: "Takes it down from readers at once and returns it to approved. A reason is required and is kept in the history. Its discussion is kept but hidden while it is down.", needsNote: true, tone: "secondary" },
    { to: "archived", label: "Archive", help: "Withdraws it from readers for good, as outdated. It stays in the editorial record.", tone: "danger" },
  ],
  archived: [{ to: "draft", label: "Restore to draft", help: "Makes it editable again.", tone: "secondary" }],
};

export const actionsFor = (status: DevotionalStatus): WorkflowAction[] => ACTIONS[status];

type Completable = {
  title: string;
  daily_topic: string;
  category_slug: string | null;
  scripture_reference: string;
  translation_code: string | null;
  reflection: RichDoc;
  prayer: RichDoc;
  discussion_question: RichDoc;
  practical_application: RichDoc;
  audience: string | null;
  grade_levels: string[];
  educational_category: string | null;
  author_name: string;
};

/** Required fields still empty. Mirrors devotional_missing_fields() in the database. */
export function missingFields(d: Completable): string[] {
  const missing: string[] = [];
  if (d.title.trim() === "") missing.push("title");
  if (d.daily_topic.trim() === "") missing.push("daily topic");
  if (!d.category_slug) missing.push("category");
  if (d.scripture_reference.trim() === "") missing.push("scripture reference");
  if (!d.translation_code) missing.push("translation");
  if (isRichDocEmpty(d.reflection)) missing.push("reflection");
  if (isRichDocEmpty(d.prayer)) missing.push("prayer");
  if (isRichDocEmpty(d.discussion_question)) missing.push("discussion question");
  if (isRichDocEmpty(d.practical_application)) missing.push("practical application");
  if (!d.audience) missing.push("intended audience");
  if (d.grade_levels.length === 0) missing.push("grade level");
  if (!d.educational_category) missing.push("educational category");
  if (d.author_name.trim() === "") missing.push("author");
  return missing;
}
