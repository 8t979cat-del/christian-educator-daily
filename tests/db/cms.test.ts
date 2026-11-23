import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CATEGORIES, STATUSES } from "@/lib/content/options";
import { richTextToPlain, sanitizeRichDoc } from "@/lib/content/richtext";
import { parseReference } from "@/lib/content/scripture";
import { toDevotional } from "@/lib/content/types";
import { canTransition, missingFields } from "@/lib/content/workflow";
import { createDatabase, type Harness } from "./harness";

/**
 * Devotional CMS rules, tested against the real migrations with row-level
 * security and column privileges enforced.
 */

let h: Harness;
let editorA: string; // content editor
let editorB: string; // second content editor
let root: string; // platform administrator
let moderator: string;
let teacher: string;
let schoolAdmin: string;

const DENIED = /row-level security|permission denied/i;
const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
async function admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return (await h.admin.query<T & object>(sql, params)).rows;
}

let counter = 0;
/** Creates a complete draft as the given user. Each call gets its own date unless one is given. */
async function create(user: string, o: Record<string, unknown> = {}) {
  counter += 1;
  const date = (o.date as string) ?? new Date(Date.UTC(2040, 0, 1 + counter)).toISOString().slice(0, 10);
  const v = {
    title: "Waiting well",
    topic: "Patient teaching",
    category: "patience",
    ref: "Galatians 6:9",
    translation: "web",
    text: null,
    reflection: "A reflection about patience in the classroom.",
    prayer: "A short prayer for patience.",
    question: "Where do you need patience today?",
    application: "Pause for three breaths before answering.",
    audience: "teachers",
    grades: ["g35"],
    edu: "classroom",
    theme: null,
    ...o,
  };
  const rows = await q<{ id: string }>(
    user,
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference,
       translation_code, scripture_text, reflection, prayer, discussion_question, practical_application,
       audience, grade_levels, educational_category, theme_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13::text[],$14,$15)
     returning id`,
    [
      v.title, date, v.topic, v.category, v.ref, v.translation, v.text,
      doc(v.reflection), doc(v.prayer), doc(v.question), doc(v.application),
      v.audience, `{${(v.grades as string[]).join(",")}}`, v.edu, v.theme,
    ],
  );
  return rows[0]!.id;
}

const move = (user: string, id: string, to: string, at: string | null = null) =>
  q(user, `select transition_devotional($1, $2::devotional_status, $3::timestamptz) as s`, [id, to, at]);
const statusOf = async (id: string) =>
  (await admin<{ status: string }>(`select status from devotionals where id = $1`, [id]))[0]!.status;
const inFuture = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

/** Takes a draft through review and approval. */
async function approve(id: string, reviewer = editorB) {
  await move(editorA, id, "in_review");
  await move(reviewer, id, "approved");
}

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: true });
  editorA = await h.createUser("ed.a@cms.test", { first: "Edith", last: "Author" });
  editorB = await h.createUser("ed.b@cms.test", { first: "Ben", last: "Reviewer" });
  root = await h.createUser("root@cms.test", { first: "Rita", last: "Root" });
  moderator = await h.createUser("mod@cms.test");
  teacher = await h.createUser("teach@cms.test");
  schoolAdmin = await h.createUser("sa@cms.test");
  await admin(
    `insert into platform_roles (user_id, role) values
       ($1,'content_editor'), ($2,'content_editor'), ($3,'platform_admin'), ($4,'moderator')`,
    [editorA, editorB, root, moderator],
  );
  await q(schoolAdmin, `select create_school('CMS School')`);
});

afterAll(async () => {
  await h.db.close();
});

describe("reference data", () => {
  it("has the fifteen content categories", async () => {
    const rows = await q<{ name: string }>(teacher, `select name from devotional_categories order by sort_order`);
    expect(rows.map((r) => r.name)).toEqual([
      "Patience", "Compassion", "Forgiveness", "Gratitude", "Perseverance", "Purpose", "Humility",
      "Leadership", "Stewardship", "Courage", "Integrity", "Service", "Relationships",
      "Anxiety and uncertainty", "Burnout and encouragement",
    ]);
  });

  it("only public-domain translations allow text by default", async () => {
    const rows = await q<{ code: string; text_allowed: boolean }>(teacher, `select code, text_allowed from bible_translations`);
    const allowed = rows.filter((r) => r.text_allowed).map((r) => r.code).sort();
    expect(allowed).toEqual(["asv", "kjv", "web"]);
    expect(rows.find((r) => r.code === "niv")?.text_allowed).toBe(false);
  });
});

describe("who can write", () => {
  it.each([
    ["a teacher", () => teacher],
    ["a school administrator", () => schoolAdmin],
    ["a community moderator", () => moderator],
  ])("%s cannot create devotionals", async (_name, who) => {
    await expect(create(who())).rejects.toThrow(DENIED);
  });

  it("visitors cannot read or write anything", async () => {
    await expect(h.asAnon(() => h.db.query(`select * from devotionals`))).rejects.toThrow(DENIED);
  });

  it("editors cannot set status or approval columns directly", async () => {
    const id = await create(editorA);
    await expect(q(editorA, `update devotionals set status = 'published' where id = $1`, [id])).rejects.toThrow(DENIED);
    await expect(q(editorA, `update devotionals set approved_by = $2 where id = $1`, [id, editorA])).rejects.toThrow(DENIED);
    await expect(q(editorA, `update devotionals set publish_at = now() where id = $1`, [id])).rejects.toThrow(DENIED);
    await expect(
      q(editorA, `insert into devotionals (title, devotional_date, status) values ('x','2050-01-01','published')`),
    ).rejects.toThrow(DENIED);
    expect(await statusOf(id)).toBe("draft");
  });

  it("the author is recorded by the database, not supplied by the client", async () => {
    const id = await create(editorA);
    const [row] = await admin<{ author_id: string; author_name: string; created_by: string }>(
      `select author_id, author_name, created_by from devotionals where id = $1`, [id]);
    expect(row).toMatchObject({ author_id: editorA, created_by: editorA, author_name: "Edith Author" });
    await expect(q(editorA, `update devotionals set author_id = $2 where id = $1`, [id, editorB])).rejects.toThrow(DENIED);
  });

  it("non-editors cannot move content through the workflow", async () => {
    const id = await create(editorA);
    for (const who of [teacher, schoolAdmin, moderator]) {
      await expect(move(who, id, "in_review")).rejects.toThrow(/not allowed/);
    }
    expect(await statusOf(id)).toBe("draft");
  });

  it("editors can delete drafts but not published content", async () => {
    const draft = await create(editorA);
    const del = await h.as(editorA, () => h.db.query(`delete from devotionals where id = $1`, [draft]));
    expect(del.affectedRows).toBe(1);

    const live = await create(editorA);
    await approve(live);
    await move(editorB, live, "published");
    const del2 = await h.as(editorA, () => h.db.query(`delete from devotionals where id = $1`, [live]));
    expect(del2.affectedRows).toBe(0);
  });
});

describe("what readers can see", () => {
  it("shows only live content, never drafts, reviews, approved, archived or future-scheduled", async () => {
    const date = "2041-05-";
    const ids: Record<string, string> = {};
    for (const [i, name] of ["draft", "review", "approved", "scheduled", "published", "archived"].entries()) {
      ids[name] = await create(editorA, { date: `${date}${String(10 + i)}`, title: `T-${name}` });
    }
    await move(editorA, ids.review!, "in_review");
    await approve(ids.approved!);
    await approve(ids.scheduled!);
    await move(editorA, ids.scheduled!, "scheduled", inFuture(5));
    await approve(ids.published!);
    await move(editorA, ids.published!, "published");
    await approve(ids.archived!);
    await move(editorA, ids.archived!, "published");
    await move(editorA, ids.archived!, "archived");

    const seen = await q<{ title: string }>(teacher, `select title from devotionals where title like 'T-%' order by title`);
    expect(seen.map((r) => r.title)).toEqual(["T-published"]);

    const asEditor = await q<{ title: string }>(editorA, `select title from devotionals where title like 'T-%' order by title`);
    expect(asEditor).toHaveLength(6);
  });

  it("treats a scheduled devotional as live once its time has passed, even before the job runs", async () => {
    const id = await create(editorA, { title: "Due-soon" });
    await approve(id);
    await move(editorA, id, "scheduled", inFuture(3));
    expect(await q(teacher, `select 1 from devotionals where id = $1`, [id])).toHaveLength(0);

    await admin(`update devotionals set publish_at = now() - interval '1 minute' where id = $1`, [id]);
    expect(await q(teacher, `select 1 from devotionals where id = $1`, [id])).toHaveLength(1);
    expect(await statusOf(id)).toBe("scheduled");

    const flipped = await q<{ publish_due_devotionals: number }>(editorA, `select publish_due_devotionals()`);
    expect(flipped[0]!.publish_due_devotionals).toBeGreaterThanOrEqual(1);
    expect(await statusOf(id)).toBe("published");
  });

  it("readers cannot run the publish job", async () => {
    await expect(q(teacher, `select publish_due_devotionals()`)).rejects.toThrow(/not allowed/);
  });

  it("revision history and events are editor-only", async () => {
    expect(await q(teacher, `select 1 from devotional_events`).catch(() => "denied")).toSatisfy(
      (r: unknown) => r === "denied" || (Array.isArray(r) && r.length === 0),
    );
    expect(await q(teacher, `select 1 from devotional_revisions`)).toHaveLength(0);
  });
});

describe("editorial workflow", () => {
  it("lists exactly what is missing before review", async () => {
    const id = await create(editorA, { title: "Incomplete", prayer: " ", audience: null, grades: [] });
    await expect(move(editorA, id, "in_review")).rejects.toThrow(/missing required fields: .*prayer.*intended audience.*grade level/);
    expect(await statusOf(id)).toBe("draft");
  });

  it("allows saving an incomplete draft", async () => {
    const rows = await q<{ id: string }>(editorA, `insert into devotionals (devotional_date) values ('2042-02-02') returning id`);
    expect(await statusOf(rows[0]!.id)).toBe("draft");
  });

  it("rejects skipped or backward steps", async () => {
    const id = await create(editorA);
    await expect(move(editorA, id, "published")).rejects.toThrow(/cannot move/);
    await expect(move(editorA, id, "approved")).rejects.toThrow(/cannot move/);
    await expect(move(editorA, id, "scheduled", inFuture(2))).rejects.toThrow(/cannot move/);
    await expect(move(editorA, id, "archived")).rejects.toThrow(/cannot move/);
  });

  it("an author cannot approve their own devotional, but a second editor can", async () => {
    const id = await create(editorA);
    await move(editorA, id, "in_review");
    await expect(move(editorA, id, "approved")).rejects.toThrow(/own devotional/);
    await move(editorB, id, "approved");
    const [row] = await admin<{ approved_by: string; status: string }>(`select approved_by, status from devotionals where id = $1`, [id]);
    expect(row).toEqual({ approved_by: editorB, status: "approved" });
  });

  it("a platform administrator may approve their own work", async () => {
    const id = await create(root);
    await move(root, id, "in_review");
    await move(root, id, "approved");
    expect(await statusOf(id)).toBe("approved");
  });

  it("scheduling needs a future time and approval", async () => {
    const id = await create(editorA);
    await approve(id);
    await expect(move(editorA, id, "scheduled")).rejects.toThrow(/future/);
    await expect(move(editorA, id, "scheduled", new Date(Date.now() - 3600_000).toISOString())).rejects.toThrow(/future/);
    await move(editorA, id, "scheduled", inFuture(4));
    expect(await statusOf(id)).toBe("scheduled");
  });

  it("only one devotional can be scheduled or live on a given date", async () => {
    const a = await create(editorA, { date: "2043-03-03" });
    const b = await create(editorA, { date: "2043-03-03" });
    await approve(a);
    await approve(b);
    await move(editorA, a, "published");
    await expect(move(editorA, b, "published")).rejects.toThrow(/duplicate|unique/i);
    expect(await statusOf(b)).toBe("approved");
  });

  it("unscheduling returns to approved; archiving and restoring work", async () => {
    const id = await create(editorA);
    await approve(id);
    await move(editorA, id, "scheduled", inFuture(6));
    await move(editorA, id, "approved");
    const [row] = await admin<{ publish_at: string | null }>(`select publish_at from devotionals where id = $1`, [id]);
    expect(row!.publish_at).toBeNull();

    await move(editorA, id, "published");
    await move(editorA, id, "archived");
    await expect(q(editorA, `update devotionals set title = 'Changed' where id = $1`, [id])).rejects.toThrow(/read-only/);
    await move(editorA, id, "draft");
    expect(await statusOf(id)).toBe("draft");
  });

  it("editing approved or scheduled content sends it back to draft for re-approval", async () => {
    const id = await create(editorA);
    await approve(id);
    await move(editorA, id, "scheduled", inFuture(7));
    await q(editorB, `update devotionals set title = 'Fixed typo' where id = $1`, [id]);
    const [row] = await admin<{ status: string; approved_by: string | null; publish_at: string | null }>(
      `select status, approved_by, publish_at from devotionals where id = $1`, [id]);
    expect(row).toEqual({ status: "draft", approved_by: null, publish_at: null });
    const events = await q<{ note: string }>(editorA, `select note from devotional_events where devotional_id = $1 order by id desc limit 1`, [id]);
    expect(events[0]!.note).toMatch(/re-approval/);
  });

  it("published content can be corrected without leaving the published state, and the old version is kept", async () => {
    const id = await create(editorA, { title: "Original title" });
    await approve(id);
    await move(editorA, id, "published");
    await q(editorB, `update devotionals set title = 'Corrected title' where id = $1`, [id]);
    expect(await statusOf(id)).toBe("published");
    const revs = await q<{ title: string; editor_id: string }>(
      editorA, `select snapshot->>'title' as title, editor_id from devotional_revisions where devotional_id = $1`, [id]);
    expect(revs).toEqual([{ title: "Original title", editor_id: editorB }]);
  });

  it("records every transition with who made it", async () => {
    const id = await create(editorA);
    await approve(id);
    await move(editorA, id, "published");
    const ev = await q<{ from_status: string; to_status: string; actor_id: string }>(
      editorA, `select from_status, to_status, actor_id from devotional_events where devotional_id = $1 order by id`, [id]);
    expect(ev).toEqual([
      { from_status: "draft", to_status: "in_review", actor_id: editorA },
      { from_status: "in_review", to_status: "approved", actor_id: editorB },
      { from_status: "approved", to_status: "published", actor_id: editorA },
    ]);
  });
});

describe("Scripture licensing", () => {
  it("rejects scripture text for a reference-only translation", async () => {
    await expect(create(editorA, { translation: "niv", text: "For God so loved the world" })).rejects.toThrow(/licence/);
  });

  it("rejects scripture text with no translation", async () => {
    await expect(create(editorA, { translation: null, text: "Some text" })).rejects.toThrow(/licence/);
  });

  it("accepts a reference alone for a restricted translation", async () => {
    const id = await create(editorA, { translation: "niv", ref: "John 3:16" });
    await approve(id);
    expect(await statusOf(id)).toBe("approved");
  });

  it("accepts text for a public-domain translation", async () => {
    const id = await create(editorA, { translation: "kjv", text: "And let us not be weary in well doing." });
    const [row] = await admin<{ scripture_text: string }>(`select scripture_text from devotionals where id = $1`, [id]);
    expect(row!.scripture_text).toMatch(/weary/);
  });

  it("editors cannot change licence settings; administrators can", async () => {
    const edit = await h.as(editorA, () => h.db.query(`update bible_translations set text_allowed = true, license_type = 'licensed', attribution = 'x' where code = 'niv'`));
    expect(edit.affectedRows).toBe(0);
    await expect(
      q(editorA, `insert into bible_translations (code, name, license_type) values ('xyz','X','reference_only')`),
    ).rejects.toThrow(DENIED);
  });

  it("licensed text requires attribution and reference-only cannot allow text", async () => {
    await expect(
      q(root, `update bible_translations set license_type = 'licensed', text_allowed = true where code = 'esv'`),
    ).rejects.toThrow(/attribution|check constraint/i);
    await expect(
      q(root, `update bible_translations set text_allowed = true where code = 'esv'`),
    ).rejects.toThrow(/check constraint|reference_only/i);
    await q(root, `update bible_translations set license_type = 'licensed', text_allowed = true, attribution = 'ESV test attribution' where code = 'esv'`);
    const id = await create(editorA, { translation: "esv", text: "Licensed test text" });
    expect(await statusOf(id)).toBe("draft");
  });

  it("withdrawing a text permission removes stored text at once", async () => {
    const withText = await create(editorA, { translation: "asv", text: "Some ASV text" });
    await approve(withText);
    await q(root, `update bible_translations set text_allowed = false, license_type = 'licensed', attribution = null where code = 'asv'`).catch(() => undefined);
    await q(root, `update bible_translations set text_allowed = false where code = 'asv'`);
    const [row] = await admin<{ scripture_text: string | null; status: string }>(
      `select scripture_text, status from devotionals where id = $1`, [withText]);
    expect(row!.scripture_text).toBeNull();
    // Licence-driven removal does not bounce an already-approved devotional back to draft.
    expect(row!.status).toBe("approved");
    // And the text can no longer be re-entered.
    await expect(q(editorA, `update devotionals set scripture_text = 'again' where id = $1`, [withText])).rejects.toThrow(/licence/);
  });
});

describe("weekly themes", () => {
  const monday = "2045-01-02"; // a Monday
  let theme: string;

  async function newTheme(week: string, title = "Patience") {
    const rows = await q<{ id: string }>(
      editorA,
      `insert into weekly_themes (title, week_start, created_by) values ($1, $2, $3) returning id`,
      [title, week, editorA],
    );
    return rows[0]!.id;
  }
  const day = (base: string, n: number) =>
    new Date(Date.parse(base + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    theme = await newTheme(monday);
  });

  it("must start on a Monday", async () => {
    await expect(newTheme("2045-01-03")).rejects.toThrow(/check constraint|violates/i);
  });

  it("only editors can create themes; readers cannot see unpublished ones", async () => {
    await expect(
      q(teacher, `insert into weekly_themes (title, week_start, created_by) values ('x','2046-01-01',$1)`, [teacher]),
    ).rejects.toThrow(DENIED);
    expect(await q(teacher, `select 1 from weekly_themes where id = $1`, [theme])).toHaveLength(0);
  });

  it("devotionals in a theme must fall Monday to Friday", async () => {
    await expect(create(editorA, { theme, date: day(monday, 5) })).rejects.toThrow(/Monday to Friday/);
    await expect(create(editorA, { theme, date: day(monday, -1) })).rejects.toThrow(/Monday to Friday/);
  });

  it("will not publish an incomplete or unapproved week", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push(await create(editorA, { theme, date: day(monday, i) }));
    await expect(q(editorA, `select publish_weekly_theme($1, 'UTC')`, [theme])).rejects.toThrow(/exactly five.*has 4/);
    ids.push(await create(editorA, { theme, date: day(monday, 4) }));
    await expect(q(editorA, `select publish_weekly_theme($1, 'UTC')`, [theme])).rejects.toThrow(/must be approved.*0 of 5/);
    await approve(ids[0]!);
    await expect(q(editorA, `select publish_weekly_theme($1, 'UTC')`, [theme])).rejects.toThrow(/1 of 5/);
  });

  it("only one devotional per day per theme", async () => {
    await expect(create(editorA, { theme, date: monday })).rejects.toThrow(/unique|duplicate/i);
  });

  it("publishes five approved devotionals: past days go live, later days are scheduled", async () => {
    const week = "2020-02-03"; // long past
    const t = await newTheme(week, "Gratitude week");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await create(editorA, { theme: t, date: day(week, i), category: "gratitude" });
      await approve(id);
      ids.push(id);
    }
    await expect(q(teacher, `select publish_weekly_theme($1, 'UTC')`, [t])).rejects.toThrow(/not allowed/);
    const res = await q<{ publish_weekly_theme: number }>(editorA, `select publish_weekly_theme($1, 'UTC')`, [t]);
    expect(res[0]!.publish_weekly_theme).toBe(5);
    for (const id of ids) expect(await statusOf(id)).toBe("published");
    expect(await q(teacher, `select 1 from weekly_themes where id = $1`, [t])).toHaveLength(1);
    await expect(q(editorA, `delete from weekly_themes where id = $1`, [t])).resolves.toEqual([]);
    expect(await admin(`select 1 from weekly_themes where id = $1`, [t])).toHaveLength(1);
  });

  it("schedules future days at local midnight in the chosen time zone, and can unschedule", async () => {
    const week = "2046-03-05"; // Monday in the future
    const t = await newTheme(week, "Future week");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const id = await create(editorA, { theme: t, date: day(week, i) });
      await approve(id);
      ids.push(id);
    }
    await q(editorA, `select publish_weekly_theme($1, 'America/Los_Angeles')`, [t]);
    const rows = await admin<{ status: string; publish_at: string; devotional_date: string }>(
      `select status, to_char(publish_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as publish_at, devotional_date::text
       from devotionals where theme_id = $1 order by devotional_date`, [t]);
    expect(rows.map((r) => r.status)).toEqual(Array(5).fill("scheduled"));
    expect(rows.map((r) => r.publish_at)).toEqual(rows.map((r) => `${r.devotional_date} 00:00`));

    const n = await q<{ unschedule_weekly_theme: number }>(editorA, `select unschedule_weekly_theme($1)`, [t]);
    expect(n[0]!.unschedule_weekly_theme).toBe(5);
    for (const id of ids) expect(await statusOf(id)).toBe("approved");
    expect(await q(teacher, `select 1 from weekly_themes where id = $1`, [t])).toHaveLength(0);
  });

  it("can release all five days together at midnight on the Sunday before the week (0022)", async () => {
    const week = "2046-04-02"; // Monday in the future
    const t = await newTheme(week, "Released on Sunday");
    for (let i = 0; i < 5; i++) await approve(await create(editorA, { theme: t, date: day(week, i) }));
    await expect(q(teacher, `select release_weekly_theme_sunday($1, 'America/Los_Angeles')`, [t])).rejects.toThrow(/not allowed/);
    const n = await q<{ release_weekly_theme_sunday: number }>(editorA, `select release_weekly_theme_sunday($1, 'America/Los_Angeles')`, [t]);
    expect(n[0]!.release_weekly_theme_sunday).toBe(5);
    const rows = await admin<{ status: string; publish_at: string }>(
      `select status, to_char(publish_at at time zone 'America/Los_Angeles', 'YYYY-MM-DD HH24:MI') as publish_at
       from devotionals where theme_id = $1 order by devotional_date`, [t]);
    expect(rows).toEqual(Array(5).fill({ status: "scheduled", publish_at: "2046-04-01 00:00" }));
    await q(editorA, `select unschedule_weekly_theme($1)`, [t]);
  });

  it("releases a week whose Sunday has already begun straight away", async () => {
    const week = "2020-03-02";
    const t = await newTheme(week, "Past Sunday release");
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) { const id = await create(editorA, { theme: t, date: day(week, i) }); await approve(id); ids.push(id); }
    await q(editorA, `select release_weekly_theme_sunday($1, 'UTC')`, [t]);
    for (const id of ids) expect(await statusOf(id)).toBe("published");
  });
});

describe("rich text and search", () => {
  it("extracts plain text from rich-text documents", async () => {
    const rows = await admin<{ t: string }>(
      `select rich_text_plain($1::jsonb) as t`,
      [JSON.stringify({ type: "doc", content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello" }, { type: "text", text: "world", marks: [{ type: "bold" }] }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }] }] },
      ] })],
    );
    expect(rows[0]!.t).toBe("Hello world item");
    expect((await admin<{ t: string }>(`select rich_text_plain('{"type":"doc","content":[]}') as t`))[0]!.t).toBe("");
  });

  async function live(over: Record<string, unknown>) {
    const id = await create(editorA, over);
    await approve(id);
    await move(editorA, id, "published");
    return id;
  }
  let lantern: string;
  let hidden: string;
  beforeAll(async () => {
    lantern = await live({ date: "2018-04-02", title: "Lantern of mercy", category: "compassion", reflection: "Mercy is a lantern for tired teachers.", grades: ["g68", "g912"], ref: "Luke 6:36" });
    await live({ date: "2018-04-03", title: "Quiet courage", category: "courage", reflection: "Courage often looks like showing up.", grades: ["k2"], ref: "Joshua 1:9" });
    hidden = await create(editorA, { date: "2018-04-04", title: "Lantern draft secret", reflection: "lantern lantern lantern" });
  });

  const search = (user: string, args: Record<string, unknown> = {}) => {
    const a = { query: null, category: null, grade: null, theme: null, from: null, through: null, status: null, live: true, limit: 20, offset: 0, ...args };
    return q<{ id: string; title: string; total: string; excerpt: string }>(
      user,
      `select * from search_devotionals($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [a.query, a.category, a.grade, a.theme, a.from, a.through, a.status, a.live, a.limit, a.offset],
    );
  };

  it("finds by words in the body, title or Scripture reference", async () => {
    expect((await search(teacher, { query: "lantern" })).map((r) => r.id)).toEqual([lantern]);
    expect((await search(teacher, { query: "Joshua" })).map((r) => r.title)).toEqual(["Quiet courage"]);
    expect((await search(teacher, { query: "tired teacher" })).map((r) => r.id)).toEqual([lantern]); // stemming
    expect(await search(teacher, { query: "zzzznothing" })).toHaveLength(0);
  });

  it("never returns unpublished content to readers, however they ask", async () => {
    const r = await search(teacher, { query: "lantern", live: false, status: "draft" });
    expect(r).toHaveLength(0);
    expect(r.map((x) => x.id)).not.toContain(hidden);
  });

  it("editors can search drafts when they ask for them", async () => {
    const r = await search(editorA, { query: "secret", live: false });
    expect(r.map((x) => x.id)).toEqual([hidden]);
    expect((await search(editorA, { query: "secret", live: true }))).toHaveLength(0);
  });

  it("filters by category, grade band and date range, and reports totals", async () => {
    expect((await search(teacher, { category: "compassion", from: "2018-01-01", through: "2018-12-31" })).map((r) => r.id)).toEqual([lantern]);
    expect((await search(teacher, { grade: "g912", from: "2018-01-01", through: "2018-12-31" })).map((r) => r.id)).toEqual([lantern]);
    const all = await search(teacher, { from: "2018-01-01", through: "2018-12-31" });
    expect(all).toHaveLength(2);
    expect(all[0]!.title).toBe("Quiet courage"); // newest first
    expect(Number(all[0]!.total)).toBe(2);
    const page = await search(teacher, { from: "2018-01-01", through: "2018-12-31", limit: 1, offset: 1 });
    expect(page.map((r) => r.title)).toEqual(["Lantern of mercy"]);
    expect(Number(page[0]!.total)).toBe(2);
  });

  it("returns a short excerpt of the reflection", async () => {
    const [r] = await search(teacher, { query: "lantern" });
    expect(r!.excerpt).toMatch(/^Mercy is a lantern/);
  });

  it("handles awkward search input safely", async () => {
    for (const query of ["'; drop table devotionals; --", "%", "\\", "a & | ! ( ", '"unterminated']) {
      await expect(search(teacher, { query })).resolves.toBeDefined();
    }
    expect((await admin(`select count(*) from devotionals`))[0]).toBeDefined();
  });
});

