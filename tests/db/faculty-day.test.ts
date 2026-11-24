import { afterAll, beforeAll, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** Migration 0023: one classroom and one faculty devotional may be live on the same day. */

let h: Harness;
let editor: string;
const today = () => new Date().toISOString().slice(0, 10);
const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function live(title: string, category: string | null) {
  const id = (await h.admin.query<{ id: string }>(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, translation_code, reflection, prayer, discussion_question,
       practical_application, audience, grade_levels, educational_category, author_id)
     values ($1, $2::date, 'topic', 'patience', 'Galatians 6:9', 'web', $3::jsonb, $3::jsonb, $3::jsonb, $3::jsonb, 'teachers', '{g35}', $4, $5) returning id`,
    [title, today(), doc("Text"), category, editor],
  )).rows[0]!.id;
  await h.admin.query(`update devotionals set status = 'published', published_at = now() where id = $1`, [id]);
  return id;
}

beforeAll(async () => {
  h = await createDatabase();
  editor = await h.createUser("ed@faculty.test");
});
afterAll(async () => h?.db.close());

it("lets a faculty devotional share the day with the classroom one, but not a second of either kind", async () => {
  await live("Classroom", "classroom");
  await live("Faculty", "faculty_community");
  await expect(live("Second classroom", null)).rejects.toThrow(/devotionals_one_live_per_day/);
  await expect(live("Second faculty", "faculty_community")).rejects.toThrow(/devotionals_one_live_per_day/);
});

it("keeps the public today's devotional on the classroom one", async () => {
  const d = await h.asAnon(async () => (await h.db.query<{ d: { title: string } | null }>(`select public_today_devotional($1::date) as d`, [today()])).rows[0]!.d);
  expect(d?.title).toBe("Classroom");
});
