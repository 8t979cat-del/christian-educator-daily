/** Shapes returned by the community read functions in the database. */

export type ContributionKind = "reflection" | "prayer" | "question" | "encouragement";
export type ContributionVisibility = "named" | "anonymous" | "private";
export type ModerationState = "visible" | "hidden";
export type GroupPrivacy = "private" | "discoverable";
export type GroupRole = "owner" | "moderator" | "member";
export type GroupPostKind = "post" | "prayer" | "question";
export type ReportTarget = "contribution" | "reply" | "group_post" | "group_comment" | "direct_message";
export type ReportReason =
  | "harassment"
  | "threat_or_hate"
  | "spam_or_solicitation"
  | "student_privacy"
  | "personal_information"
  | "inappropriate"
  | "other";

export type Contribution = {
  id: string;
  kind: ContributionKind;
  title: string | null;
  body: string;
  visibility: ContributionVisibility;
  moderation: ModerationState;
  moderation_reason: string | null;
  created_at: string;
  edited_at: string | null;
  /** Null for anonymous prayers (unless they are the viewer's own). */
  author_name: string | null;
  is_mine: boolean;
  prayer_count: number;
  i_prayed: boolean;
  reply_count: number;
};

export type Reply = {
  id: string;
  body: string;
  moderation: ModerationState;
  moderation_reason: string | null;
  created_at: string;
  edited_at: string | null;
  author_name: string | null;
  is_mine: boolean;
};

export type GroupSummary = {
  id: string;
  name: string;
  description: string;
  category: string | null;
  privacy: GroupPrivacy;
  group_status: "active" | "suspended";
  my_role: GroupRole;
  my_status: "active" | "suspended";
};

export type GroupDirectoryEntry = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  category: string | null;
  is_school_group: boolean;
  relationship: "member" | "requested" | "none";
};

export type GroupDetail = {
  id: string;
  name: string;
  description: string;
  purpose: string;
  guidelines: string;
  category: string | null;
  privacy: GroupPrivacy;
  group_status: "pending" | "active" | "suspended" | "rejected";
  suspended_reason: string | null;
  is_school_group: boolean;
  my_role: GroupRole | null;
  my_status: "active" | "suspended" | null;
  join_status: "member" | "requested" | "none";
};

export type RosterEntry = {
  user_id: string;
  display_name: string;
  role: GroupRole;
  status: "active" | "suspended";
  joined_at: string;
  is_me: boolean;
};

export type GroupPost = {
  id: string;
  kind: GroupPostKind;
  title: string | null;
  body: string;
  devotional_id: string | null;
  devotional_title: string | null;
  scripture_reference: string | null;
  moderation: ModerationState;
  moderation_reason: string | null;
  created_at: string;
  edited_at: string | null;
  author_name: string;
  is_mine: boolean;
  comment_count: number;
  prayer_count: number;
  i_prayed: boolean;
};

export type GroupComment = {
  id: string;
  parent_id: string | null;
  body: string;
  moderation: ModerationState;
  moderation_reason: string | null;
  created_at: string;
  edited_at: string | null;
  author_name: string;
  is_mine: boolean;
};

export type JoinRequest = { id: string; requester_name: string; message: string; created_at: string };

export type PlatformReport = {
  id: string;
  target_type: ReportTarget;
  target_id: string;
  group_name: string | null;
  reason: ReportReason;
  details: string | null;
  snapshot: string;
  snapshot_title: string | null;
  status: "open" | "actioned" | "dismissed";
  created_at: string;
  escalated: boolean;
  author_name: string | null;
  reporter_name: string | null;
  author_violations: number;
  content_hidden: boolean;
  resolution_note: string | null;
  group_id: string | null;
  author_id: string | null;
  urgent: boolean;
  is_prayer: boolean;
  admin_escalated: boolean;
};

export type GroupReport = Omit<PlatformReport, "group_name" | "reporter_name" | "author_violations" | "content_hidden" | "group_id" | "author_id">;

export type ModerationNotice = {
  id: string;
  action: string;
  scope: "platform" | "group";
  group_name: string | null;
  reason: string;
  snapshot: string | null;
  created_at: string;
  can_appeal: boolean;
  appeal_status: "open" | "upheld" | "overturned" | null;
  appeal_note: string | null;
};

export type Appeal = {
  id: string;
  action: string;
  scope: string;
  group_name: string | null;
  user_name: string | null;
  message: string;
  action_reason: string;
  snapshot: string | null;
  action_at: string;
  status: "open" | "upheld" | "overturned";
  created_at: string;
  resolution_note: string | null;
};

export type Restriction = {
  id: string;
  user_name: string | null;
  kind: "suspension" | "ban";
  reason: string;
  ends_at: string | null;
  created_at: string;
};
