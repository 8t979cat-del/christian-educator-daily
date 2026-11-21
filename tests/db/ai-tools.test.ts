import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** AI teaching tools (migration 0012): plan gate, daily limit, private saved versions. */

let h: Harness;
let free: string;
let plus: string;
let other: string;
let devotionalId: string;
let editor: string;

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await h.admin.query<T & object>(sql, params)).rows;
const doc = (t: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
const content = JSON.stringify({ reflection: doc("A teacher's own reflection."), prayer: doc("Amen.") });

beforeAll(async () => {
  h = await createDatabase();
  free = await h.createUser("free@ai.test");
  plus = await h.createUser("plus@ai.test");
  other = await h.createUser("other@ai.test");
  for (const u of [plus, other]) {
    await admin(`insert into entitlement_grants (user_id, plan_key, reason) values ($1, 'plus', 'test')`, [u]);
  }
  editor = await h.createUser("editor@ai.test");
  await admin(`insert into platform_roles (user_id, role) values ($1, 'content_editor')`, [editor]);
  devotionalId = (await admin<{ id: string }>(`insert into devotionals (title, devotional_date) values ('Test', '2040-03-05') returning id`))[0]!.id;
});
afterAll(async () => h?.db.close());

describe("AI tools", () => {
  it("are off on the free plan and on for Plus, with a daily limit", async () => {
    await expect(q(free, `select ai_consume()`)).rejects.toThrow(/Educator Plus/);
    expect(await q(plus, `select * from ai_remaining()`)).toEqual([{ remaining: 10, daily_limit: 10 }]);
    const [{ ai_consume: left }] = (await q<{ ai_consume: number }>(plus, `select ai_consume()`)) as [{ ai_consume: number }];
    expect(left).toBe(9);
    expect(await q(plus, `select * from ai_remaining()`)).toEqual([{ remaining: 9, daily_limit: 10 }]);
    expect(await q(free, `select * from ai_remaining()`)).toEqual([{ remaining: 0, daily_limit: 0 }]);
    await admin(`update ai_usage set uses = 10 where user_id = $1`, [plus]);
    await expect(q(plus, `select ai_consume()`)).rejects.toThrow(/today's 10 AI requests/);
    expect(await q(plus, `select * from ai_remaining()`)).toEqual([{ remaining: 0, daily_limit: 10 }]);
    await expect(h.asAnon(async () => (await h.db.query(`select * from ai_remaining()`)).rows)).rejects.toThrow();
    await expect(h.asAnon(async () => (await h.db.query(`select ai_consume()`)).rows)).rejects.toThrow();
  });

  it("let Plus teachers save one private version per devotional and reading level", async () => {
    await q(plus, `insert into presentation_versions (devotional_id, band, source, content) values ($1, 'k2', 'edited', $2::jsonb)`, [devotionalId, content]);
    await expect(q(plus, `insert into presentation_versions (devotional_id, band, source, content) values ($1, 'k2', 'ai_leveled', $2::jsonb)`, [devotionalId, content])).rejects.toThrow(/duplicate|unique/i);
    await q(plus, `insert into presentation_versions (devotional_id, band, source, content) values ($1, null, 'edited', $2::jsonb)`, [devotionalId, content]);
    expect(await q(plus, `select id from presentation_versions`)).toHaveLength(2);
    expect(await q(other, `select id from presentation_versions`)).toHaveLength(0);
    await expect(q(free, `insert into presentation_versions (devotional_id, band, source, content) values ($1, 'g35', 'edited', $2::jsonb)`, [devotionalId, content])).rejects.toThrow(/row-level security/);
  });

  it("refuse malformed text, and a generated devotional without a Scripture reference", async () => {
    await expect(q(plus, `insert into presentation_versions (devotional_id, band, source, content) values ($1, 'g68', 'edited', '{"sermon": "x"}'::jsonb)`, [devotionalId])).rejects.toThrow(/check constraint/);
    await expect(q(plus, `insert into presentation_versions (source, content) values ('ai_generated', $1::jsonb)`, [content])).rejects.toThrow(/generated_has_scripture/);
    await q(plus, `insert into presentation_versions (source, title, content, scripture, topics) values ('ai_generated', 'New day', $1::jsonb, '{"reference": "Psalm 23", "translation_code": "web"}'::jsonb, '{patience,friendship}')`, [content]);
  });

  it("give content editors up to 50 AI drafts a day, whatever their own plan", async () => {
    expect(await q(editor, `select * from ai_remaining()`)).toEqual([{ remaining: 50, daily_limit: 50 }]);
    const [{ ai_consume: left }] = (await q<{ ai_consume: number }>(editor, `select ai_consume()`)) as [{ ai_consume: number }];
    expect(left).toBe(49);
    await expect(q(free, `select ai_consume()`)).rejects.toThrow(/Educator Plus/);
    await expect(q(editor, `select ai_daily_limit($1)`, [editor])).rejects.toThrow(/permission denied/);
  });

  it("give platform administrators unlimited AI requests", async () => {
    const root = await h.createUser("root@ai.test");
    await admin(`insert into platform_roles (user_id, role) values ($1, 'platform_admin')`, [root]);
    await admin(`insert into ai_usage (user_id, day, uses) values ($1, (now() at time zone 'utc')::date, 5000)`, [root]);
    const [{ ai_consume: left }] = (await q<{ ai_consume: number }>(root, `select ai_consume()`)) as [{ ai_consume: number }];
    expect(left).toBeGreaterThan(1_000_000_000);
    expect((await q<{ daily_limit: number }>(root, `select daily_limit from ai_remaining()`))[0]!.daily_limit).toBe(2147483647);
  });
});