describe("editor name lookup", () => {
  it("gives editors names for staff and authors only, and nobody else", async () => {
    const outsider = await h.createUser("outsider@cms.test", { first: "Olive", last: "Outsider" });
    const rows = await q<{ id: string; display_name: string }>(
      editorA, `select * from staff_display_names($1::uuid[])`, [`{${editorA},${editorB},${outsider}}`]);
    expect(rows.map((r) => r.display_name).sort()).toEqual(["Ben Reviewer", "Edith Author"]);
    await expect(q(teacher, `select * from staff_display_names($1::uuid[])`, [`{${editorA}}`])).rejects.toThrow(/not allowed/);
  });
});

describe("application and database stay in step", () => {
  it("the workflow table matches the database for every pair of statuses", async () => {
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const [row] = await admin<{ ok: boolean }>(
          `select devotional_transition_allowed($1::devotional_status, $2::devotional_status) as ok`, [from, to]);
        expect(canTransition(from, to), `${from} → ${to}`).toBe(row!.ok);
      }
    }
  });

  it("the category list matches the database", async () => {
    const rows = await admin<{ slug: string; name: string }>(`select slug, name from devotional_categories order by sort_order`);
    expect(rows).toEqual(CATEGORIES.map((c) => ({ slug: c.slug, name: c.name })));
  });

  it("the missing-field check matches the database", async () => {
    const id = await create(editorA, { title: "", topic: "", category: null, prayer: " ", audience: null, grades: [] });
    const [row] = await admin<{ m: string[] }>(`select devotional_missing_fields(d) as m from devotionals d where id = $1`, [id]);
    const rec = toDevotional((await admin(`select * from devotionals where id = $1`, [id]))[0] as Record<string, unknown>);
    expect(missingFields(rec)).toEqual(row!.m);
    expect(row!.m.length).toBeGreaterThan(4);
  });
});

