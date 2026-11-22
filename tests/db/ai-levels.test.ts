import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** Shared AI reading levels (migration 0019): readable with the devotional, written by the server only. */

let h: Harness;
let teacher: string;
let live: string;
let draft: string;

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await h.admin.query<T & object>(sql, params)).rows;
const content = JSON.stringify({ reflection: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "For older students." }] }] } });

beforeAll(async () => {
  h = await createDatabase();
  teacher = await h.createUser("teacher@levels.test");
  live = (await admin<{ id: string }>(`insert into devotionals (title, devotional_date) values ('Live', current_date) returning id`))[0]!.id;
  await admin(`update devotionals set status = 'published', published_at = now() where id = $1`, [live]);
  draft = (await admin<{ id: string }>(`insert into devotionals (title, devotional_date) values ('Draft', current_date + 1) returning id`))[0]!.id;
  for (const id of [live, draft]) {
    await admin(`insert into devotional_ai_levels (devotional_id, band, content, source_hash) values ($1, 'g912', $2::jsonb, 'h1')`, [id, content]);
  }
});
afterAll(async () => h?.db.close());

describe("shared AI reading levels", () => {
  it("are readable only alongside a devotional the reader can see", async () => {
    const rows = await q<{ devotional_id: string }>(teacher, `select devotional_id from devotional_ai_levels`);
    expect(rows.map((r) => r.devotional_id)).toEqual([live]);
  });
  it("cannot be written by users", async () => {
    await expect(q(teacher, `insert into devotional_ai_levels (devotional_id, band, content, source_hash) values ($1, 'k2', $2::jsonb, 'x')`, [live, content])).rejects.toThrow(/permission denied/);
    await expect(q(teacher, `update devotional_ai_levels set source_hash = 'x'`)).rejects.toThrow(/permission denied/);
  });
  it("go when their devotional is deleted", async () => {
    await admin(`delete from devotionals where id = $1`, [draft]);
    expect(await admin(`select 1 from devotional_ai_levels where devotional_id = $1`, [draft])).toEqual([]);
  });
});
