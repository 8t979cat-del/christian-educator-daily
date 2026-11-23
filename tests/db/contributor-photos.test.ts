import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/** Contributor photos (migration 0020): small data-URL images on credits and by author name. */

let h: Harness;
let editor: string;
let reader: string;
let live: string;
const PHOTO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U";

const q = <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) =>
  h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
const admin = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await h.admin.query<T & object>(sql, params)).rows;

beforeAll(async () => {
  h = await createDatabase();
  editor = await h.createUser("editor@photo.test");
  reader = await h.createUser("reader@photo.test");
  await admin(`insert into platform_roles (user_id, role) values ($1, 'content_editor')`, [editor]);
  live = (await admin<{ id: string }>(`insert into devotionals (title, devotional_date, author_name) values ('Live', current_date, 'Andrew Lee') returning id`))[0]!.id;
  await admin(`update devotionals set status = 'published', published_at = now() where id = $1`, [live]);
});
afterAll(async () => h?.db.close());

describe("contributor photos", () => {
  it("accept a small JPEG or WebP data URL and refuse anything else", async () => {
    const [{ id }] = (await q<{ id: string }>(editor, `insert into contributors (name, photo) values ('Andrew Lee', $1) returning id`, [PHOTO])) as [{ id: string }];
    await expect(q(editor, `update contributors set photo = 'https://example.com/me.png' where id = $1`, [id])).rejects.toThrow(/contributors_photo_check/);
    await expect(q(editor, `update contributors set photo = $2 where id = $1`, [id, "data:image/svg+xml;base64,PHN2Zz4="])).rejects.toThrow(/contributors_photo_check/);
    await expect(q(editor, `update contributors set photo = $2 where id = $1`, [id, "data:image/jpeg;base64," + "A".repeat(60000)])).rejects.toThrow(/contributors_photo_check/);
    await admin(`insert into devotional_contributors (devotional_id, contributor_id, role) values ($1, $2, 'author')`, [live, id]);
  });
  it("come back with the devotional's credits and by the Author name, for signed-in readers", async () => {
    const credits = await q<{ name: string; photo: string }>(reader, `select name, photo from devotional_credits($1)`, [live]);
    expect(credits).toEqual([{ name: "Andrew Lee", photo: PHOTO }]);
    expect((await q<{ p: string }>(reader, `select contributor_photo_for(' andrew lee ') as p`))[0]!.p).toBe(PHOTO);
    expect((await q<{ p: string | null }>(reader, `select contributor_photo_for('Nobody') as p`))[0]!.p).toBeNull();
  });
});