describe("sample content (supabase/seed/001_patience_week.sql)", () => {
  let themeId: string;
  beforeAll(async () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "seed", "001_patience_week.sql"), "utf8");
    await h.admin.exec(sql);
    await h.admin.exec(sql); // idempotent
    themeId = (await admin<{ id: string }>(`select id from weekly_themes where week_start = '2026-11-16'`))[0]!.id;
  });

  it("loads one theme and five unreviewed drafts, Monday to Friday, with nothing published", async () => {
    const rows = await admin<{ status: string; d: string; dow: number }>(
      `select status, devotional_date::text as d, extract(isodow from devotional_date)::int as dow
       from devotionals where theme_id = $1 order by devotional_date`, [themeId]);
    expect(rows.map((r) => r.dow)).toEqual([1, 2, 3, 4, 5]);
    expect(rows.every((r) => r.status === "draft")).toBe(true);
    expect((await admin<{ published_at: string | null }>(`select published_at from weekly_themes where id = $1`, [themeId]))[0]!.published_at).toBeNull();
  });

  it("is complete enough to enter review, and its rich text is valid", async () => {
    const rows = await admin<Record<string, unknown>>(`select * from devotionals where theme_id = $1`, [themeId]);
    for (const row of rows) {
      const rec = toDevotional(row);
      expect(missingFields(rec), rec.title).toEqual([]);
      for (const key of ["reflection", "prayer", "discussion_question", "practical_application"] as const) {
        expect(sanitizeRichDoc(row[key]), `${rec.title}: ${key}`).not.toBeNull();
        expect(richTextToPlain(rec[key]).length).toBeGreaterThan(40);
      }
      expect(parseReference(rec.scripture_reference).ok, rec.scripture_reference).toBe(true);
    }
  });

  it("stores Scripture text only for public-domain translations and none for the NIV reference", async () => {
    const rows = await admin<{ translation_code: string; scripture_text: string | null }>(
      `select translation_code, scripture_text from devotionals where theme_id = $1 order by devotional_date`, [themeId]);
    expect(rows.map((r) => r.translation_code)).toEqual(["kjv", "kjv", "kjv", "kjv", "niv"]);
    expect(rows.slice(0, 4).every((r) => (r.scripture_text ?? "").length > 20)).toBe(true);
    expect(rows[4]!.scripture_text).toBeNull();
  });

  it("can be searched by editors and cannot be read by readers until published", async () => {
    const found = await q<{ title: string }>(editorA, `select title from search_devotionals('harvest', null, null, null, null, null, null, false)`);
    expect(found.map((r) => r.title)).toEqual(["Waiting for the harvest", "Not weary in well doing"]); // title match ranks first
    expect(await q(teacher, `select 1 from devotionals where theme_id = $1`, [themeId])).toHaveLength(0);
  });

  it("goes live as a week once reviewed: approve all five, then publish the theme", async () => {
    const ids = (await admin<{ id: string }>(`select id from devotionals where theme_id = $1 order by devotional_date`, [themeId])).map((r) => r.id);
    for (const id of ids) await approve(id);
    const n = await q<{ publish_weekly_theme: number }>(editorA, `select publish_weekly_theme($1, 'America/New_York')`, [themeId]);
    expect(n[0]!.publish_weekly_theme).toBe(5);
    for (const id of ids) expect(["scheduled", "published"]).toContain(await statusOf(id));
  });
});

