import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * The community: public discussion on published devotionals, private groups,
 * prayer acknowledgements, reporting, moderation, appeals and the messaging flag.
 * Everything runs against the real migrations, as the signed-in role, so these
 * tests exercise the same row-level security the application relies on.
 */

let h: Harness;
let editor: string, editor2: string, admin: string, mod: string, mod2: string;
let ann: string, ben: string, cleo: string, dan: string, unverified: string;
let live: string, draft: string;

const DENIED = /row-level security|permission denied/i;
const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0]!;

async function mk(date: string) {
  const rows = await q<{ id: string }>(
    editor,
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category)
     values ('T '||$1::date::text, $1::date, 'topic', 'patience', 'John 3:16', 'John', 3, 'web', $2::jsonb, $2::jsonb, $2::jsonb, $2::jsonb, 'teachers', '{g35}', 'classroom')
     returning id`,
    [date, doc("Some text")],
  );
  return rows[0]!.id;
}

let seq = 0;
const uniq = (s: string) => `${s} ${++seq}`;

async function post(user: string, kind: string, body = uniq("A thought"), extra: { title?: string; visibility?: string; devotional?: string } = {}) {
  const r = await one<{ id: string }>(
    user,
    `insert into community_contributions (devotional_id, user_id, kind, title, body, visibility)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [extra.devotional ?? live, user, kind, extra.title ?? null, body, extra.visibility ?? "named"],
  );
  return r.id;
}
const list = (user: string, args: { kind?: string; q?: string; oldest?: boolean; limit?: number; ts?: string; id?: string } = {}) =>
  q<{ id: string; kind: string; body: string; author_name: string | null; is_mine: boolean; prayer_count: number; i_prayed: boolean; reply_count: number; moderation: string; moderation_reason: string | null; created_at: string }>(
    user,
    `select * from list_contributions($1, $2::contribution_kind, $3, $4, $5, $6::timestamptz, $7::uuid)`,
    [live, args.kind ?? null, args.q ?? null, args.oldest ?? false, args.limit ?? 20, args.ts ?? null, args.id ?? null],
  );

