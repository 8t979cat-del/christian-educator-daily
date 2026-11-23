import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the administration screens. Every function here calls a database function that
 * checks the caller's role itself and returns nothing (or a plain refusal) otherwise, so a
 * screen that is reached by mistake shows an empty state, never someone else's data.
 */

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return [];
  return (data ?? []) as T[];
}

export type CovenantStatus = { version: number; required: boolean; accepted: boolean; accepted_at: string | null };
export const covenantStatus = cache(async (): Promise<CovenantStatus> => {
  const [row] = await rpc<CovenantStatus>("covenant_status");
  // If the status cannot be read, treat the covenant as required and not yet accepted.
  return row ?? { version: 1, required: true, accepted: false, accepted_at: null };
});

export type DiscussionState = { enabled: boolean; closed: boolean; pinned_question: string | null };
export async function discussionState(devotionalId: string): Promise<DiscussionState> {
  const [row] = await rpc<DiscussionState>("discussion_state", { p_devotional: devotionalId });
  return row ?? { enabled: true, closed: false, pinned_question: null };
}

export type ThreadControl = { contribution_id: string; replies_locked: boolean; acks_locked: boolean };
export const threadControls = (devotionalId: string) => rpc<ThreadControl>("thread_controls", { p_devotional: devotionalId });

export type AccountStatus = { status: "suspended" | "terminated"; reason: string; until: string | null };
export const myAccountStatus = cache(async (): Promise<AccountStatus | null> => (await rpc<AccountStatus>("my_account_status"))[0] ?? null);

export type HistoryRow = { id: string; at: string; action: string; actor_name: string | null; target_name: string | null; reason: string | null; group_name: string | null };
export const moderationHistory = (limit = 50, offset = 0) => rpc<HistoryRow>("list_moderation_history", { p_limit: limit, p_offset: offset });

export type GroupOverviewRow = {
  id: string; name: string; status: "pending" | "active" | "suspended" | "rejected"; privacy: "private" | "discoverable";
  category: string | null; school_name: string | null; owner_name: string | null; member_count: number;
  open_reports: number; created_at: string; note: string | null;
};
export const adminGroupOverview = (status: string | null = null, q: string | null = null) =>
  rpc<GroupOverviewRow>("admin_group_overview", { p_status: status, p_q: q });

export type GroupMember = { user_id: string; name: string | null; role: "owner" | "moderator" | "member"; status: string };
export const adminGroupMembers = (groupId: string) => rpc<GroupMember>("admin_group_members", { p_group: groupId });

export type Escalation = {
  id: string; reason: string; urgent: boolean; snapshot: string; created_at: string; escalated_at: string;
  note: string | null; author_name: string | null; report_status: string; closed_at: string | null; closed_note: string | null;
};
export const adminEscalations = (includeClosed = false) => rpc<Escalation>("list_admin_escalations", { p_include_closed: includeClosed });

export type AuditRow = {
  id: string; at: string; actor_name: string | null; actor_roles: string[]; action: string; entity: string; entity_id: string | null;
  detail: Record<string, unknown>;
};
export const adminAudit = (limit = 50, offset = 0, entity: string | null = null) =>
  rpc<AuditRow>("admin_audit_list", { p_limit: limit, p_offset: offset, p_entity: entity });

export type SchoolAuditRow = { at: string; actor_name: string | null; action: string; detail: Record<string, unknown> };
export const schoolAudit = (schoolId: string) => rpc<SchoolAuditRow>("school_audit_list", { p_school: schoolId, p_limit: 50 });

export type SchoolGroupRow = { id: string; name: string; status: string; privacy: string; owner_name: string | null; member_count: number; created_at: string };
export const schoolGroupOverview = (schoolId: string) => rpc<SchoolGroupRow>("school_group_overview", { p_school: schoolId });

export const governanceSettings = async (): Promise<Record<string, unknown>> => {
  const rows = await rpc<{ key: string; value: unknown }>("get_governance_settings");
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
};

export type Contributor = { id: string; name: string; bio: string; active: boolean; photo: string | null };
export async function listContributors(): Promise<Contributor[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("contributors").select("id, name, bio, active, photo").order("name");
  return (data ?? []) as Contributor[];
}

export type Credit = { contributor_id: string; name: string; bio: string; role: "author" | "contributor" | "reviewer"; photo: string | null };
export const devotionalCredits = (devotionalId: string) => rpc<Credit>("devotional_credits", { p_devotional: devotionalId });

export type Metrics = {
  days: number;
  active_educators: { day: number; week: number; month: number };
  readership: Array<{ day: string; n: number }>;
  presentations: Array<{ day: string; n: number }>;
  contributions: { by_kind: Record<string, number>; replies: number };
  groups: { active: number; pending: number; with_activity: number; posts: number; comments: number };
  prayer_acknowledgements: number;
  schools: { by_status: Record<string, number>; licensed_seats: number };
  subscriptions: {
    active_by_plan: Record<string, number>; started: number; trials_ended: number; trials_converted: number;
    retention_cohort: number; retention_kept: number;
  };
  moderation: {
    reports_by_reason: Record<string, number>; reports_by_status: Record<string, number>; urgent: number; open_now: number;
    median_hours_to_resolve: number | null; appeals_open: number; restrictions_active: number;
  };
};
export async function platformMetrics(days: number): Promise<Metrics | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("platform_metrics", { p_days: days });
  return error ? null : (data as Metrics);
}

export async function groupLockedPosts(groupId: string): Promise<Set<string>> {
  const rows = await rpc<{ post_id: string }>("group_locked_posts", { p_group: groupId });
  return new Set(rows.map((r) => r.post_id));
}

/** Aggregate counters only (no person is recorded). A failure here must never affect the page. */
export async function recordUsage(metric: "devotional_view" | "presentation_open"): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("record_usage", { p_metric: metric });
  } catch {
    /* analytics are best effort */
  }
}

/** Notes that this person was active today, once a day. Stores a date, not a history. */
export async function touchActive(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("touch_active");
  } catch {
    /* best effort */
  }
}
