import "server-only";
import { createClient } from "@/lib/supabase/server";
import { richTextToPlain } from "./richtext";
import { toDevotional, type DevotionalRecord, type SearchHit, type ThemeRecord } from "./types";
import type { TranslationLicense } from "./scripture";
import type { DevotionalStatus } from "./options";

/** All reads run as the signed-in user, so row-level security decides what comes back. */

export async function getDevotional(id: string): Promise<DevotionalRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("devotionals").select("*").eq("id", id).maybeSingle();
  return data ? toDevotional(data) : null;
}

/** The live devotional for a calendar date, if there is one. */
/** Published, or scheduled and past its time. Matches what row-level security shows readers; keeps editors' own views honest too. */
const liveFilter = () => `status.eq.published,and(status.eq.scheduled,publish_at.lte.${new Date().toISOString()})`;

export async function getLiveDevotionalFor(date: string): Promise<DevotionalRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("devotionals")
    .select("*")
    .eq("devotional_date", date)
    .or(liveFilter())
    // The free daily devotional is the one for the day; Plus devotionals are extra.
    .order("access_level", { ascending: true })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const row = data?.[0];
  return row ? toDevotional(row) : null;
}

/** The most recent live devotional on or before a date, for when nothing is published for today. */
export async function getLatestLiveOnOrBefore(date: string): Promise<DevotionalRecord | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("devotionals").select("*").lte("devotional_date", date).or(liveFilter())
    .order("devotional_date", { ascending: false }).limit(1);
  return data?.[0] ? toDevotional(data[0]) : null;
}

export type Neighbor = { id: string; title: string; devotional_date: string };

/** The live devotionals just before and just after a date. Never reaches past `today`. */
export async function getNeighbors(date: string, today: string): Promise<{ prev: Neighbor | null; next: Neighbor | null }> {
  const supabase = await createClient();
  const [prev, next] = await Promise.all([
    supabase.from("devotionals").select("id, title, devotional_date").lt("devotional_date", date).or(liveFilter())
      .order("devotional_date", { ascending: false }).limit(1),
    supabase.from("devotionals").select("id, title, devotional_date").gt("devotional_date", date).lte("devotional_date", today).or(liveFilter())
      .order("devotional_date", { ascending: true }).limit(1),
  ]);
  return { prev: (prev.data?.[0] as Neighbor | undefined) ?? null, next: (next.data?.[0] as Neighbor | undefined) ?? null };
}

export type Translation = TranslationLicense & { license_notes: string | null; license_verified_at: string | null; sort_order: number };

export async function listTranslations(): Promise<Translation[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("bible_translations").select("*").order("sort_order").order("name");
  return (data ?? []) as Translation[];
}

export async function getTranslation(code: string | null): Promise<Translation | null> {
  if (!code) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("bible_translations").select("*").eq("code", code).maybeSingle();
  return (data as Translation | null) ?? null;
}

export async function listThemes(options: { publishedOnly?: boolean } = {}): Promise<ThemeRecord[]> {
  const supabase = await createClient();
  let query = supabase.from("weekly_themes").select("*").order("week_start", { ascending: false });
  if (options.publishedOnly) query = query.not("published_at", "is", null);
  const { data } = await query;
  return (data ?? []) as ThemeRecord[];
}

export async function getTheme(id: string): Promise<{ theme: ThemeRecord; devotionals: DevotionalRecord[] } | null> {
  const supabase = await createClient();
  const { data: theme } = await supabase.from("weekly_themes").select("*").eq("id", id).maybeSingle();
  if (!theme) return null;
  const { data } = await supabase.from("devotionals").select("*").eq("theme_id", id).order("devotional_date");
  return { theme: theme as ThemeRecord, devotionals: (data ?? []).map(toDevotional) };
}

export type SearchParams = {
  query?: string;
  category?: string;
  grade?: string;
  theme?: string;
  from?: string;
  through?: string;
  status?: DevotionalStatus;
  /** Exact book and chapter, from a Scripture reference search. */
  book?: string;
  chapter?: number;
  /** Readers' archive: published only. Editors' list: pass false to include drafts. */
  onlyLive: boolean;
  page?: number;
  pageSize?: number;
};

export async function searchDevotionals(params: SearchParams): Promise<{ hits: SearchHit[]; total: number }> {
  const supabase = await createClient();
  const pageSize = params.pageSize ?? 20;
  const page = Math.max(params.page ?? 1, 1);
  const { data, error } = await supabase.rpc("search_devotionals", {
    p_query: params.query || null,
    p_category: params.category || null,
    p_grade: params.grade || null,
    p_theme: params.theme || null,
    p_from: params.from || null,
    p_through: params.through || null,
    p_status: params.status ?? null,
    p_only_live: params.onlyLive,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
    p_book: params.book ?? null,
    p_chapter: params.chapter ?? null,
  });
  if (error) return { hits: [], total: 0 };
  const hits = (data ?? []) as SearchHit[];
  return { hits, total: Number(hits[0]?.total ?? 0) };
}

export type HistoryItem =
  | { kind: "event"; at: string; actor: string | null; text: string; note: string | null }
  | { kind: "revision"; at: string; actor: string | null; text: string; note: null };

