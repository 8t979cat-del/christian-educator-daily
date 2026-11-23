import { afterAll, beforeAll, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

let h: Harness;
let editor: string;
let theme: string;
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const v = { reflection: doc("R"), discussion_question: doc("Q"), practical_application: doc("P"), prayer: doc("Amen.") };

beforeAll(async () => {
  h = await createDatabase();
  editor = await h.createUser("ed@w.test");
  await h.admin.query(`insert into platform_roles (user_id, role) values ($1, 'content_editor')`, [editor]);
  theme = (await h.admin.query<{ id: string }>(`insert into weekly_themes (title, week_start, created_by, category_slug) values ('Courage', '2046-05-07', $1, 'courage') returning id`, [editor])).rows[0]!.id;
});
afterAll(async () => h?.db.close());

/** The row "Write the week with AI" saves for each day (src/app/actions/ai.ts, writeWeekAction). */
it("saves an AI-written day as an editor's draft, with its reading levels and no author name", async () => {
  const row: Record<string, unknown> = {
    title: "T", devotional_date: "2046-05-07", theme_id: theme, daily_topic: "x", category_slug: "courage", scripture_reference: "Joshua 1:9", translation_code: "web",
    scripture_text: "9 Have I not commanded you?", reflection: v.reflection, prayer: v.prayer, discussion_question: v.discussion_question, practical_application: v.practical_application,
    levels: { k2: v, g35: v, g912: v }, audience: "teachers", access_level: "free", grade_levels: ["k2", "g35", "g68", "g912"], educational_category: "classroom", author_name: "",
  };
  const cols = Object.keys(row);
  const vals = Object.values(row).map((x) => (typeof x === "object" && x !== null && !Array.isArray(x) ? JSON.stringify(x) : x));
  const marks = cols.map((_, i) => "$" + String(i + 1)).join(",");
  await h.as(editor, async () => h.db.query(`insert into devotionals (${cols.join(",")}) values (${marks})`, vals));
});