/** Creates a group directly, so fixtures are not subject to the per-person creation limits under test elsewhere. */
async function newGroup(owner: string, privacy: "private" | "discoverable" = "private", name = uniq("Group")) {
  const g = await h.admin.query<{ id: string }>(
    `insert into community_groups (name, description, purpose, guidelines, category, privacy, created_by) values ($1,'about','purpose','be kind','other',$2,$3) returning id`,
    [name, privacy, owner],
  );
  await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'owner')`, [g.rows[0]!.id, owner]);
  return g.rows[0]!.id;
}
let people = 0;
const fresh = (first = "Pat") => h.createUser(`p${++people}@c.test`, { first, last: "Person" });
async function join(gid: string, owner: string, user: string, role: "member" | "moderator" = "member") {
  await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,$3)`, [gid, user, role]);
  void owner;
}
async function gpost(user: string, gid: string, body = uniq("Group post"), kind = "post") {
  return (await one<{ id: string }>(user, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,$3,$4) returning id`, [gid, user, kind, body])).id;
}
const glist = (user: string, gid: string) => q<{ id: string; body: string; author_name: string }>(user, `select * from list_group_posts($1)`, [gid]);

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: true });
  editor = await h.createUser("ed@c.test", { first: "Ed", last: "Itor" });
  editor2 = await h.createUser("ed2@c.test");
  admin = await h.createUser("root@c.test", { first: "Rita", last: "Root" });
  mod = await h.createUser("mod@c.test", { first: "Mo", last: "Derator" });
  mod2 = await h.createUser("mod2@c.test", { first: "Mona", last: "Second" });
  ann = await h.createUser("ann@c.test", { first: "Ann", last: "Alder" });
  ben = await h.createUser("ben@c.test", { first: "Ben", last: "Birch" });
  cleo = await h.createUser("cleo@c.test", { first: "Cleo", last: "Cedar" });
  dan = await h.createUser("dan@c.test", { first: "Dan", last: "Dogwood" });
  unverified = await h.createUser("new@c.test", { verified: false });
  await h.admin.query(
    `insert into platform_roles (user_id, role) values ($1,'content_editor'), ($2,'content_editor'), ($3,'platform_admin'), ($4,'moderator'), ($5,'moderator')`,
    [editor, editor2, admin, mod, mod2],
  );
  live = await mk("2019-04-01");
  await q(editor, `select transition_devotional($1, 'in_review')`, [live]);
  await q(editor2, `select transition_devotional($1, 'approved')`, [live]);
  await q(editor2, `select transition_devotional($1, 'published')`, [live]);
  draft = await mk("2019-04-02");
});

afterAll(async () => {
  await h.db.close();
});

// ---------------------------------------------------------------------------
describe("public discussion belongs to published devotionals", () => {
  it("a verified reader can post each kind, and sees names as First L.", async () => {
    for (const kind of ["reflection", "question", "encouragement"]) await post(ann, kind);
    const rows = await list(ben);
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r) => r.author_name === "Ann A.")).toBe(true);
    expect(rows.some((r) => r.is_mine)).toBe(false);
  });

  it("cannot post to a devotional that is not live", async () => {
    await expect(post(ann, "reflection", uniq("x"), { devotional: draft })).rejects.toThrow(DENIED);
  });

  it("cannot post to a devotional that does not exist, or without one: there is no standalone post", async () => {
    await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values (gen_random_uuid(), $1, 'reflection', 'x')`, [ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `insert into community_contributions (user_id, kind, body) values ($1, 'reflection', 'x')`, [ann])).rejects.toThrow(/null value|not-null|row-level security/i);
  });

  it("cannot post in someone else's name", async () => {
    await expect(q(ben, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','forged')`, [live, ann])).rejects.toThrow(DENIED);
  });

  it("a scheduled devotional whose time has come is live; a future one is not", async () => {
    const future = await mk("2019-04-09");
    await q(editor, `select transition_devotional($1, 'in_review')`, [future]);
    await q(editor2, `select transition_devotional($1, 'approved')`, [future]);
    await h.admin.query(`update devotionals set status = 'scheduled', publish_at = now() + interval '1 day' where id = $1`, [future]);
    await expect(post(ann, "reflection", uniq("early"), { devotional: future })).rejects.toThrow(DENIED);
    await h.admin.query(`update devotionals set publish_at = now() - interval '1 minute' where id = $1`, [future]);
    await post(ann, "reflection", uniq("on time"), { devotional: future });
  });

  it("visitors and unverified accounts can neither read nor write", async () => {
    await expect(h.asAnon(() => h.db.query(`select * from list_contributions($1)`, [live]))).rejects.toThrow(/permission denied/i);
    expect(await q(unverified, `select * from list_contributions($1)`, [live])).toHaveLength(0);
    await expect(post(unverified, "reflection")).rejects.toThrow(DENIED);
  });

  it("the author can edit and delete their own, nobody else can", async () => {
    const id = await post(cleo, "reflection", uniq("original"));
    await q(cleo, `update community_contributions set body = 'changed' where id = $1`, [id]);
    const [mine] = (await list(cleo)).filter((r) => r.id === id);
    expect(mine!.body).toBe("changed");
    const hijack = await h.as(ben, () => h.db.query(`update community_contributions set body = 'hijacked' where id = $1`, [id]));
    expect(hijack.affectedRows).toBe(0);
    const foreignDelete = await h.as(ben, () => h.db.query(`delete from community_contributions where id = $1`, [id]));
    expect(foreignDelete.affectedRows).toBe(0);
    const del = await h.as(cleo, () => h.db.query(`delete from community_contributions where id = $1`, [id]));
    expect(del.affectedRows).toBe(1);
  });

  it("cannot change the author, kind, devotional or moderation fields", async () => {
    const id = await post(dan, "reflection");
    for (const set of ["user_id = '" + ann + "'", "kind = 'question'", "moderation = 'hidden'", "devotional_id = '" + draft + "'"]) {
      await expect(q(dan, `update community_contributions set ${set} where id = $1`, [id])).rejects.toThrow(DENIED);
    }
  });

  it("is listed chronologically, newest first by default, never by popularity", async () => {
    const rows = await list(ann);
    const times = rows.map((r) => new Date(r.created_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
    const oldest = await list(ann, { oldest: true });
    const t2 = oldest.map((r) => new Date(r.created_at).getTime());
    expect(t2).toEqual([...t2].sort((a, b) => a - b));
  });

  it("pages with a stable cursor, with no gaps or repeats", async () => {
    const all = await list(ann, { limit: 50 });
    const seen: string[] = [];
    let cursor: { ts?: string; id?: string } = {};
    for (let i = 0; i < 50; i++) {
      const page = await list(ann, { limit: 2, ...cursor });
      if (!page.length) break;
      seen.push(...page.map((r) => r.id));
      const last = page[page.length - 1]!;
      cursor = { ts: last.created_at, id: last.id };
    }
    expect(seen).toEqual(all.map((r) => r.id));
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("filters by kind and searches the text", async () => {
    await post(ben, "question", "Why did the disciples doubt zebras?");
    expect((await list(ann, { kind: "question" })).every((r) => r.kind === "question")).toBe(true);
    const found = await list(ann, { q: "zebras" });
    expect(found).toHaveLength(1);
    expect(await list(ann, { q: "100%_" })).toHaveLength(0);
    const counts = await q<{ kind: string; n: number }>(ann, `select * from contribution_counts($1)`, [live]);
    expect(counts.find((c) => c.kind === "question")!.n).toBeGreaterThanOrEqual(2);
  });

  it("limits and validates input", async () => {
    await expect(post(ann, "reflection", "")).rejects.toThrow(/check constraint/i);
    await expect(post(ann, "reflection", "   ")).rejects.toThrow(/check constraint/i);
    await expect(post(ann, "reflection", "x".repeat(4001))).rejects.toThrow(/check constraint/i);
    await expect(post(ann, "reflection", uniq("t"), { title: "A title" })).rejects.toThrow(/check constraint/i); // titles are for prayers
  });

  it("replies are flat, respect visibility, and can be edited by their author", async () => {
    const c = await post(ann, "reflection", uniq("thread"));
    const r = await one<{ id: string }>(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'Amen') returning id`, [c, ben]);
    const replies = await q<{ id: string; author_name: string }>(ann, `select * from list_replies($1)`, [c]);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.author_name).toBe("Ben B.");
    await q(ben, `update contribution_replies set body = 'Amen, friend' where id = $1`, [r.id]);
    const hijack = await h.as(cleo, () => h.db.query(`update contribution_replies set body = 'x' where id = $1`, [r.id]));
    expect(hijack.affectedRows).toBe(0);
    expect((await list(ann)).find((x) => x.id === c)!.reply_count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe("prayer", () => {
  it("is a distinct stored kind, with an optional title", async () => {
    const id = await post(ann, "prayer", uniq("Lord, give us patience."), { title: "Patience" });
    const row = await one<{ kind: string; title: string }>(ann, `select kind, title from community_contributions where id = $1`, [id]);
    expect(row).toEqual({ kind: "prayer", title: "Patience" });
  });

  it("an anonymous prayer cannot be traced to its author through the API", async () => {
    const id = await post(ann, "prayer", uniq("Quiet request"), { visibility: "anonymous" });
    const seenByBen = (await list(ben)).find((r) => r.id === id)!;
    expect(seenByBen.author_name).toBeNull();
    expect(seenByBen.is_mine).toBe(false);
    const seenByAnn = (await list(ann)).find((r) => r.id === id)!;
    expect(seenByAnn.is_mine).toBe(true);
    for (const who of [ben, mod, admin, editor]) {
      await expect(q(who, `select user_id from community_contributions`), String(who)).rejects.toThrow(/permission denied/i);
      await expect(q(who, `select * from community_contributions`), String(who)).rejects.toThrow(/permission denied/i);
    }
    // The columns clients may read do not include the author.
    expect(await q(ben, `select id, kind, body from community_contributions where id = $1`, [id])).toHaveLength(1);
  });

  it("a private prayer is visible only to its author", async () => {
    const id = await post(ann, "prayer", uniq("Only for me"), { visibility: "private" });
    expect((await list(ann)).some((r) => r.id === id)).toBe(true);
    for (const who of [ben, mod]) expect((await list(who)).some((r) => r.id === id)).toBe(false);
    expect(await q(ben, `select id from community_contributions where id = $1`, [id])).toHaveLength(0);
  });

  it("only prayers may be anonymous or private", async () => {
    await expect(post(ann, "reflection", uniq("r"), { visibility: "anonymous" })).rejects.toThrow(/check constraint/i);
    await expect(post(ann, "question", uniq("r"), { visibility: "private" })).rejects.toThrow(/check constraint/i);
  });

  it("'I prayed for this' counts quietly, once per person, and never on your own prayer", async () => {
    const id = await post(cleo, "prayer", uniq("For a hard week"));
    expect((await one<{ acknowledge_prayer: number }>(ann, `select acknowledge_prayer($1)`, [id])).acknowledge_prayer).toBe(1);
    expect((await one<{ acknowledge_prayer: number }>(ann, `select acknowledge_prayer($1)`, [id])).acknowledge_prayer).toBe(1); // idempotent
    expect((await one<{ acknowledge_prayer: number }>(ben, `select acknowledge_prayer($1)`, [id])).acknowledge_prayer).toBe(2);
    const seen = (await list(ann)).find((r) => r.id === id)!;
    expect(seen).toMatchObject({ prayer_count: 2, i_prayed: true });
    await expect(q(cleo, `select acknowledge_prayer($1)`, [id])).rejects.toThrow(/cannot do that/i);
    expect((await one<{ acknowledge_prayer: number }>(ann, `select acknowledge_prayer($1, null, false)`, [id])).acknowledge_prayer).toBe(1);
  });

  it("who prayed is private: acknowledgements are visible only to the person who made them", async () => {
    const id = await post(cleo, "prayer", uniq("Another request"));
    await q(ann, `select acknowledge_prayer($1)`, [id]);
    // Nobody sees anyone else's acknowledgements: not the author, not other readers, not moderators.
    for (const who of [ben, cleo, mod, admin]) {
      expect(await q(who, `select * from prayer_acknowledgements where user_id <> $1`, [who]), String(who)).toHaveLength(0);
    }
    expect((await q(ann, `select * from prayer_acknowledgements where user_id = $1`, [ann])).length).toBeGreaterThan(0);
  });

  it("only prayers can be prayed for, and not private or hidden ones", async () => {
    const refl = await post(ann, "reflection", uniq("not a prayer"));
    await expect(q(ben, `select acknowledge_prayer($1)`, [refl])).rejects.toThrow(/cannot do that/i);
    const priv = await post(dan, "prayer", uniq("private"), { visibility: "private" });
    await expect(q(ben, `select acknowledge_prayer($1)`, [priv])).rejects.toThrow(/cannot do that/i);
    await expect(q(ben, `insert into prayer_acknowledgements (user_id, contribution_id) values ($1,$2)`, [ben, refl])).rejects.toThrow(DENIED);
  });

  it("prayers are never ordered by acknowledgement count", async () => {
    const first = await post(dan, "prayer", uniq("older prayer"));
    const second = await post(dan, "prayer", uniq("newer prayer"));
    await q(ann, `select acknowledge_prayer($1)`, [first]);
    await q(ben, `select acknowledge_prayer($1)`, [first]);
    const rows = await list(cleo, { kind: "prayer" });
    expect(rows.findIndex((r) => r.id === second)).toBeLessThan(rows.findIndex((r) => r.id === first));
  });
});

// ---------------------------------------------------------------------------
describe("rate limits and blocks", () => {
  it("limits how fast one person can post, and refuses an immediate repeat", async () => {
    const eve = await h.createUser("eve@c.test");
    await post(eve, "reflection", "same words");
    await expect(post(eve, "reflection", "same words")).rejects.toThrow(/duplicate/i);
    for (let i = 0; i < 9; i++) await post(eve, "reflection", uniq("burst"));
    await expect(post(eve, "reflection", uniq("one too many"))).rejects.toThrow(/too quickly/i);
  });

  it("a block hides the person's contributions from the blocker, and only the blocker's own list reveals it", async () => {
    const gil = await h.createUser("gil@c.test", { first: "Gil", last: "Gum" });
    const hal = await h.createUser("hal@c.test", { first: "Hal", last: "Hazel" });
    const id = await post(gil, "reflection", uniq("from Gil"));
    expect((await list(hal)).some((r) => r.id === id)).toBe(true);
    await q(hal, `insert into user_blocks (blocker_id, blocked_id) values ($1,$2)`, [hal, gil]);
    expect((await list(hal)).some((r) => r.id === id)).toBe(false);
    expect((await list(ann)).some((r) => r.id === id)).toBe(true);
    // Gil cannot see that Hal blocked them.
    expect(await q(gil, `select * from user_blocks`)).toHaveLength(0);
    await q(hal, `delete from user_blocks where blocked_id = $1`, [gil]);
    expect((await list(hal)).some((r) => r.id === id)).toBe(true);
  });

  it("blocks are made from content, so author ids stay hidden; anonymous prayers cannot be blocked", async () => {
    const gil = await fresh("Gil");
    const hal = await fresh("Hal");
    const id = await post(gil, "reflection", uniq("block me"));
    await q(hal, `select block_author('contribution', $1)`, [id]);
    expect((await list(hal)).some((r) => r.id === id)).toBe(false);
    expect((await q<{ label: string }>(hal, `select * from my_blocks()`)).map((b) => b.label)).toEqual(["Gil P."]);
    expect(await q(gil, `select * from my_blocks()`)).toHaveLength(0);
    await expect(q(gil, `select block_author('contribution', $1)`, [id])).rejects.toThrow(/block yourself/i);
    const anon = await post(gil, "prayer", uniq("anonymous"), { visibility: "anonymous" });
    await expect(q(await fresh(), `select block_author('contribution', $1)`, [anon])).rejects.toThrow(/anonymous/i);
    const priv = await post(gil, "prayer", uniq("private"), { visibility: "private" });
    await expect(q(hal, `select block_author('contribution', $1)`, [priv])).rejects.toThrow(/no longer available/i);
  });

  it("cannot block yourself or block on someone else's behalf", async () => {
    await expect(q(ann, `insert into user_blocks (blocker_id, blocked_id) values ($1,$1)`, [ann])).rejects.toThrow();
    await expect(q(ann, `insert into user_blocks (blocker_id, blocked_id) values ($1,$2)`, [ben, cleo])).rejects.toThrow(DENIED);
  });
});

// ---------------------------------------------------------------------------
describe("private groups", () => {
  it("anyone verified can create one and becomes its owner; names are validated", async () => {
    const pat = await fresh();
    const gid = (await one<{ create_group: string }>(pat, `select create_group('Faith and Algebra','','','','other','private')`)).create_group;
    expect(await one(pat, `select role from group_memberships where group_id = $1 and user_id = $2`, [gid, pat])).toEqual({ role: "owner" });
    await expect(q(pat, `select create_group('x','','','','other','private')`)).rejects.toThrow(/check constraint/i);
    await expect(q(unverified, `select create_group('Ok name','','','','other','private')`)).rejects.toThrow(/verify/i);
  });

  it("limits how many groups one person can lead", async () => {
    const fay = await h.createUser("fay@c.test");
    for (let i = 0; i < 3; i++) await q(fay, `select create_group($1,'','','','other','private')`, [uniq("Led")]);
    await expect(q(fay, `select create_group('A fourth','','','','other','private')`)).rejects.toThrow(/limit/i);
  });

  it("a non-member sees nothing of a private group: not the group, posts, roster or requests", async () => {
    const gid = await newGroup(ann, "private", "Hidden fellowship");
    const p = await gpost(ann, gid, "Private prayer: please pray for our principal", "prayer");
    expect(await q(cleo, `select * from community_groups where id = $1`, [gid])).toHaveLength(0);
    expect(await q(cleo, `select * from group_posts`)).toHaveLength(0);
    expect(await q(cleo, `select * from group_memberships where group_id = $1`, [gid])).toHaveLength(0);
    expect(await q(cleo, `select * from get_group($1)`, [gid])).toHaveLength(0);
    expect(await glist(cleo, gid)).toHaveLength(0);
    expect(await q(cleo, `select * from group_roster($1)`, [gid])).toHaveLength(0);
    expect(await q(cleo, `select * from list_group_comments($1)`, [p])).toHaveLength(0);
    await expect(gpost(cleo, gid)).rejects.toThrow(DENIED);
    await expect(q(cleo, `select request_to_join($1, '')`, [gid])).rejects.toThrow(/not available/i);
    const dir = await q<{ name: string }>(cleo, `select * from group_directory()`);
    expect(dir.map((d) => d.name)).not.toContain("Hidden fellowship");
    // The platform's staff cannot read it either.
    for (const who of [admin, mod, editor]) {
      expect(await glist(who, gid), String(who)).toHaveLength(0);
      expect(await q(who, `select * from group_posts`)).toHaveLength(0);
    }
  });

  it("every manager-only and member-only function gives an outsider nothing, never a NULL-guard slip", async () => {
    const gid = await newGroup(ann, "discoverable");
    const p = await gpost(ann, gid);
    const outsider = await fresh();
    await q(await fresh(), `select request_to_join($1,'please')`, [gid]);
    expect(await q(outsider, `select * from list_join_requests($1)`, [gid])).toHaveLength(0);
    expect(await q(outsider, `select * from list_group_reports($1)`, [gid])).toHaveLength(0);
    expect(await q(outsider, `select * from group_roster($1)`, [gid])).toHaveLength(0);
    expect(await q(outsider, `select * from list_group_posts($1)`, [gid])).toHaveLength(0);
    expect(await q(outsider, `select * from list_group_comments($1)`, [p])).toHaveLength(0);
    await expect(q(outsider, `select acknowledge_prayer(null, $1)`, [p])).rejects.toThrow(/cannot do that/i);
    await expect(q(outsider, `select update_group($1,'x2','','','','other','private')`, [gid])).rejects.toThrow(/owner/i);
    await expect(q(outsider, `select delete_group($1)`, [gid])).rejects.toThrow(/owner/i);
    await expect(q(outsider, `select transfer_group_ownership($1,$2)`, [gid, outsider])).rejects.toThrow(/not available/i);
    await expect(q(outsider, `select suspend_group_member($1,$2,1,'x')`, [gid, ann])).rejects.toThrow(/cannot do that/i);
    await expect(q(outsider, `select unsuspend_group_member($1,$2)`, [gid, ann])).rejects.toThrow(/cannot do that/i);
    await expect(q(outsider, `select * from list_platform_reports()`)).resolves.toHaveLength(0);
    await expect(q(outsider, `select * from list_appeals()`)).resolves.toHaveLength(0);
    await expect(q(outsider, `select * from list_restrictions()`)).resolves.toHaveLength(0);
    // Visitors cannot call any of it.
    await expect(h.asAnon(() => h.db.query(`select * from list_join_requests($1)`, [gid]))).rejects.toThrow(/permission denied/i);
  });

  it("a discoverable group shows only its name and purpose in the directory; content stays private", async () => {
    const gid = await newGroup(ann, "discoverable", "Open fellowship");
    await gpost(ann, gid, "Inside content");
    const dir = await q<Record<string, unknown>>(cleo, `select * from group_directory()`);
    const entry = dir.find((d) => d.name === "Open fellowship")!;
    expect(Object.keys(entry).sort()).toEqual(["category", "description", "id", "is_school_group", "name", "purpose", "relationship"]);
    expect(JSON.stringify(entry)).not.toContain("Inside content");
    expect(await glist(cleo, gid)).toHaveLength(0);
    expect(await q(cleo, `select * from group_roster($1)`, [gid])).toHaveLength(0);
    expect(await q(cleo, `select * from group_posts where group_id = $1`, [gid])).toHaveLength(0);
    // Searching the directory narrows by name.
    expect((await q(cleo, `select * from group_directory('open')`)).length).toBeGreaterThanOrEqual(1);
    expect(await q(cleo, `select * from group_directory('zzzz')`)).toHaveLength(0);
  });

  it("joining a discoverable group is by request, approved by a manager", async () => {
    const gid = await newGroup(ann, "discoverable");
    await q(cleo, `select request_to_join($1, 'Hello, I teach fourth grade')`, [gid]);
    await expect(q(cleo, `select request_to_join($1, '')`, [gid])).rejects.toThrow(/already asked/i);
    expect(await q(ben, `select * from list_join_requests($1)`, [gid])).toHaveLength(0);
    const [req] = await q<{ id: string; requester_name: string }>(ann, `select * from list_join_requests($1)`, [gid]);
    expect(req!.requester_name).toBe("Cleo C.");
    expect(await glist(cleo, gid)).toHaveLength(0); // still outside
    await expect(q(ben, `select decide_join_request($1, true)`, [req!.id])).rejects.toThrow(/not available/i);
    await q(ann, `select decide_join_request($1, true)`, [req!.id]);
    await gpost(ann, gid, "Welcome");
    expect((await glist(cleo, gid)).length).toBeGreaterThan(0);
  });

  it("a declined request gives the person no access", async () => {
    const gid = await newGroup(ann, "discoverable");
    await q(dan, `select request_to_join($1, '')`, [gid]);
    const [req] = await q<{ id: string }>(ann, `select * from list_join_requests($1)`, [gid]);
    await q(ann, `select decide_join_request($1, false)`, [req!.id]);
    expect(await q(dan, `select * from get_group($1) where my_status is not null`, [gid])).toHaveLength(0);
  });

  it("members write posts and comments; comments nest one level; the author sees their own name", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    const p = await gpost(ben, gid, uniq("Hello group"));
    const c = (await one<{ id: string }>(ann, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'Welcome') returning id`, [p, gid, ann])).id;
    const reply = await one<{ id: string }>(ben, `insert into group_comments (post_id, group_id, author_id, parent_id, body) values ($1,$2,$3,$4,'Thanks') returning id`, [p, gid, ben, c]);
    await expect(
      q(ann, `insert into group_comments (post_id, group_id, author_id, parent_id, body) values ($1,$2,$3,$4,'too deep')`, [p, gid, ann, reply.id]),
    ).rejects.toThrow(/top-level/i);
    const comments = await q<{ body: string; author_name: string }>(ben, `select * from list_group_comments($1)`, [p]);
    expect(comments.map((x) => x.body)).toEqual(["Welcome", "Thanks"]);
    expect((await glist(ben, gid))[0]!.author_name).toBe("Ben B.");
  });

  it("a comment's group must match its post, so content cannot be smuggled across groups", async () => {
    const g1 = await newGroup(ann);
    const g2 = await newGroup(ben);
    const p = await gpost(ann, g1);
    await expect(
      q(ben, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'sneaky')`, [p, g2, ben]),
    ).rejects.toThrow();
    await expect(q(ben, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'sneaky')`, [p, g1, ben])).rejects.toThrow(DENIED);
  });

  it("members of one group cannot see another group's content", async () => {
    const g1 = await newGroup(ann);
    const g2 = await newGroup(ben);
    await gpost(ann, g1, "g1 secret");
    expect(await glist(ben, g1)).toHaveLength(0);
    expect(await glist(ann, g2)).toHaveLength(0);
  });

  it("only the owner edits settings; only the author edits or deletes a post", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben, "moderator");
    await expect(q(ben, `select update_group($1,'New','','','','other','private')`, [gid])).rejects.toThrow(/owner/i);
    await q(ann, `select update_group($1,'Renamed','','','','other','discoverable')`, [gid]);
    const p = await gpost(ann, gid);
    const edit = await h.as(ben, () => h.db.query(`update group_posts set body = 'changed' where id = $1`, [p]));
    expect(edit.affectedRows).toBe(0);
    const del = await h.as(ben, () => h.db.query(`delete from group_posts where id = $1`, [p]));
    expect(del.affectedRows).toBe(0);
    await q(ann, `update group_posts set body = 'edited' where id = $1`, [p]);
  });

  it("group prayers can be prayed for by members only", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    const p = await gpost(ann, gid, uniq("Pray for our staff"), "prayer");
    expect((await one<{ acknowledge_prayer: number }>(ben, `select acknowledge_prayer(null, $1)`, [p])).acknowledge_prayer).toBe(1);
    await expect(q(cleo, `select acknowledge_prayer(null, $1)`, [p])).rejects.toThrow(/cannot do that/i);
    await expect(q(ann, `select acknowledge_prayer(null, $1)`, [p])).rejects.toThrow(/cannot do that/i);
    expect((await glist(ann, gid)).find((x) => x.id === p)).toBeTruthy();
  });

  it("a post may link a live devotional but not reveal an unpublished one", async () => {
    const gid = await newGroup(ann);
    await q(ann, `insert into group_posts (group_id, author_id, body, devotional_id, scripture_reference) values ($1,$2,'Discuss',$3,'John 3:16')`, [gid, ann, live]);
    const rows = await q<{ devotional_title: string | null }>(ann, `select * from list_group_posts($1)`, [gid]);
    expect(rows[0]!.devotional_title).toContain("T 2019-04-01");
    await h.admin.query(`insert into group_posts (group_id, author_id, body, devotional_id) values ($1,$2,'Linked draft',$3)`, [gid, ann, draft]);
    const withDraft = await q<{ body: string; devotional_title: string | null }>(ann, `select * from list_group_posts($1)`, [gid]);
    expect(withDraft.find((r) => r.body === "Linked draft")!.devotional_title).toBeNull();
  });

  it("invitations: the invited verified email can join; a different account cannot; managers only", async () => {
    const gid = await newGroup(ann);
    const token = "tok-" + Math.random();
    const hash = (await h.admin.query<{ h: string }>(`select encode(sha256(convert_to($1,'UTF8')),'hex') h`, [token])).rows[0]!.h;
    await expect(
      q(cleo, `insert into group_invitations (group_id, email, token_hash, invited_by) values ($1,'dan@c.test',$2,$3)`, [gid, hash, cleo]),
    ).rejects.toThrow(DENIED);
    await q(ann, `insert into group_invitations (group_id, email, token_hash, invited_by) values ($1,'dan@c.test',$2,$3)`, [gid, hash, ann]);
    await expect(q(cleo, `select accept_group_invitation($1)`, [token])).rejects.toThrow(/invalid or has expired/i);
    expect(await q(cleo, `select * from group_invitations`)).toHaveLength(0);
    expect(await q(dan, `select * from preview_group_invitation($1)`, [token])).toHaveLength(1);
    await q(dan, `select accept_group_invitation($1)`, [token]);
    await expect(q(dan, `select accept_group_invitation($1)`, [token])).rejects.toThrow(/invalid or has expired/i);
    expect(await q(dan, `select * from get_group($1)`, [gid])).toHaveLength(1);
  });

  it("only the owner can invite a moderator", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben, "moderator");
    await expect(
      q(ben, `insert into group_invitations (group_id, email, role, token_hash, invited_by) values ($1,'x@c.test','moderator','h1',$2)`, [gid, ben]),
    ).rejects.toThrow(DENIED);
    await q(ben, `insert into group_invitations (group_id, email, role, token_hash, invited_by) values ($1,'x@c.test','member','h2',$2)`, [gid, ben]);
  });

  it("a school group admits only members of that school", async () => {
    const owner = await h.createUser("sch@c.test");
    const school = (await one<{ create_school: string }>(owner, `select create_school('Grace Academy')`)).create_school;
    // School groups are a School License tool; the license is set up by the server, never the client.
    await h.admin.query(
      `insert into subscriptions (owner_type, school_id, plan_key, plan_interval, status, stripe_subscription_id, seats, current_period_end, last_event_created)
       values ('school', $1, 'school', 'year', 'active', 'sub_comm_test', 10, now() + interval '30 days', now())`, [school]);
    const gid = (await one<{ create_group: string }>(owner, `select create_group('Faculty','','','','school','discoverable',$1)`, [school])).create_group;
    expect((await q<{ name: string }>(cleo, `select * from group_directory()`)).map((d) => d.name)).not.toContain("Faculty");
    await expect(q(cleo, `select request_to_join($1,'')`, [gid])).rejects.toThrow(/not available/i);
    await expect(q(cleo, `select create_group('Mine','','','','school','private',$1)`, [school])).rejects.toThrow(/school owner or administrator/i);
    await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'faculty')`, [school, cleo]);
    expect((await q<{ name: string }>(cleo, `select * from group_directory()`)).map((d) => d.name)).toContain("Faculty");
    await q(cleo, `select request_to_join($1,'')`, [gid]);
  });

  it("an owner cannot leave while others remain; ownership can be transferred; an emptied group goes away", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    await expect(q(ann, `select leave_group($1)`, [gid])).rejects.toThrow(/ownership/i);
    expect((await q(ann, `select * from account_deletion_blockers()`)).length).toBeGreaterThan(0);
    await expect(q(ann, `select transfer_group_ownership($1,$2)`, [gid, cleo])).rejects.toThrow(/active member/i);
    await q(ann, `select transfer_group_ownership($1,$2)`, [gid, ben]);
    expect(await one(ben, `select role from group_memberships where group_id=$1 and user_id=$2`, [gid, ben])).toEqual({ role: "owner" });
    await q(ann, `select leave_group($1)`, [gid]);
    await q(ben, `select leave_group($1)`, [gid]);
    expect((await h.admin.query(`select 1 from community_groups where id = $1`, [gid])).rows).toHaveLength(0);
  });

  it("members cannot promote themselves or edit memberships directly", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    await expect(q(ben, `update group_memberships set role = 'owner' where user_id = $1`, [ben])).rejects.toThrow(DENIED);
    await expect(q(ben, `insert into group_memberships (group_id, user_id) values ($1,$2)`, [gid, cleo])).rejects.toThrow(DENIED);
    await expect(q(ben, `select set_group_member_role($1,$2,'moderator')`, [gid, ben])).rejects.toThrow(/owner/i);
    await q(ann, `select set_group_member_role($1,$2,'moderator')`, [gid, ben]);
  });
});

// ---------------------------------------------------------------------------
describe("group moderation", () => {
  it("a suspended member can read but not write, and a timed suspension ends by itself", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    await gpost(ann, gid, "to read");
    await q(ann, `select suspend_group_member($1,$2,7,'cooling off')`, [gid, ben]);
    expect((await glist(ben, gid)).length).toBeGreaterThan(0);
    await expect(gpost(ben, gid)).rejects.toThrow(DENIED);
    await h.admin.query(`update group_memberships set suspended_until = now() - interval '1 minute' where group_id=$1 and user_id=$2`, [gid, ben]);
    await gpost(ben, gid);
    await q(ann, `select suspend_group_member($1,$2,null,'again')`, [gid, ben]);
    await q(ann, `select unsuspend_group_member($1,$2)`, [gid, ben]);
    await gpost(ben, gid);
  });

  it("removed members lose all access; moderators can remove members but not each other or the owner", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben, "moderator");
    await join(gid, ann, cleo, "moderator");
    await join(gid, ann, dan);
    await expect(q(ben, `select remove_group_member($1,$2,'x')`, [gid, cleo])).rejects.toThrow(/cannot do that/i);
    await expect(q(ben, `select remove_group_member($1,$2,'x')`, [gid, ann])).rejects.toThrow(/cannot do that/i);
    await expect(q(dan, `select remove_group_member($1,$2,'x')`, [gid, cleo])).rejects.toThrow(/cannot do that/i);
    await expect(q(ben, `select remove_group_member($1,$2,'')`, [gid, dan])).rejects.toThrow(/reason/i);
    await q(ben, `select remove_group_member($1,$2,'Repeated off-topic posts')`, [gid, dan]);
    expect(await glist(dan, gid)).toHaveLength(0);
    await q(ann, `select remove_group_member($1,$2,'Handled by owner')`, [gid, cleo]);
    const log = await q<{ action: string }>(ann, `select action from moderation_actions where group_id = $1 order by created_at`, [gid]);
    expect(log.map((l) => l.action)).toEqual(["group_remove_member", "group_remove_member"]);
    // The removed person can read what was done about them.
    expect((await q(dan, `select * from my_moderation_notices()`)).length).toBe(1);
  });

  it("a platform moderator can suspend a whole group, which closes it to its members", async () => {
    const gid = await newGroup(ann);
    await gpost(ann, gid, "before");
    await expect(q(ann, `select suspend_group($1,'x')`, [gid])).rejects.toThrow(/cannot do that/i);
    await q(mod, `select suspend_group($1,'Reported for solicitation')`, [gid]);
    expect(await glist(ann, gid)).toHaveLength(0);
    await expect(gpost(ann, gid)).rejects.toThrow(DENIED);
    const info = await q<{ group_status: string; suspended_reason: string }>(ann, `select * from get_group($1)`, [gid]);
    expect(info[0]).toMatchObject({ group_status: "suspended", suspended_reason: "Reported for solicitation" });
    await q(mod, `select unsuspend_group($1)`, [gid]);
    expect((await glist(ann, gid)).length).toBeGreaterThan(0);
  });

  it("group reports go to the group's managers first and reach the platform only when escalated", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    await join(gid, ann, cleo);
    const p = await gpost(ben, gid, uniq("a questionable post"));
    const rid = (await one<{ report_content: string }>(cleo, `select report_content('group_post',$1,'inappropriate','off-topic')`, [p])).report_content;
    expect(await q(mod, `select * from list_platform_reports('all') where id = $1`, [rid])).toHaveLength(0);
    expect(await q(ben, `select * from list_group_reports($1)`, [gid])).toHaveLength(0);
    const gr = await q<Record<string, unknown>>(ann, `select * from list_group_reports($1)`, [gid]);
    expect(gr).toHaveLength(1);
    expect(JSON.stringify(gr[0])).not.toContain("Cleo"); // the reporter stays anonymous to the group
    await expect(q(mod, `select resolve_report($1,'hide','x')`, [rid])).rejects.toThrow(/cannot act/i);
    await q(ann, `select escalate_report($1)`, [rid]);
    expect(await q(mod, `select * from list_platform_reports('all') where id = $1`, [rid])).toHaveLength(1);
    await q(ann, `select resolve_report($1,'hide','Not in keeping with our guidelines')`, [rid]);
    const hiddenForOthers = await q(cleo, `select * from list_group_posts($1)`, [gid]);
    expect(hiddenForOthers.find((r: Record<string, unknown>) => r.id === p)).toBeUndefined();
    const forAuthor = (await q<{ id: string; moderation_reason: string }>(ben, `select * from list_group_posts($1)`, [gid])).find((r) => r.id === p)!;
    expect(forAuthor.moderation_reason).toBe("Not in keeping with our guidelines");
  });

  it("a report about a group owner is escalated automatically, so the group cannot judge its own owner", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    const p = await gpost(ann, gid, uniq("owner post"));
    const rid = (await one<{ report_content: string }>(ben, `select report_content('group_post',$1,'harassment','')`, [p])).report_content;
    expect(await q(mod, `select * from list_platform_reports('open') where id = $1`, [rid])).toHaveLength(1);
    await expect(q(ann, `select resolve_report($1,'dismiss','')`, [rid])).rejects.toThrow(/cannot/i); // authors cannot rule on themselves
  });

  it("leaders can hide directly with a reason the author reads, and restore; members cannot", async () => {
    const owner = await fresh("Olive");
    const member = await fresh("Mel");
    const other = await fresh("Opal");
    const gid = await newGroup(owner);
    await join(gid, owner, member);
    await join(gid, owner, other);
    const p = await gpost(member, gid, uniq("something unkind"));
    await expect(q(other, `select hide_content('group_post',$1,'x')`, [p])).rejects.toThrow(/cannot act/i);
    await expect(q(owner, `select hide_content('group_post',$1,'')`, [p])).rejects.toThrow(/say what was wrong/i);
    await q(owner, `select hide_content('group_post',$1,'Please speak kindly of colleagues.')`, [p]);
    expect((await glist(other, gid)).find((r) => r.id === p)).toBeUndefined();
    const mine = (await q<{ id: string; moderation_reason: string }>(member, `select * from list_group_posts($1)`, [gid])).find((r) => r.id === p)!;
    expect(mine.moderation_reason).toBe("Please speak kindly of colleagues.");
    expect((await q<{ reason: string }>(member, `select * from my_moderation_notices()`)).some((n) => n.reason === "Please speak kindly of colleagues.")).toBe(true);
    await q(owner, `select restore_content('group_post',$1,'')`, [p]);
    expect((await glist(other, gid)).find((r) => r.id === p)).toBeTruthy();
    // Platform staff cannot reach private group content this way.
    await expect(q(mod, `select hide_content('group_post',$1,'x')`, [p])).rejects.toThrow(/cannot act/i);
    // Public content: a platform moderator can, an ordinary reader cannot.
    const c = await post(await fresh(), "reflection", uniq("public"));
    await expect(q(other, `select hide_content('contribution',$1,'x')`, [c])).rejects.toThrow(/cannot act/i);
    await q(mod, `select hide_content('contribution',$1,'Directed at a colleague.')`, [c]);
  });

  it("a moderator of a group cannot hide the owner's or another moderator's posts", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben, "moderator");
    await join(gid, ann, cleo, "moderator");
    await join(gid, ann, dan);
    const ownerPost = await gpost(ann, gid);
    const modPost = await gpost(cleo, gid);
    const memberPost = await gpost(dan, gid);
    const r1 = (await one<{ report_content: string }>(dan, `select report_content('group_post',$1,'other','')`, [ownerPost])).report_content;
    const r2 = (await one<{ report_content: string }>(dan, `select report_content('group_post',$1,'other','')`, [modPost])).report_content;
    await expect(q(ben, `select resolve_report($1,'hide','x')`, [r1])).rejects.toThrow(/cannot act/i);
    await expect(q(ben, `select resolve_report($1,'hide','x')`, [r2])).rejects.toThrow(/cannot act/i);
    const r3 = (await one<{ report_content: string }>(cleo, `select report_content('group_post',$1,'other','')`, [memberPost])).report_content;
    await q(ben, `select resolve_report($1,'hide','Please keep to the topic')`, [r3]);
  });
});

// ---------------------------------------------------------------------------
describe("public reports, moderation and appeals", () => {
  it("anyone who can see a contribution can report it once; the evidence survives deletion", async () => {
    // The database now screens text itself (migration 0008), so to model content that slipped through earlier
    // (or was reported for another reason) the screening trigger is paused for this one setup insert.
    await h.admin.query(`alter table community_contributions disable trigger contributions_screen`);
    const id = await post(ben, "reflection", uniq("A hurtful remark about a named student, Jamie Smith")).finally(() =>
      h.admin.query(`alter table community_contributions enable trigger contributions_screen`));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'student_privacy','names a student')`, [id])).report_content;
    await expect(q(ann, `select report_content('contribution',$1,'other','')`, [id])).rejects.toThrow(/already reported/i);
    await expect(q(ben, `select report_content('contribution',$1,'other','')`, [id])).rejects.toThrow(/own/i);
    await q(ben, `delete from community_contributions where id = $1`, [id]);
    const [r] = await q<{ snapshot: string; status: string }>(mod, `select * from list_platform_reports('open') where id = $1`, [rid]);
    expect(r!.snapshot).toContain("Jamie Smith");
    // The reporter sees only their own reports and only a few columns.
    expect(await q(ann, `select id, status from contribution_reports`)).toHaveLength(1);
    await expect(q(ann, `select snapshot from contribution_reports`)).rejects.toThrow(/permission denied/i);
    expect(await q(await fresh(), `select id from contribution_reports`)).toHaveLength(0);
  });

  it("cannot report what you cannot see", async () => {
    const priv = await post(await fresh(), "prayer", uniq("hidden away"), { visibility: "private" });
    await expect(q(ben, `select report_content('contribution',$1,'other','')`, [priv])).rejects.toThrow(/no longer available/i);
  });

  it("only moderators see or resolve the platform queue", async () => {
    const id = await post(cleo, "reflection", uniq("queue test"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'spam_or_solicitation','')`, [id])).report_content;
    expect(await q(ben, `select * from list_platform_reports('open')`)).toHaveLength(0);
    await expect(q(ben, `select resolve_report($1,'hide','x')`, [rid])).rejects.toThrow(/cannot act/i);
    expect((await q(mod, `select * from list_platform_reports('open') where id = $1`, [rid])).length).toBe(1);
    expect((await q<{ reporter_name: string }>(mod, `select reporter_name from list_platform_reports('open') where id = $1`, [rid]))[0]!.reporter_name).toBe("Ann Alder");
  });

  it("hiding is reversible, explained to the author, and never deletes", async () => {
    const id = await post(cleo, "reflection", uniq("needs a look"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'harassment','')`, [id])).report_content;
    await expect(q(mod, `select resolve_report($1,'hide','')`, [rid])).rejects.toThrow(/what was wrong/i);
    await q(mod, `select resolve_report($1,'hide','This was directed at a colleague.')`, [rid]);
    expect((await list(ann)).some((r) => r.id === id)).toBe(false);
    const own = (await list(cleo)).find((r) => r.id === id)!;
    expect(own).toMatchObject({ moderation: "hidden", moderation_reason: "This was directed at a colleague." });
    expect((await h.admin.query(`select 1 from community_contributions where id = $1`, [id])).rows).toHaveLength(1);
    // Hidden content cannot be replied to or prayed for.
    await expect(q(ann, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hello')`, [id, ann])).rejects.toThrow(DENIED);
    await q(mod2, `select restore_content('contribution',$1,'On review this was fine')`, [id]);
    expect((await list(ann)).some((r) => r.id === id)).toBe(true);
  });

  it("an author cannot hide, restore or moderate content, and a moderator cannot moderate their own", async () => {
    const id = await post(cleo, "reflection", uniq("mine"));
    await expect(q(cleo, `select restore_content('contribution',$1,'')`, [id])).rejects.toThrow(/cannot act/i);
    const own = await post(mod, "reflection", uniq("moderator's own"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'other','')`, [own])).report_content;
    await expect(q(mod, `select resolve_report($1,'hide','x')`, [rid])).rejects.toThrow(/cannot act/i);
    await q(mod2, `select resolve_report($1,'dismiss','')`, [rid]);
  });

  it("a moderator cannot rule on a report they filed", async () => {
    const id = await post(cleo, "reflection", uniq("filed by a moderator"));
    const rid = (await one<{ report_content: string }>(mod, `select report_content('contribution',$1,'other','')`, [id])).report_content;
    await expect(q(mod, `select resolve_report($1,'hide','x')`, [rid])).rejects.toThrow(/filed/i);
  });

  it("disagreement is not misconduct: a report can be dismissed and leaves no mark", async () => {
    const dan = await fresh("Dee");
    const id = await post(dan, "question", uniq("Do you think infant baptism is biblical?"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'other','I disagree')`, [id])).report_content;
    await q(mod, `select resolve_report($1,'dismiss','A respectful theological question.')`, [rid]);
    expect((await list(ben)).some((r) => r.id === id)).toBe(true);
    expect(await q(dan, `select * from my_moderation_notices()`)).toHaveLength(0);
    expect((await one<{ violation_count: number }>(mod, `select violation_count($1)`, [dan])).violation_count).toBe(0);
  });

  it("the person is told, may appeal once, and a different moderator reviews; overturning restores", async () => {
    const id = await post(cleo, "reflection", uniq("appealable"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'other','')`, [id])).report_content;
    await q(mod, `select resolve_report($1,'hide','Judged unkind.')`, [rid]);
    const [notice] = await q<{ id: string; can_appeal: boolean; reason: string }>(cleo, `select * from my_moderation_notices() where reason = 'Judged unkind.'`);
    expect(notice!.can_appeal).toBe(true);
    const appeal = (await one<{ file_appeal: string }>(cleo, `select file_appeal($1,'I was quoting Scripture')`, [notice!.id])).file_appeal;
    await expect(q(cleo, `select file_appeal($1,'again')`, [notice!.id])).rejects.toThrow(/already appealed/i);
    await expect(q(ben, `select file_appeal($1,'not mine')`, [notice!.id])).rejects.toThrow(/not available/i);
    expect(await q(ben, `select * from list_appeals('open')`)).toHaveLength(0);
    await expect(q(mod, `select resolve_appeal($1,'overturn','ok')`, [appeal])).rejects.toThrow(/someone else/i);
    await expect(q(mod2, `select resolve_appeal($1,'overturn','')`, [appeal])).rejects.toThrow(/explain/i);
    await q(mod2, `select resolve_appeal($1,'overturn','Quoted Psalm 23 in context.')`, [appeal]);
    expect((await list(ben)).some((r) => r.id === id)).toBe(true);
    const after = await one<{ appeal_status: string }>(cleo, `select appeal_status from my_moderation_notices() where id = $1`, [notice!.id]);
    expect(after.appeal_status).toBe("overturned");
  });

  it("repeat violations are counted from recent actions that were not overturned", async () => {
    const repeat = await h.createUser("repeat@c.test");
    for (let i = 0; i < 2; i++) {
      const id = await post(repeat, "reflection", uniq("again"));
      const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'spam_or_solicitation','')`, [id])).report_content;
      await q(mod, `select resolve_report($1,'hide','Spam')`, [rid]);
    }
    expect((await one<{ violation_count: number }>(mod, `select violation_count($1)`, [repeat])).violation_count).toBe(2);
    expect((await one<{ violation_count: number }>(ben, `select violation_count($1)`, [repeat])).violation_count).toBe(0);
    const [n] = await q<{ author_violations: number }>(mod, `select author_violations from list_platform_reports('actioned') limit 1`);
    expect(n!.author_violations).toBeGreaterThanOrEqual(1);
  });

  it("a restricted person can read but not post, reply, react or start groups; lifting restores access", async () => {
    const ivy = await h.createUser("ivy@c.test");
    const id = await post(cleo, "prayer", uniq("pray"));
    const rid = (await one<{ restrict_user: string }>(mod, `select restrict_user($1,'suspension',3,'Repeated harassment')`, [ivy])).restrict_user;
    expect((await list(ivy)).length).toBeGreaterThan(0);
    await expect(post(ivy, "reflection")).rejects.toThrow(DENIED);
    await expect(q(ivy, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [id, ivy])).rejects.toThrow(DENIED);
    await expect(q(ivy, `select acknowledge_prayer($1)`, [id])).rejects.toThrow(/cannot do that/i);
    await expect(q(ivy, `select create_group('Nope','','','','other','private')`)).rejects.toThrow(/restricted/i);
    await expect(q(ben, `select lift_restriction($1)`, [rid])).rejects.toThrow(/cannot do that/i);
    await q(mod, `select lift_restriction($1,'Apologised')`, [rid]);
    await post(ivy, "reflection");
  });

  it("platform staff cannot be restricted, nobody can restrict themselves, and ordinary users cannot restrict", async () => {
    await expect(q(mod, `select restrict_user($1,'ban',null,'x')`, [admin])).rejects.toThrow(/staff/i);
    await expect(q(mod, `select restrict_user($1,'ban',null,'x')`, [mod])).rejects.toThrow(/cannot do that/i);
    await expect(q(ann, `select restrict_user($1,'ban',null,'x')`, [ben])).rejects.toThrow(/cannot do that/i);
    await expect(q(ann, `insert into community_restrictions (user_id, kind, reason) values ($1,'ban','x')`, [ben])).rejects.toThrow(/permission denied/i);
  });

  it("reports of content already deleted by its author can still be closed", async () => {
    const id = await post(cleo, "reflection", uniq("soon gone"));
    const rid = (await one<{ report_content: string }>(ann, `select report_content('contribution',$1,'other','')`, [id])).report_content;
    await q(cleo, `delete from community_contributions where id = $1`, [id]);
    await q(mod, `select resolve_report($1,'dismiss','Removed by its author')`, [rid]);
  });

  it("the moderation log cannot be written or altered by clients", async () => {
    for (const who of [ann, mod, admin]) {
      await expect(q(who, `insert into moderation_actions (scope, action, reason) values ('platform','warn','x')`)).rejects.toThrow(/permission denied/i);
      await expect(q(who, `update moderation_actions set reason = 'edited'`)).rejects.toThrow(/permission denied/i);
      await expect(q(who, `delete from moderation_actions`)).rejects.toThrow(/permission denied/i);
    }
    await expect(q(ann, `update contribution_reports set status = 'dismissed'`)).rejects.toThrow(/permission denied/i);
  });
});

