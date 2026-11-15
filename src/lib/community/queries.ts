import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type {
  Appeal,
  Contribution,
  ContributionKind,
  GroupComment,
  GroupDetail,
  GroupDirectoryEntry,
  GroupPost,
  GroupReport,
  GroupSummary,
  JoinRequest,
  ModerationNotice,
  PlatformReport,
  Reply,
  Restriction,
  RosterEntry,
} from "./types";

/**
 * Reads go through database functions that decide what the signed-in person may see
 * and shape each row (authors of anonymous prayers are never included). The caller's
 * identity comes from the session; nothing here trusts a user id from the request.
 */

export const PAGE_SIZE = 12;

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return [];
  return (data ?? []) as T[];
}

export type Cursor = { ts: string; id: string } | null;

export async function listContributions(opts: {
  devotionalId: string;
  kind?: ContributionKind | null;
  q?: string | null;
  oldestFirst?: boolean;
  cursor?: Cursor;
}): Promise<{ items: Contribution[]; next: Cursor }> {
  const rows = await rpc<Contribution>("list_contributions", {
    p_devotional: opts.devotionalId,
    p_kind: opts.kind ?? null,
    p_q: opts.q ?? null,
    p_oldest_first: opts.oldestFirst ?? false,
    p_limit: PAGE_SIZE + 1,
    p_after_ts: opts.cursor?.ts ?? null,
    p_after_id: opts.cursor?.id ?? null,
  });
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  return { items, next: rows.length > PAGE_SIZE && last ? { ts: last.created_at, id: last.id } : null };
}

export async function contributionCounts(devotionalId: string): Promise<Record<ContributionKind | "all", number>> {
  const rows = await rpc<{ kind: ContributionKind; n: number }>("contribution_counts", { p_devotional: devotionalId });
  const counts = { all: 0, reflection: 0, prayer: 0, question: 0, encouragement: 0 };
  for (const r of rows) {
    counts[r.kind] = r.n;
    counts.all += r.n;
  }
  return counts;
}

export const listReplies = (contributionId: string, cursor?: Cursor) =>
  rpc<Reply>("list_replies", {
    p_contribution: contributionId,
    p_limit: 50,
    p_after_ts: cursor?.ts ?? null,
    p_after_id: cursor?.id ?? null,
  });

export const myGroups = cache(() => rpc<GroupSummary>("my_groups"));

export const groupDirectory = (q?: string | null, offset = 0) =>
  rpc<GroupDirectoryEntry>("group_directory", { p_q: q ?? null, p_limit: 20, p_offset: offset });

export async function getGroup(groupId: string): Promise<GroupDetail | null> {
  const rows = await rpc<GroupDetail>("get_group", { p_group: groupId });
  return rows[0] ?? null;
}

export const groupRoster = (groupId: string) => rpc<RosterEntry>("group_roster", { p_group: groupId });

export async function listGroupPosts(opts: {
  groupId: string;
  kind?: string | null;
  q?: string | null;
  cursor?: Cursor;
}): Promise<{ items: GroupPost[]; next: Cursor }> {
  const rows = await rpc<GroupPost>("list_group_posts", {
    p_group: opts.groupId,
    p_kind: opts.kind ?? null,
    p_q: opts.q ?? null,
    p_limit: PAGE_SIZE + 1,
    p_after_ts: opts.cursor?.ts ?? null,
    p_after_id: opts.cursor?.id ?? null,
  });
  const items = rows.slice(0, PAGE_SIZE);
  const last = items[items.length - 1];
  return { items, next: rows.length > PAGE_SIZE && last ? { ts: last.created_at, id: last.id } : null };
}

export const listGroupComments = (postId: string) => rpc<GroupComment>("list_group_comments", { p_post: postId });
export const listJoinRequests = (groupId: string) => rpc<JoinRequest>("list_join_requests", { p_group: groupId });
export const listGroupReports = (groupId: string, status = "open") =>
  rpc<GroupReport>("list_group_reports", { p_group: groupId, p_status: status });

export const listPlatformReports = (status = "open") => rpc<PlatformReport>("list_platform_reports", { p_status: status });
export const listAppeals = (status = "open") => rpc<Appeal>("list_appeals", { p_status: status });
export const listRestrictions = () => rpc<Restriction>("list_restrictions");
export const myModerationNotices = () => rpc<ModerationNotice>("my_moderation_notices");
export const myBlocks = () => rpc<{ blocked_id: string; label: string; created_at: string }>("my_blocks");

export async function communitySettings(): Promise<Record<string, unknown>> {
  const supabase = await createClient();
  const { data } = await supabase.from("community_settings").select("key, value");
  return Object.fromEntries((data ?? []).map((r: { key: string; value: unknown }) => [r.key, r.value]));
}

/** Pending items for the moderation badge. Zero for anyone who is not allowed to see the queues. */
export async function groupName(groupId: string): Promise<string | null> {
  return (await getGroup(groupId))?.name ?? null;
}

/** The person's own current restriction, if any. Restrictions are visible to the person they apply to. */
export const myRestriction = cache(async (): Promise<{ kind: "suspension" | "ban"; ends_at: string | null; reason: string } | null> => {
  const supabase = await createClient();
  const { data } = await supabase.from("community_restrictions").select("kind, ends_at, reason").is("lifted_at", null);
  const now = Date.now();
  const active = (data ?? []).filter((r: { ends_at: string | null }) => !r.ends_at || new Date(r.ends_at).getTime() > now);
  return (active[0] as { kind: "suspension" | "ban"; ends_at: string | null; reason: string } | undefined) ?? null;
});
