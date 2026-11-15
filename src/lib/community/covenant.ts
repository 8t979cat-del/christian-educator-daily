/**
 * The community covenant and the vocabulary the interface uses. Plain data, so the
 * covenant page, the composer reminders and the report dialog never drift apart.
 */
import type { ContributionKind, GroupPostKind, ReportReason } from "./types";

export const COVENANT_INTRO =
  "Content starts the conversation. Scripture grounds it. Community grows through shared reflection and prayer. " +
  "This is a place for adult educators, not a feed. We agree to the following.";

export const COVENANT: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "Speak with respect",
    body: "We assume good faith. We disagree without contempt, and we say what we mean without sarcasm aimed at a person.",
  },
  {
    title: "Humility and charity",
    body: "We hold our convictions with humility and read others as charitably as we want to be read. We ask before we assume.",
  },
  {
    title: "Keep Scripture at the center",
    body: "We respond to the passage and the devotional in front of us. We do not use this space to win arguments or promote ourselves.",
  },
  {
    title: "Pray with compassion",
    body: "A prayer is an offering, not a performance. We never use a prayer to gossip, to correct someone, or to announce a private struggle that is not ours to share.",
  },
  {
    title: "Welcome honest theological questions",
    body: "Sincere questions are welcome, including hard ones. Asking is never a violation.",
  },
  {
    title: "Honor our denominational differences",
    body: "We are from many traditions. Respectful disagreement about doctrine and practice is not misconduct, and it is not grounds for a report. We do not tell others their tradition is not really Christian.",
  },
  {
    title: "Protect students and colleagues",
    body: "We never share names, photos, grades, health, family or disciplinary details of students, or identifying details about colleagues or families. Describe the situation, not the person. If someone could recognize them, leave it out.",
  },
  {
    title: "No harassment, threats or spam",
    body: "No harassment, threats, hateful speech, targeted hostility, solicitation, advertising, recruiting, or fundraising.",
  },
];

export const KIND_LABELS: Record<ContributionKind, { label: string; plural: string; prompt: string; hint: string }> = {
  reflection: {
    label: "Reflection",
    plural: "Reflections",
    prompt: "What stood out to you?",
    hint: "Share what this passage stirred in you.",
  },
  prayer: {
    label: "Prayer",
    plural: "Prayers",
    prompt: "Write your prayer",
    hint: "A prayer for yourself, your work, or others, without private details.",
  },
  question: {
    label: "Question",
    plural: "Questions",
    prompt: "What are you wondering?",
    hint: "A sincere question about the passage or its meaning for the classroom.",
  },
  encouragement: {
    label: "Encouragement",
    plural: "Encouragement",
    prompt: "What would you say to a fellow teacher?",
    hint: "A word of encouragement for someone who is tired or discouraged.",
  },
};

export const CONTRIBUTION_KINDS = Object.keys(KIND_LABELS) as ContributionKind[];

export const GROUP_POST_LABELS: Record<GroupPostKind, string> = {
  post: "Post",
  prayer: "Prayer request",
  question: "Question",
};

export const GROUP_CATEGORIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "school", label: "School faculty or staff" },
  { value: "grade_level", label: "Grade-level fellowship" },
  { value: "subject", label: "Subject or discipline" },
  { value: "new_teacher", label: "New-teacher support" },
  { value: "study", label: "Bible study" },
  { value: "regional", label: "Regional fellowship" },
  { value: "other", label: "Other" },
];

export const PRAYER_REMINDER =
  "Prayers shared with the community can be read by other educators. Please do not include names or details that could identify a student, a family, or a colleague, or private health, family, or discipline matters.";

export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; label: string; help: string }> = [
  { value: "harassment", label: "Harassment or targeted hostility", help: "Directed at a person, not a disagreement about ideas." },
  { value: "threat_or_hate", label: "Threats or hateful speech", help: "" },
  { value: "student_privacy", label: "Student privacy", help: "Identifies or describes a student." },
  { value: "personal_information", label: "Private information about someone", help: "Contact details, family, health or similar." },
  { value: "spam_or_solicitation", label: "Spam or solicitation", help: "Advertising, recruiting, fundraising." },
  { value: "inappropriate", label: "Inappropriate for this community", help: "" },
  { value: "other", label: "Something else", help: "" },
];

export const REPORT_REASON_LABEL = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<ReportReason, string>;

export const DISAGREEMENT_NOTE =
  "Disagreeing with someone's theology is not a reason to report. Please report conduct, not convictions.";
