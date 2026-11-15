import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * Scale probes. PGlite is a single-connection, in-process Postgres, so these numbers show query SHAPE
 * (an index is used, a page is bounded, cost does not grow with unrelated rows), not production throughput.
 * Real load testing against a hosted database is still required before a wide launch (docs/QA-AUDIT.md).
 */
let h: Harness;
let reader: string, author: string, devotional: string, group: string, post: string;

const timed = async <T>(fn: () => Promise<T>) => {
  const t = performance.now();
  const value = await fn();
  return { ms: performance.now() - t, value };
};

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: false });
  reader = await h.createUser("reader@p.test", { first: "Rita", last: "Reader" });
  author = await h.createUser("author@p.test", { first: "Al", last: "Author" });
  const doc = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
  devotional = (await h.admin.query<{ id: string }>(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter, translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name, status, published_at)
     values ('Busy day', current_date, 't', 'patience', 'John 3:16', 'John', 3, 'web', $1::jsonb, $1::jsonb, $1::jsonb, $1::jsonb, 'teachers', '{g35}', 'classroom', 'A', 'published', now()) returning id`, [doc])).rows[0]!.id;
  const seeded = ["community_contributions", "contribution_replies", "group_posts", "group_comments"];
  for (const t of seeded) await h.admin.query(`alter table ${t} disable trigger user`); // rate limits are not what is measured here
  // 6,000 contributions on one devotional, 20,000 spread over 400 other devotionals, 4,000 replies on the busy one.
  await h.admin.query(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter, translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name, status, published_at)
     select 'D'||g, date '2000-01-01' + g, 't', 'patience', 'John 3:16', 'John', 3, 'web', $1::jsonb, $1::jsonb, $1::jsonb, $1::jsonb, 'teachers', '{g35}', 'classroom', 'A', 'published', now() from generate_series(1,400) g`, [doc]);
  await h.admin.query(
    `insert into community_contributions (devotional_id, user_id, kind, body, visibility, created_at)
     select $1, $2, case when g % 5 = 0 then 'prayer' else 'reflection' end::contribution_kind, 'Thought number '||g||' on patience and grace', 'named', now() - (g||' minutes')::interval from generate_series(1,6000) g`, [devotional, author]);
  await h.admin.query(
    `insert into community_contributions (devotional_id, user_id, kind, body, visibility, created_at)
     select d.id, $1, 'reflection', 'Elsewhere '||g, 'named', now() - (g||' minutes')::interval
     from (select id from devotionals where title like 'D%') d, generate_series(1,50) g`, [author]);
  const first = (await h.admin.query<{ id: string }>(`select id from community_contributions where devotional_id = $1 order by created_at desc limit 1`, [devotional])).rows[0]!.id;
  await h.admin.query(`insert into contribution_replies (contribution_id, user_id, body) select $1, $2, 'Reply '||g from generate_series(1,4000) g`, [first, author]);
  group = (await h.admin.query<{ id: string }>(`insert into community_groups (name, description, purpose, guidelines, category, privacy, created_by) values ('Big','a','p','g','other','private',$1) returning id`, [author])).rows[0]!.id;
  await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'owner'), ($1,$3,'member')`, [group, author, reader]);
  await h.admin.query(`insert into group_posts (group_id, author_id, kind, body, created_at) select $1, $2, 'post', 'Post '||g, now() - (g||' minutes')::interval from generate_series(1,3000) g`, [group, author]);
  post = (await h.admin.query<{ id: string }>(`select id from group_posts where group_id = $1 order by created_at desc limit 1`, [group])).rows[0]!.id;
  await h.admin.query(`insert into group_comments (post_id, group_id, author_id, body) select $1, $2, $3, 'Comment '||g from generate_series(1,4000) g`, [post, group, author]);
  for (const t of seeded) await h.admin.query(`alter table ${t} enable trigger user`);
  await h.admin.query(`analyze`);
}, 120_000);
afterAll(async () => { await h.db.close(); });

const as = <T>(fn: () => Promise<T>) => h.as(reader, fn);

describe("large discussion threads and group activity", () => {
  it("a page of a 6,000-item discussion is bounded, ordered and fast; deep pages keep the same cost", async () => {
    const page = await timed(() => as(async () => (await h.db.query<{ id: string; created_at: string }>(`select id, created_at from list_contributions($1,null,null,false,20,null,null)`, [devotional])).rows));
    expect(page.value).toHaveLength(20);
    expect(page.ms).toBeLessThan(1500);
    const last = page.value[19]!;
    const deep = await timed(() => as(async () => (await h.db.query(`select id from list_contributions($1,null,null,false,20,$2,$3)`, [devotional, last.created_at, last.id])).rows));
    expect(deep.value).toHaveLength(20);
    expect(deep.ms).toBeLessThan(1500);
  });

  it("search and the prayer filter stay responsive on a busy discussion", async () => {
    const s = await timed(() => as(async () => (await h.db.query(`select id from list_contributions($1,null,'patience grace',false,20,null,null)`, [devotional])).rows));
    expect(s.value).toHaveLength(20);
    expect(s.ms).toBeLessThan(2500);
    const p = await timed(() => as(async () => (await h.db.query(`select id from list_contributions($1,'prayer',null,false,20,null,null)`, [devotional])).rows));
    expect(p.value.length).toBeGreaterThan(0);
    expect(p.ms).toBeLessThan(1500);
  });

  it("a thread of 4,000 replies and a group of 3,000 posts and 4,000 comments are served in bounded pages", async () => {
    const posts = await timed(() => as(async () => (await h.db.query(`select * from list_group_posts($1)`, [group])).rows));
    expect(posts.value.length).toBeLessThanOrEqual(100);
    expect(posts.ms).toBeLessThan(2000);
    const comments = await timed(() => as(async () => (await h.db.query(`select * from list_group_comments($1)`, [post])).rows));
    expect(comments.value.length).toBeLessThanOrEqual(500);
    expect(comments.ms).toBeLessThan(2000);
  });

  it("the busy-discussion query uses an index, not a scan of every contribution", async () => {
    const plan = (await h.admin.query<{ "QUERY PLAN": string }>(
      `explain select id from community_contributions where devotional_id = $1 order by created_at desc, id desc limit 20`, [devotional])).rows.map((r) => r["QUERY PLAN"]).join("\n");
    expect(plan).toMatch(/Index/i);
    expect(plan).not.toMatch(/Seq Scan on community_contributions/i);
  });
});

describe("index coverage", () => {
  it("every foreign key on a table that grows with use has an index that starts with the key column", async () => {
    const rows = (await h.admin.query<{ tbl: string; col: string; con: string }>(`
      select c.conrelid::regclass::text as tbl, a.attname as col, c.conname as con
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (
          select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`)).rows;
    // Staff-attribution and reference columns on small, admin-only tables may rely on scans.
    const allowed = new Set([
      "platform_roles.granted_by", "bible_translations.license_verified_by", "devotionals.author_id", "devotionals.approved_by",
      "devotionals.category_slug", "devotionals.translation_code", "devotionals.created_by", "devotionals.updated_by",
      "community_settings.updated_by", "community_restrictions.imposed_by", "community_restrictions.lifted_by",
      "community_groups.suspended_by", "group_join_requests.decided_by", "contribution_reports.resolved_by",
      "moderation_appeals.resolved_by", "subscriptions.plan_key", "entitlement_grants.plan_key", "entitlement_grants.created_by",
      "school_seats.assigned_by", "resources.required_feature", "resources.created_by", "school_collections.created_by",
      "school_collection_items.devotional_id", "school_assignments.created_by", "governance_settings.updated_by",
      "launch_attestations.attested_by", "pilot_programs.created_by", "pilot_access_codes.created_by", "weekly_themes.category_slug", "weekly_themes.created_by", "plan_features.feature_key", "devotional_discussion.closed_by", "devotional_discussion.pinned_by", "account_status.set_by", "contributors.created_by",
    ]);
    const missing = rows.filter((r) => !allowed.has(`${r.tbl}.${r.col}`)).map((r) => `${r.tbl}.${r.col}`);
    expect(missing, `foreign keys without a leading index: ${missing.join(", ")}`).toEqual([]);
  });
});