describe("reading levels", () => {
  const level = (text: string) => JSON.stringify({ k2: { reflection: JSON.parse(doc(text)), prayer: JSON.parse(doc("Thank you, God.")) } });

  it("an editor saves a version for an age band, and it is searchable", async () => {
    const id = await create(editorA);
    await q(editorA, `update devotionals set levels = $2::jsonb where id = $1`, [id, level("Being patient means waiting kindly for a friend.")]);
    const [row] = await admin<{ levels: Record<string, unknown> }>(`select levels from devotionals where id = $1`, [id]);
    expect(Object.keys(row!.levels)).toEqual(["k2"]);
    const hits = await admin(`select id from devotionals where id = $1 and search @@ plainto_tsquery('english', 'friend kindly')`, [id]);
    expect(hits).toHaveLength(1);
    expect(toDevotional({ ...(await admin(`select * from devotionals where id = $1`, [id]))[0]! }).levels.k2?.reflection).toBeTruthy();
  });

  it("refuses unknown bands, unknown fields and text that is not a rich-text document", async () => {
    const id = await create(editorA);
    for (const bad of [{ g13: {} }, { k2: { sermon: JSON.parse(doc("x")) } }, { k2: { reflection: "plain string" } }, { k2: { reflection: { type: "nope" } } }, []]) {
      await expect(q(editorA, `update devotionals set levels = $2::jsonb where id = $1`, [id, JSON.stringify(bad)]), JSON.stringify(bad)).rejects.toThrow(/levels_valid|check constraint/i);
    }
  });

  it("changing a band's version after approval sends it back for re-approval and keeps a revision", async () => {
    const id = await create(editorA);
    await approve(id);
    await q(editorA, `update devotionals set levels = $2::jsonb where id = $1`, [id, level("A new K-2 reflection.")]);
    expect(await statusOf(id)).toBe("draft");
    expect(await admin(`select 1 from devotional_revisions where devotional_id = $1`, [id])).toHaveLength(1);
  });

  it("readers cannot write levels", async () => {
    const id = await create(editorA);
    await expect(q(teacher, `update devotionals set levels = '{}' where id = $1 returning id`, [id]).then((r) => { if (r.length === 0) throw new Error("permission denied (no rows)"); })).rejects.toThrow(DENIED);
  });
});

