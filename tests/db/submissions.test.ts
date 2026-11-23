import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** Devotional submissions (migration 0017): teachers send a saved devotional for review; editors accept or decline. */

let h: Harness;
let teacher: string;
let other: string;
let editor: string;
let versionId: string;

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await h.admin.query<T & object>(sql, params)).rows;
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

beforeAll(async () => {
  h = await createDatabase();
  teacher = await h.createUser("teacher@sub.test");
  other = await h.createUser("other@sub.test");
  editor = await h.createUser("editor@sub.test");
  await admin(`update profiles set display_name = 'Ms. Rivera' where id = $1`, [teacher]);
  await admin(`insert into platform_roles (user_id, role) values ($1, 'content_editor')`, [editor]);
  versionId = (await admin<{ id: string }>(
    `insert into presentation_versions (user_id, source, title, topic, topics, content, scripture)
     values ($1, 'ai_generated', 'Kindness at lunch', 'Being kind', '{Kindness}', $2::jsonb, '{"reference":"Galatians 6:9","translation_code":"web"}'::jsonb) returning id`,
    [teacher, JSON.stringify({ reflection: doc("Be kind."), prayer: doc("Amen.") })],
  ))[0]!.id;
});
afterAll(async () => h?.db.close());

describe("devotional submissions", () => {
  let first: string;

  it("let a teacher submit their own saved devotional once at a time, as a snapshot", async () => {
    first = (await q<{ submit_devotional: string }>(teacher, `select submit_devotional($1, 'For grade 4')`, [versionId]))[0]!.submit_devotional;
    await expect(q(teacher, `select submit_devotional($1)`, [versionId])).rejects.toThrow(/already waiting/);
    await expect(q(other, `select submit_devotional($1)`, [versionId])).rejects.toThrow(/could not be found/);
    const [row] = await q<{ title: string; status: string; note: string; author_name: string; scripture: { translation_code: string } }>(teacher, `select title, status, note, scripture, author_name from devotional_submissions where id = $1`, [first]);
    expect(row).toMatchObject({ author_name: "Ms. Rivera", title: "Kindness at lunch", status: "pending", note: "For grade 4", scripture: { translation_code: "web" } });
  });

  it("show submissions to their author and to editors only, and allow no direct writes", async () => {
    expect(await q(other, `select id from devotional_submissions`)).toEqual([]);
    expect(await q(editor, `select id from devotional_submissions`)).toHaveLength(1);
    await expect(q(teacher, `update devotional_submissions set status = 'accepted'`)).rejects.toThrow(/permission denied/);
    await expect(q(teacher, `select review_submission($1, 'accepted')`, [first])).rejects.toThrow(/Only editors/);
  });

  it("let editors decline with a note, after which the teacher may submit again", async () => {
    await q(editor, `select review_submission($1, 'declined', 'Please shorten the prayer.')`, [first]);
    const [row] = await q<{ status: string; editor_note: string }>(teacher, `select status, editor_note from devotional_submissions where id = $1`, [first]);
    expect(row).toEqual({ status: "declined", editor_note: "Please shorten the prayer." });
    await expect(q(editor, `select review_submission($1, 'accepted')`, [first])).rejects.toThrow();
    const again = (await q<{ submit_devotional: string }>(teacher, `select submit_devotional($1)`, [versionId]))[0]!.submit_devotional;
    await q(teacher, `select withdraw_submission($1)`, [again]);
    await expect(q(teacher, `select withdraw_submission($1)`, [again])).rejects.toThrow(/no longer/);
  });

  it("accept only with the draft devotional the editor started from it", async () => {
    const id = (await q<{ submit_devotional: string }>(teacher, `select submit_devotional($1)`, [versionId]))[0]!.submit_devotional;
    await expect(q(editor, `select review_submission($1, 'accepted')`, [id])).rejects.toThrow(/Start a draft/);
    const devotional = (await admin<{ id: string }>(`insert into devotionals (title, devotional_date) values ('Kindness at lunch', '2041-01-07') returning id`))[0]!.id;
    await q(editor, `select review_submission($1, 'accepted', '', $2)`, [id, devotional]);
    const [row] = await q<{ status: string; devotional_id: string }>(teacher, `select status, devotional_id from devotional_submissions where id = $1`, [id]);
    expect(row).toEqual({ status: "accepted", devotional_id: devotional });
  });

  it("let any signed-in user write a devotional from a blank page and submit it, but not save AI work without a plan", async () => {
    const free = await h.createUser("free@sub.test");
    const content = JSON.stringify({ reflection: doc("My own words."), prayer: doc("Amen.") });
    const [{ id }] = (await q<{ id: string }>(free, `insert into presentation_versions (source, title, content, scripture) values ('written', 'My first devotional', $1::jsonb, '{"reference":"Psalm 23","translation_code":"asv"}'::jsonb) returning id`, [content])) as [{ id: string }];
    await q(free, `update presentation_versions set title = 'Retitled' where id = $1`, [id]);
    await expect(q(free, `insert into presentation_versions (source, title, content, scripture) values ('ai_generated', 'x', $1::jsonb, '{}'::jsonb)`, [content])).rejects.toThrow(/row-level security/);
    await expect(q(free, `update presentation_versions set source = 'ai_generated' where id = $1`, [id])).rejects.toThrow(/row-level security/);
    await expect(q(free, `insert into presentation_versions (source, title, content, devotional_id) values ('written', 'x', $1::jsonb, $2)`, [content, (await admin<{ id: string }>(`select id from devotionals limit 1`))[0]!.id])).rejects.toThrow(/written_is_standalone/);
    expect((await q<{ submit_devotional: string }>(free, `select submit_devotional($1)`, [id]))[0]!.submit_devotional).toBeTruthy();
  });

  it("let a teacher delete their own saved devotional; only theirs, and any submission keeps its copy", async () => {
    expect(await q(other, `delete from presentation_versions where id = $1 returning id`, [versionId])).toEqual([]);
    expect(await q(teacher, `delete from presentation_versions where id = $1 returning id`, [versionId])).toHaveLength(1);
    const subs = await q<{ version_id: string | null; title: string }>(teacher, `select version_id, title from devotional_submissions`);
    expect(subs.length).toBeGreaterThan(0);
    expect(subs.every((s) => s.version_id === null && s.title.length > 0)).toBe(true);
  });
});