// ---------------------------------------------------------------------------
describe("settings and feature flags", () => {
  it("only a platform administrator can change them", async () => {
    await expect(q(mod, `select set_community_setting('groups_enabled','false')`)).rejects.toThrow(/not allowed/i);
    await expect(q(admin, `update community_settings set value = 'false' where key = 'groups_enabled'`)).rejects.toThrow(/permission denied/i);
    await expect(q(admin, `select set_community_setting('nonsense','1')`)).rejects.toThrow(/unknown/i);
  });

  it("turning groups off stops writing and creating, and nothing is deleted", async () => {
    // Discussion has its own switch; groups have another.
    const owner = await fresh();
    const gid = await newGroup(owner);
    await gpost(owner, gid, "while on");
    await q(admin, `select set_community_setting('groups_enabled','false')`);
    try {
      await expect(gpost(owner, gid)).rejects.toThrow(DENIED);
      await expect(q(await fresh(), `select create_group('Off','','','','other','private')`)).rejects.toThrow(/not available/i);
    } finally {
      // Cleanup, not the gate under test: reopening through the RPC now also needs launch readiness (launch.test.ts).
      await h.admin.query(`update community_settings set value = 'true' where key = 'groups_enabled'`);
    }
    expect((await glist(owner, gid)).map((r) => r.body)).toContain("while on");
    await gpost(owner, gid);
  });

  it("group creation can be limited to school administrators or staff", async () => {
    const pat = await fresh();
    try {
      await q(admin, `select set_community_setting('group_creation','"staff"')`);
      await expect(q(pat, `select create_group('Policy','','','','other','private')`)).rejects.toThrow(/platform team/i);
      await q(mod, `select create_group('Staff made','','','','other','private')`);
      await q(admin, `select set_community_setting('group_creation','"school_admins"')`);
      await expect(q(pat, `select create_group('Policy','','','','other','private')`)).rejects.toThrow(/school administrators/i);
    } finally {
      await q(admin, `select set_community_setting('group_creation','"verified"')`);
    }
    await q(pat, `select create_group('Policy ok','','','','other','private')`);
  });

  it("discussion can be hidden per person without affecting anything else", async () => {
    await q(ben, `update profiles set show_discussions = false where id = $1`, [ben]);
    expect((await one<{ show_discussions: boolean }>(ben, `select show_discussions from profiles where id = $1`, [ben])).show_discussions).toBe(false);
    const other = await h.as(ann, () => h.db.query(`update profiles set show_discussions = false where id = $1`, [ben]));
    expect(other.affectedRows).toBe(0);
    await q(ben, `update profiles set show_discussions = true where id = $1`, [ben]);
  });
});