describe("today's devotional for signed-out visitors", () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const anonToday = async () =>
    h.asAnon(async () => (await h.db.query<{ d: Record<string, unknown> | null }>(`select public_today_devotional($1::date) as d`, [today()])).rows[0]!.d);

  it("shows the live free devotional's standard text, never its reading-level versions or anything else", async () => {
    // Other tests' recent devotionals would compete for "today": make them Plus content, which the public function never returns.
    await admin(`update devotionals set access_level = 'plus' where devotional_date > current_date - 7 and devotional_date <= current_date`);
    const id = await create(editorA, { date: today(), translation: "kjv", text: "In the beginning God created the heaven and the earth." });
    await q(editorA, `update devotionals set levels = $2::jsonb where id = $1`, [id, JSON.stringify({ k2: { reflection: JSON.parse(doc("Only for signed-in teachers.")) } })]);
    expect(await anonToday()).toBeNull(); // still a draft
    await approve(id);
    await move(editorB, id, "published");
    const d = await anonToday();
    expect(d).toMatchObject({ id, title: "Waiting well", scripture_reference: "Galatians 6:9" });
    expect(d!.scripture_text).toMatch(/In the beginning/);
    expect(JSON.stringify(d)).not.toMatch(/Only for signed-in teachers/);
    expect(Object.keys(d!)).not.toContain("levels");
    // Signed-out visitors still cannot read the table itself.
    await expect(h.asAnon(async () => (await h.db.query(`select id from devotionals`)).rows)).rejects.toThrow(DENIED);
  });

  it("hides Scripture text the translation's licence does not allow, and Plus devotionals entirely", async () => {
    // Other tests' recent devotionals would compete for "today": make them Plus content, which the public function never returns.
    await admin(`update devotionals set access_level = 'plus' where devotional_date > current_date - 7 and devotional_date <= current_date`);
    const id = await create(editorA, { date: today(), translation: "nkjv", text: null });
    await approve(id);
    await move(editorB, id, "published");
    expect((await anonToday())!.scripture_text).toBeNull();
    await admin(`update devotionals set access_level = 'plus' where id = $1`, [id]);
    expect(await anonToday()).toBeNull();
  });
});
