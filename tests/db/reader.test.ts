import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** Bookmarks, completion, private notes and reminder preferences: strictly per-person. */

let h: Harness;
let editor: string;
let editor2: string;
let ann: string; // reader
let ben: string; // reader
let admin: string; // platform administrator
let live: string; // a published devotional
let draft: string; // an unpublished one

const DENIED = /row-level security|permission denied/i;
const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
async function mk(user: string, date: string, book: string, chapter: number, ref: string) {
  const rows = await q<{ id: string }>(
    user,
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category)
     values ('T '||$1::date::text, $1::date, 'topic', 'patience', $2, $3, $4, 'web', $5::jsonb, $5::jsonb, $5::jsonb, $5::jsonb, 'teachers', '{g35}', 'classroom')
     returning id`,
    [date, ref, book, chapter, doc("Some text")],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: true });
  editor = await h.createUser("ed@r.test", { first: "Ed", last: "Itor" });
  editor2 = await h.createUser("ed2@r.test");
  ann = await h.createUser("ann@r.test");
  ben = await h.createUser("ben@r.test");
  admin = await h.createUser("root@r.test");
  await h.admin.query(
    `insert into platform_roles (user_id, role) values ($1,'content_editor'), ($2,'content_editor'), ($3,'platform_admin')`,
    [editor, editor2, admin],
  );
  live = await mk(editor, "2019-03-04", "John", 3, "John 3:16");
  await q(editor, `select transition_devotional($1, 'in_review')`, [live]);
  await q(editor2, `select transition_devotional($1, 'approved')`, [live]);
  await q(editor2, `select transition_devotional($1, 'published')`, [live]);
  draft = await mk(editor, "2019-03-05", "1 John", 3, "1 John 3:1");
});

afterAll(async () => {
  await h.db.close();
});

describe("personal state is private", () => {
  it("a reader can bookmark, complete and annotate a live devotional", async () => {
    await q(ann, `insert into devotional_user_state (user_id, devotional_id, bookmarked, note) values ($1,$2,true,'Use with 8th grade')`, [ann, live]);
    await q(ann, `update devotional_user_state set completed_at = now() where devotional_id = $1`, [live]);
    const [row] = await q<{ bookmarked: boolean; completed_at: string | null; note: string }>(ann, `select * from devotional_user_state where devotional_id = $1`, [live]);
    expect(row).toMatchObject({ bookmarked: true, note: "Use with 8th grade" });
    expect(row!.completed_at).not.toBeNull();
  });

  it("nobody else can read it: another reader, an editor, or a platform administrator", async () => {
    for (const who of [ben, editor, admin]) {
      expect(await q(who, `select * from devotional_user_state`), String(who)).toHaveLength(0);
    }
  });

  it("nobody else can change or delete it", async () => {
    for (const who of [ben, editor, admin]) {
      const upd = await h.as(who, () => h.db.query(`update devotional_user_state set note = 'hijacked' where user_id = $1`, [ann]));
      expect(upd.affectedRows).toBe(0);
      const del = await h.as(who, () => h.db.query(`delete from devotional_user_state where user_id = $1`, [ann]));
      expect(del.affectedRows).toBe(0);
    }
    const [row] = await q<{ note: string }>(ann, `select note from devotional_user_state`);
    expect(row!.note).toBe("Use with 8th grade");
  });

  it("a reader cannot write state in someone else's name", async () => {
    await expect(
      q(ben, `insert into devotional_user_state (user_id, devotional_id, note) values ($1,$2,'forged')`, [ann, live]),
    ).rejects.toThrow(DENIED);
  });

  it("a reader cannot move a row to another person", async () => {
    await q(ben, `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1,$2,true)`, [ben, live]);
    await expect(q(ben, `update devotional_user_state set user_id = $1`, [ann])).rejects.toThrow(DENIED);
  });

  it("cannot attach state to a devotional the reader cannot see", async () => {
    await expect(
      q(ann, `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1,$2,true)`, [ann, draft]),
    ).rejects.toThrow(DENIED);
    // An editor, who can see the draft, may.
    await q(editor, `insert into devotional_user_state (user_id, devotional_id, note) values ($1,$2,'editing notes')`, [editor, draft]);
  });

  it("limits notes to 5,000 characters and rejects unknown devotionals", async () => {
    await expect(q(ann, `update devotional_user_state set note = $1 where devotional_id = $2`, ["x".repeat(5001), live])).rejects.toThrow(/check constraint/i);
    await q(ann, `update devotional_user_state set note = $1 where devotional_id = $2`, ["x".repeat(5000), live]);
    await expect(
      q(ann, `insert into devotional_user_state (user_id, devotional_id) values ($1, gen_random_uuid())`, [ann]),
    ).rejects.toThrow(DENIED);
  });

  it("visitors see nothing", async () => {
    await expect(h.asAnon(() => h.db.query(`select * from devotional_user_state`))).rejects.toThrow(DENIED);
  });

  it("is removed with the account", async () => {
    const cleo = await h.createUser("cleo@r.test");
    await q(cleo, `insert into devotional_user_state (user_id, devotional_id, note) values ($1,$2,'mine')`, [cleo, live]);
    await h.admin.query(`delete from profiles where id = $1`, [cleo]);
    await h.admin.query(`delete from auth.users where id = $1`, [cleo]);
    expect((await h.admin.query(`select 1 from devotional_user_state where user_id = $1`, [cleo])).rows).toHaveLength(0);
  });
});

describe("reminder preferences", () => {
  it("default to off, at 6:30, on weekdays", async () => {
    const [p] = await q<{ reminder_enabled: boolean; reminder_time: string; reminder_days: string }>(
      ann, `select reminder_enabled, reminder_time::text, reminder_days from profiles where id = $1`, [ann]);
    expect(p).toEqual({ reminder_enabled: false, reminder_time: "06:30:00", reminder_days: "weekdays" });
  });

  it("a person can change their own and only their own", async () => {
    await q(ann, `update profiles set reminder_enabled = true, reminder_time = '07:15', reminder_days = 'daily' where id = $1`, [ann]);
    const other = await h.as(ben, () => h.db.query(`update profiles set reminder_enabled = true where id = $1`, [ann]));
    expect(other.affectedRows).toBe(0);
    await expect(q(ann, `update profiles set reminder_days = 'whenever' where id = $1`, [ann])).rejects.toThrow(/check constraint/i);
  });
});

describe("upsert as the app sends it", () => {
  it("creates then updates one row per person and devotional, and can clear completion", async () => {
    const up = `insert into devotional_user_state (user_id, devotional_id, bookmarked)
                values ($1,$2,$3) on conflict (user_id, devotional_id) do update set bookmarked = excluded.bookmarked`;
    await q(ben, up, [ben, live, true]);
    await q(ben, up, [ben, live, false]);
    const rows = await q<{ bookmarked: boolean }>(ben, `select bookmarked from devotional_user_state where devotional_id = $1`, [live]);
    expect(rows).toEqual([{ bookmarked: false }]);
    await q(ben, `insert into devotional_user_state (user_id, devotional_id, completed_at) values ($1,$2,now())
                  on conflict (user_id, devotional_id) do update set completed_at = excluded.completed_at`, [ben, live]);
    await q(ben, `insert into devotional_user_state (user_id, devotional_id, completed_at) values ($1,$2,null)
                  on conflict (user_id, devotional_id) do update set completed_at = excluded.completed_at`, [ben, live]);
    const [r] = await q<{ completed_at: string | null }>(ben, `select completed_at from devotional_user_state where devotional_id = $1`, [live]);
    expect(r!.completed_at).toBeNull();
  });
});

describe("Scripture reference search", () => {
  it("finds a book and chapter exactly, so John 3 does not return 1 John 3", async () => {
    const r = await q<{ id: string }>(editor, `select id from search_devotionals(null,null,null,null,null,null,null,false,20,0,'John',3)`);
    expect(r.map((x) => x.id)).toEqual([live]);
    const r1 = await q<{ id: string }>(editor, `select id from search_devotionals(null,null,null,null,null,null,null,false,20,0,'1 John',3)`);
    expect(r1.map((x) => x.id)).toEqual([draft]);
    expect(await q(editor, `select id from search_devotionals(null,null,null,null,null,null,null,false,20,0,'John',4)`)).toHaveLength(0);
  });

  it("a book alone matches every chapter, and readers only see live matches", async () => {
    expect((await q(editor, `select id from search_devotionals(null,null,null,null,null,null,null,false,20,0,'John')`))).toHaveLength(1);
    expect((await q(ann, `select id from search_devotionals(null,null,null,null,null,null,null,true,20,0,'1 John')`))).toHaveLength(0);
  });
});

describe("saving, completing and notes (src/app/actions/devotional-state.ts)", () => {
  it("refuses an upsert that rewrites who and what a row belongs to, which is why the app updates, then inserts", async () => {
    const cleo = await h.createUser("cleo-state@r.test");
    // What supabase-js upsert sends: every column in the conflict update, including user_id and devotional_id.
    await expect(q(cleo, `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1, $2, true)
      on conflict (user_id, devotional_id) do update set user_id = excluded.user_id, devotional_id = excluded.devotional_id, bookmarked = excluded.bookmarked`, [cleo, live]))
      .rejects.toThrow(DENIED);
    // What the app does now: update the row (none yet), so insert it; later changes update it.
    expect(await q(cleo, `update devotional_user_state set bookmarked = true where user_id = $1 and devotional_id = $2 returning 1`, [cleo, live])).toHaveLength(0);
    await q(cleo, `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1, $2, true)`, [cleo, live]);
    expect(await q(cleo, `update devotional_user_state set completed_at = now() where user_id = $1 and devotional_id = $2 returning 1`, [cleo, live])).toHaveLength(1);
    const [row] = await q<{ bookmarked: boolean; done: boolean }>(cleo, `select bookmarked, completed_at is not null as done from devotional_user_state where devotional_id = $1`, [live]);
    expect(row).toEqual({ bookmarked: true, done: true });
  });
});