// ---------------------------------------------------------------------------
describe("direct messages: modelled, permissioned, and off", () => {
  it("are disabled by default, even for people who share a group", async () => {
    const gid = await newGroup(ann);
    await join(gid, ann, ben);
    await expect(q(ann, `select start_direct_conversation($1)`, [ben])).rejects.toThrow(/not enabled/i);
    expect(await q(ann, `select * from direct_conversations`)).toHaveLength(0);
    await expect(q(ann, `insert into direct_messages (conversation_id, sender_id, body) values (gen_random_uuid(), $1, 'hi')`, [ann])).rejects.toThrow(DENIED);
  });

  it("when enabled they still require a shared group, no block, and good standing", async () => {
    const jo = await h.createUser("jo@c.test");
    const kim = await h.createUser("kim@c.test");
    const lee = await h.createUser("lee@c.test");
    const gid = await newGroup(jo);
    await join(gid, jo, kim);
    // The application can no longer switch this on (migration 0008); a future release would do it deliberately, as here.
    await h.admin.query(`update community_settings set value = 'true' where key = 'direct_messages_enabled'`);
    try {
      await expect(q(jo, `select start_direct_conversation($1)`, [lee])).rejects.toThrow(/share a group/i); // a stranger
      const cid = (await one<{ start_direct_conversation: string }>(jo, `select start_direct_conversation($1)`, [kim])).start_direct_conversation;
      expect((await one<{ start_direct_conversation: string }>(kim, `select start_direct_conversation($1)`, [jo])).start_direct_conversation).toBe(cid);
      await q(jo, `insert into direct_messages (conversation_id, sender_id, body) values ($1,$2,'Hello')`, [cid, jo]);
      expect(await q(kim, `select body from direct_messages`)).toEqual([{ body: "Hello" }]);
      // Outsiders and staff cannot read it.
      for (const who of [lee, mod, admin]) expect(await q(who, `select * from direct_messages`), String(who)).toHaveLength(0);
      // A stranger cannot post into the thread.
      await expect(q(lee, `insert into direct_messages (conversation_id, sender_id, body) values ($1,$2,'hi')`, [cid, lee])).rejects.toThrow(DENIED);
      // A block ends the conversation for sending, in both directions.
      await q(kim, `insert into user_blocks (blocker_id, blocked_id) values ($1,$2)`, [kim, jo]);
      await expect(q(jo, `insert into direct_messages (conversation_id, sender_id, body) values ($1,$2,'again')`, [cid, jo])).rejects.toThrow(DENIED);
      await expect(q(kim, `insert into direct_messages (conversation_id, sender_id, body) values ($1,$2,'reply')`, [cid, kim])).rejects.toThrow(DENIED);
      await q(kim, `delete from user_blocks where blocker_id = $1`, [kim]);
      // Leaving the shared group ends the ability to message.
      await q(kim, `select leave_group($1)`, [gid]);
      await expect(q(jo, `insert into direct_messages (conversation_id, sender_id, body) values ($1,$2,'still there?')`, [cid, jo])).rejects.toThrow(DENIED);
    } finally {
      await h.admin.query(`update community_settings set value = 'false' where key = 'direct_messages_enabled'`);
    }
    // Switched off again: the existing thread becomes unreadable.
    expect(await q(jo, `select * from direct_messages`)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("who can see whose name", () => {
  it("a stranger with no shared context is shown as 'A member'", async () => {
    const [row] = await q<{ n: string }>(cleo, `select community_display_name($1) n`, [editor2]);
    expect(row!.n).toBe("A member");
  });

  it("the profiles table itself stays private", async () => {
    expect(await q(ben, `select * from profiles where id = $1`, [ann])).toHaveLength(0);
  });

  it("is removed with the account", async () => {
    const zed = await h.createUser("zed@c.test");
    await post(zed, "prayer", uniq("gone with the account"));
    await h.admin.query(`delete from profiles where id = $1`, [zed]);
    await h.admin.query(`delete from auth.users where id = $1`, [zed]);
    expect((await h.admin.query(`select 1 from community_contributions where user_id = $1`, [zed])).rows).toHaveLength(0);
  });
});