/** Workflow events and saved earlier versions, newest first. Editors only (row-level security). */
export async function getHistory(id: string): Promise<HistoryItem[]> {
  const supabase = await createClient();
  const [events, revisions] = await Promise.all([
    supabase.from("devotional_events").select("created_at, actor_id, from_status, to_status, note").eq("devotional_id", id),
    supabase.from("devotional_revisions").select("created_at, editor_id").eq("devotional_id", id),
  ]);
  const items: HistoryItem[] = [
    ...(events.data ?? []).map((e): HistoryItem => ({
      kind: "event", at: e.created_at, actor: e.actor_id,
      text: e.from_status ? `${e.from_status.replace("_", " ")} → ${e.to_status.replace("_", " ")}` : String(e.to_status),
      note: e.note,
    })),
    ...(revisions.data ?? []).map((r): HistoryItem => ({
      kind: "revision", at: r.created_at, actor: r.editor_id, text: "Edited (previous version kept)", note: null,
    })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Display names for user ids, via the staff-readable profile function. */
export async function getEditorNames(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const supabase = await createClient();
  const { data } = await supabase.rpc("staff_display_names", { ids: unique });
  for (const row of (data ?? []) as Array<{ id: string; display_name: string }>) names.set(row.id, row.display_name);
  return names;
}

/** Theme details for a devotional, with its position in the week (Monday = day 1). */
export async function getThemeInfo(d: { theme_id: string | null; devotional_date: string }): Promise<{ id: string; title: string; summary: string; day: number | null } | null> {
  if (!d.theme_id) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("weekly_themes").select("id, title, summary, week_start").eq("id", d.theme_id).maybeSingle();
  if (!data) return null;
  const diff = Math.round((Date.parse(`${d.devotional_date}T00:00:00Z`) - Date.parse(`${data.week_start as string}T00:00:00Z`)) / 86_400_000);
  return { id: data.id as string, title: data.title as string, summary: (data.summary as string) ?? "", day: diff >= 0 && diff <= 4 ? diff + 1 : null };
}

/** Live devotionals of a theme, for the week strip and theme pages. */
export async function getLiveThemeDevotionals(themeId: string): Promise<Array<{ id: string; title: string; devotional_date: string; daily_topic: string; scripture_reference: string }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("devotionals").select("id, title, devotional_date, daily_topic, scripture_reference")
    .eq("theme_id", themeId).or(liveFilter()).order("devotional_date");
  return (data ?? []) as Array<{ id: string; title: string; devotional_date: string; daily_topic: string; scripture_reference: string }>;
}

export async function getThemeTitle(id: string | null): Promise<string | null> {
  if (!id) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("weekly_themes").select("title").eq("id", id).maybeSingle();
  return (data?.title as string | undefined) ?? null;
}

/** Statuses of every devotional that belongs to a theme, for the themes list. */
export async function listThemeStatuses(): Promise<Array<{ theme_id: string; status: DevotionalStatus }>> {
  const supabase = await createClient();
  const { data } = await supabase.from("devotionals").select("theme_id, status").not("theme_id", "is", null);
  return (data ?? []) as Array<{ theme_id: string; status: DevotionalStatus }>;
}

// ---------------------------------------------------------------------------
// A teacher's own state: bookmarks, completion, notes. Row-level security scopes
// every one of these queries to the signed-in user.
// ---------------------------------------------------------------------------
export type UserState = { devotional_id: string; bookmarked: boolean; completed_at: string | null; note: string };

export async function getUserState(devotionalId: string): Promise<UserState | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("devotional_user_state").select("*").eq("devotional_id", devotionalId).maybeSingle();
  return (data as UserState | null) ?? null;
}

export async function getUserStates(ids: string[]): Promise<Map<string, UserState>> {
  const map = new Map<string, UserState>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data } = await supabase.from("devotional_user_state").select("*").in("devotional_id", ids);
  for (const row of (data ?? []) as UserState[]) map.set(row.devotional_id, row);
  return map;
}

export async function getBookmarkedHits(page: number, pageSize: number): Promise<{ hits: SearchHit[]; total: number }> {
  const supabase = await createClient();
  const from = (Math.max(page, 1) - 1) * pageSize;
  const { data, count } = await supabase
    .from("devotional_user_state")
    .select("updated_at, devotionals!inner(id, title, devotional_date, daily_topic, category_slug, scripture_reference, theme_id, status, author_name, reflection)", { count: "exact" })
    .eq("bookmarked", true)
    .order("updated_at", { ascending: false })
    .range(from, from + pageSize - 1);
  const hits = ((data ?? []) as unknown as Array<{ devotionals: Record<string, unknown> | Record<string, unknown>[] }>).flatMap((row) => {
    const d = Array.isArray(row.devotionals) ? row.devotionals[0] : row.devotionals;
    if (!d) return [];
    const reflection = toDevotional({ ...d, prayer: null, discussion_question: null, practical_application: null }).reflection;
    return [{ ...(d as object), excerpt: richTextToPlain(reflection).slice(0, 220), total: count ?? 0 } as unknown as SearchHit];
  });
  return { hits, total: count ?? 0 };
}
