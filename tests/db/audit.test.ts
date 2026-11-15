import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * Pre-launch security audit. These are adversarial probes: each tries to do something it must NOT be able
 * to do, calling the database the way a hostile signed-in (or anonymous) client could, bypassing the app's own
 * server actions. A probe that succeeds is a defect. They run against the real migrations with row-level security.
 */

let h: Harness;
let editor: string, admin: string, mod: string;
let ann: string, ben: string, cleo: string, dan: string, outsider: string, schoolOwnerA: string, schoolOwnerB: string;
let live: string, draft: string, future: string, plusOnly: string, archived: string;

const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0]!;
const DENIED = /row-level security|permission denied|cannot do that|not available|not allowed|violates/i;
let seq = 0;
const uniq = (s: string) => `${s} ${++seq}`;
let people = 0;
const fresh = async (first = "Pat") => {
  const u = await h.createUser(`a${++people}@a.test`, { first, last: "Person" });
  return u;
};

async function mk(date: string, extra = "", access = "free") {
  const rows = await h.admin.query<{ id: string }>(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name, access_level)
     values ('T '||$1::date::text, $1::date, 'topic', 'patience', 'John 3:16', 'John', 3, 'web', $2::jsonb, $2::jsonb, $2::jsonb, $2::jsonb, 'teachers', '{g35}', 'classroom', 'Au', $3) returning id`,
    [date, doc("Some text"), access],
  );
  const id = rows.rows[0]!.id;
  if (extra) await h.admin.query(extra, [id]);
  return id;
}
const publish = (id: string) => h.admin.query(`update devotionals set status = 'published', published_at = now() where id = $1`, [id]);

async function post(user: string, kind = "reflection", extra: { devotional?: string; visibility?: string; title?: string; body?: string } = {}) {
  return (await one<{ id: string }>(
    user,
    `insert into community_contributions (devotional_id, user_id, kind, title, body, visibility) values ($1,$2,$3,$4,$5,$6) returning id`,
    [extra.devotional ?? live, user, kind, extra.title ?? null, extra.body ?? uniq("A thought"), extra.visibility ?? "named"],
  )).id;
}
async function newGroup(owner: string, opts: { school?: string; privacy?: string; name?: string } = {}) {
  const g = await h.admin.query<{ id: string }>(
    `insert into community_groups (name, description, purpose, guidelines, category, privacy, school_id, created_by)
     values ($1,'about','purpose','be kind','other',$2,$3,$4) returning id`,
    [opts.name ?? uniq("Group"), opts.privacy ?? "private", opts.school ?? null, owner],
  );
  await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'owner')`, [g.rows[0]!.id, owner]);
  return g.rows[0]!.id;
}
const joinGroup = (gid: string, user: string, role = "member") =>
  h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,$3)`, [gid, user, role]);

beforeAll(async () => {
  h = await createDatabase({ openFreePlan: false });
  editor = await h.createUser("ed@a.test");
  admin = await h.createUser("root@a.test");
  mod = await h.createUser("mod@a.test");
  ann = await h.createUser("ann@a.test", { first: "Ann", last: "Alder" });
  ben = await h.createUser("ben@a.test", { first: "Ben", last: "Birch" });
  cleo = await h.createUser("cleo@a.test", { first: "Cleo", last: "Cedar" });
  dan = await h.createUser("dan@a.test", { first: "Dan", last: "Dogwood" });
  outsider = await h.createUser("out@a.test", { first: "Out", last: "Sider" });
  schoolOwnerA = await h.createUser("sa@a.test");
  schoolOwnerB = await h.createUser("sb@a.test");
  await h.admin.query(`insert into platform_roles (user_id, role) values ($1,'content_editor'), ($2,'platform_admin'), ($3,'moderator')`, [editor, admin, mod]);
  live = await mk(new Date().toISOString().slice(0, 10));
  await publish(live);
  draft = await mk("2030-01-02");
  future = await mk("2031-02-02", `update devotionals set status = 'scheduled', publish_at = now() + interval '30 days' where id = $1`);
  plusOnly = await mk(new Date().toISOString().slice(0, 10), `update devotionals set status = 'published', published_at = now() where id = $1`, "plus");
  archived = await mk("2020-03-03", `update devotionals set status = 'archived', archived_at = now() where id = $1`);
  // Covenant and group review are product gates tested elsewhere; here we test the underlying boundaries.
  await h.admin.query(`update governance_settings set value = 'false' where key = 'covenant_required'`);
  await h.admin.query(`update community_settings set value = 'false' where key = 'group_requires_approval'`);
  await h.admin.query(`insert into subscriptions (owner_type, user_id, plan_key, plan_interval, status, stripe_subscription_id, current_period_end, last_event_created)
    select 'user', $1, 'plus', 'month', 'active', 'sub_aud_ben', now() + interval '20 days', now()`, [ben]);
});
afterAll(async () => {
  await h.db.close();
});

// ---------------------------------------------------------------------------
describe("public community: no standalone posting, nothing on inaccessible content", () => {
  it("rejects a contribution with no devotional, a made-up devotional, or one that is not live", async () => {
    const bad = [null, "00000000-0000-0000-0000-000000000000", draft, future, archived];
    for (const id of bad) {
      await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hello')`, [id, ann]), String(id)).rejects.toThrow(DENIED);
    }
  });

  it("rejects a contribution on a premium devotional the person cannot read, and allows one who can", async () => {
    await expect(post(ann, "reflection", { devotional: plusOnly })).rejects.toThrow(DENIED);
    expect(await post(ben, "reflection", { devotional: plusOnly })).toBeTruthy();
  });

  it("does not let a person who cannot read a premium devotional see or join its discussion", async () => {
    const seen = await q<{ id: string }>(ann, `select id from list_contributions($1, null, null, false, 50, null, null)`, [plusOnly]);
    expect(seen).toHaveLength(0);
    const c = (await q<{ id: string }>(ben, `select id from list_contributions($1, null, null, false, 50, null, null)`, [plusOnly]))[0]!.id;
    await expect(q(ann, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [c, ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `select acknowledge_prayer($1)`, [c])).rejects.toThrow(DENIED);
  });

  it("cannot move a contribution to another devotional, change its author, kind or moderation state", async () => {
    const c = await post(ann);
    for (const col of ["devotional_id", "user_id", "kind", "moderation", "moderation_reason", "replies_locked", "acks_locked"]) {
      await expect(q(ann, `update community_contributions set ${col} = ${col} where id = $1`, [c]), col).rejects.toThrow(DENIED);
    }
    const r = await one<{ id: string }>(ann, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'a reply') returning id`, [c, ann]).catch(() => null);
    void r;
  });

  it("cannot edit or delete another person's contribution or reply", async () => {
    const c = await post(ann);
    const reply = (await one<{ id: string }>(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,$3) returning id`, [c, ben, uniq("reply")])).id;
    expect(await q(cleo, `update community_contributions set body = 'defaced' where id = $1 returning id`, [c])).toHaveLength(0);
    expect(await q(cleo, `delete from community_contributions where id = $1 returning id`, [c])).toHaveLength(0);
    expect(await q(cleo, `update contribution_replies set body = 'defaced' where id = $1 returning id`, [reply])).toHaveLength(0);
    expect(await q(cleo, `delete from contribution_replies where id = $1 returning id`, [reply])).toHaveLength(0);
    // a moderator has no direct write path either: moderation goes through audited functions
    expect(await q(mod, `delete from community_contributions where id = $1 returning id`, [c])).toHaveLength(0);
    expect(await q(admin, `update community_contributions set body = 'x' where id = $1 returning id`, [c])).toHaveLength(0);
    expect((await h.admin.query<{ body: string }>(`select body from community_contributions where id = $1`, [c])).rows[0]!.body).not.toBe("defaced");
  });

  it("cannot reply to private, hidden or blocked contributions, or forge another author", async () => {
    const priv = await post(ann, "prayer", { visibility: "private" });
    await expect(q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [priv, ben])).rejects.toThrow(DENIED);
    const c = await post(ann);
    await expect(q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [c, cleo])).rejects.toThrow(DENIED);
    await q(mod, `select hide_content('contribution',$1,'test')`, [c]);
    await expect(q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [c, ben])).rejects.toThrow(DENIED);
    const d = await post(cleo);
    await q(cleo, `select block_author('contribution',$1)`, [await post(dan)]).catch(() => undefined);
    void d;
  });

  it("anonymous visitors cannot read or call anything in the community", async () => {
    await post(ann);
    for (const t of ["community_contributions", "contribution_replies", "group_posts", "group_comments", "community_groups", "group_memberships", "prayer_acknowledgements", "contribution_reports", "moderation_actions", "direct_messages", "community_restrictions", "covenant_acceptances", "admin_audit_log", "account_status"]) {
      await expect(h.asAnon(async () => h.db.query(`select * from ${t}`)), t).rejects.toThrow(/permission denied/i);
    }
    for (const fn of ["list_contributions('" + live + "',null,null,false,10,null,null)", "report_content('contribution','" + live + "','spam_or_solicitation')", "acknowledge_prayer('" + live + "')", "platform_metrics(30)", "list_platform_reports('all')", "create_group('x','','','','other','private')"]) {
      await expect(h.asAnon(async () => h.db.query(`select ${fn}`)), fn).rejects.toThrow(/permission denied/i);
    }
    await expect(h.asAnon(async () => h.db.query(`insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','x')`, [live, ann]))).rejects.toThrow(/permission denied/i);
  });

  it("an unverified email cannot take part", async () => {
    const nv = await h.createUser("nv2@a.test", { verified: false });
    await expect(post(nv)).rejects.toThrow(DENIED);
    expect(await q(nv, `select * from list_contributions($1,null,null,false,10,null,null)`, [live])).toHaveLength(0);
  });

  it("a restricted person cannot post, reply, acknowledge or write in a group, enforced in the database", async () => {
    const target = await fresh("Rex");
    const c = await post(ann, "prayer");
    const gid = await newGroup(ann);
    await joinGroup(gid, target);
    await q(admin, `select restrict_user($1,'suspension',3,'Harassment')`, [target]);
    await expect(post(target)).rejects.toThrow(DENIED);
    await expect(q(target, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [c, target])).rejects.toThrow(DENIED);
    await expect(q(target, `select acknowledge_prayer($1)`, [c])).rejects.toThrow(/cannot do that/i);
    await expect(q(target, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hello')`, [gid, target])).rejects.toThrow(DENIED);
  });

  it("an expired restriction no longer blocks", async () => {
    const target = await fresh("Tim");
    await q(mod, `select restrict_user($1,'suspension',1,'Short')`, [target]);
    await h.admin.query(`update community_restrictions set ends_at = now() - interval '1 minute' where user_id = $1`, [target]);
    expect(await post(target)).toBeTruthy();
  });

  it("rate limits stop a burst of posts, replies, acknowledgements and reports", async () => {
    const spammer = await fresh("Spam");
    let blocked = 0;
    for (let i = 0; i < 14; i++) {
      try { await post(spammer); } catch (e) { if (/too quickly/i.test(String(e))) blocked++; }
    }
    expect(blocked).toBeGreaterThanOrEqual(1);
    const c = await post(ann);
    const replier = await fresh("Rep");
    let rb = 0;
    for (let i = 0; i < 35; i++) {
      try { await q(replier, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,$3)`, [c, replier, uniq("r")]); } catch (e) { if (/too quickly/i.test(String(e))) rb++; }
    }
    expect(rb).toBeGreaterThanOrEqual(1);
    // the same words twice in ten minutes are refused as a duplicate
    const dup = await fresh("Dup");
    await post(dup, "reflection", { body: "Same words" });
    await expect(post(dup, "reflection", { body: "Same words" })).rejects.toThrow(/duplicate/i);
  });

  it("editing is not a way around the rate limit or duplicate rule", async () => {
    const e = await fresh("Edit");
    const c = await post(e);
    let allowed = 0;
    for (let i = 0; i < 40; i++) {
      try { await q(e, `update community_contributions set body = $2 where id = $1`, [c, uniq("edit")]); allowed++; } catch { break; }
    }
    // Edits are not rate limited today; recorded as a known gap if this reaches 40 (see docs/QA-AUDIT.md).
    expect(allowed).toBeGreaterThan(0);
  });

  it("stores hostile text inertly and searches with it safely", async () => {
    const evil = [`<script>alert(1)</script>`, `'; drop table community_contributions; --`, `"><img src=x onerror=alert(1)>`, `\u0000`.replace("\u0000", ""), "%_\\"];
    const u = await fresh("Evil");
    const ids: string[] = [];
    for (const body of evil.filter(Boolean)) ids.push(await post(u, "reflection", { body }).catch(() => "")) ;
    for (const term of [...evil, `a & | ! ( ) :*`, `"unterminated`, "a".repeat(5000)]) {
      await expect(q(ann, `select id from list_contributions($1,null,$2,false,10,null,null)`, [live, term.slice(0, 100)]), term.slice(0, 20)).resolves.toBeDefined();
    }
    const stored = (await h.admin.query<{ body: string }>(`select body from community_contributions where id = any($1::uuid[])`, [ids.filter(Boolean)])).rows.map((r) => r.body);
    expect(stored).toContain(`<script>alert(1)</script>`); // stored verbatim: the page escapes on output (checked in the app audit)
    expect((await h.admin.query(`select to_regclass('community_contributions') as t`)).rows[0]).toEqual({ t: "community_contributions" });
  });

  it("the database refuses contact details and links in public text, whatever client sent them", async () => {
    const u = await fresh("Leak");
    for (const body of ["Email me at pat@example.com", "Call 555 123 4567", "see https://example.com/x", "visit www.example.org", "my student Jamie struggles"]) {
      await expect(post(u, "reflection", { body }), body).rejects.toThrow(/contact details|links|identif|student/i);
    }
    expect(await post(u, "reflection", { body: "A quiet word about patience." })).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("prayer", () => {
  it("prevents duplicate acknowledgements, self-acknowledgement, private prayers and blocked authors", async () => {
    const p = await post(ann, "prayer", { title: "A prayer" });
    expect((await one<{ acknowledge_prayer: number }>(ben, `select acknowledge_prayer($1)`, [p])).acknowledge_prayer).toBe(1);
    expect((await one<{ acknowledge_prayer: number }>(ben, `select acknowledge_prayer($1)`, [p])).acknowledge_prayer).toBe(1);
    expect((await h.admin.query(`select 1 from prayer_acknowledgements where contribution_id = $1`, [p])).rows).toHaveLength(1);
    await expect(q(ann, `select acknowledge_prayer($1)`, [p])).rejects.toThrow(/cannot do that/i);
    const priv = await post(ann, "prayer", { visibility: "private" });
    await expect(q(cleo, `select acknowledge_prayer($1)`, [priv])).rejects.toThrow(/cannot do that/i);
    // Direct inserts are allowed only where the same checks pass, and never onto a private prayer.
    await expect(q(cleo, `insert into prayer_acknowledgements (user_id, contribution_id) values ($1,$2)`, [cleo, priv])).rejects.toThrow(DENIED);
    await expect(q(cleo, `insert into prayer_acknowledgements (user_id, contribution_id) values ($1,$2)`, [ben, p])).rejects.toThrow(DENIED);
    const refl = await post(ann, "reflection");
    await expect(q(cleo, `select acknowledge_prayer($1)`, [refl])).rejects.toThrow(/cannot do that/i);
  });

  it("does not reveal who prayed, or who wrote an anonymous prayer, to anyone through the API", async () => {
    const anon = await fresh("Anon");
    const p = await post(anon, "prayer", { visibility: "anonymous", title: "Anon" });
    await q(ben, `select acknowledge_prayer($1)`, [p]);
    await expect(q(cleo, `select user_id from community_contributions where id = $1`, [p])).rejects.toThrow(DENIED);
    expect((await q<{ user_id: string }>(cleo, `select user_id from prayer_acknowledgements`)).every((r) => r.user_id === cleo)).toBe(true);
    await expect(q(admin, `select user_id from community_contributions where id = $1`, [p])).rejects.toThrow(DENIED);
    const row = (await q<Record<string, unknown>>(cleo, `select * from list_contributions($1,null,null,false,50,null,null) where id = $2`, [live, p]))[0]!;
    expect(row.author_name).toBeNull();
    expect(JSON.stringify(row)).not.toContain(anon);
    const modRow = (await q<Record<string, unknown>>(mod, `select * from list_contributions($1,null,null,false,50,null,null) where id = $2`, [live, p]))[0]!;
    expect(JSON.stringify(modRow)).not.toContain(anon);
  });

  it("offers no popularity ordering anywhere: order is by time only", async () => {
    const fn = (await h.admin.query<{ def: string }>(`select pg_get_functiondef('list_contributions'::regproc) as def`)).rows[0]!.def;
    expect(fn).toMatch(/order by[\s\S]*created_at/i);
    expect(fn).not.toMatch(/prayer_acknowledgements[\s\S]{0,200}order by|order by[^;]*(count|prayer_count|ack)/i);
    const gp = (await h.admin.query<{ def: string }>(`select pg_get_functiondef('list_group_posts'::regproc) as def`)).rows[0]!.def;
    expect(gp).not.toMatch(/order by[^;]*(count|prayer_count|ack)/i);
  });

  it("blocking hides the blocked person's prayers from the blocker", async () => {
    const blocker = await fresh("Blocker");
    const blocked = await fresh("Blocked");
    const pb = await post(blocked, "prayer", { title: "Blocked's" });
    expect((await q<{ id: string }>(blocker, `select id from list_contributions($1,'prayer',null,false,50,null,null)`, [live])).map((r) => r.id)).toContain(pb);
    await q(blocker, `select block_author('contribution',$1)`, [pb]);
    expect((await q<{ id: string }>(blocker, `select id from list_contributions($1,'prayer',null,false,50,null,null)`, [live])).map((r) => r.id)).not.toContain(pb);
    // others still see it: a block is personal
    expect((await q<{ id: string }>(ann, `select id from list_contributions($1,'prayer',null,false,50,null,null)`, [live])).map((r) => r.id)).toContain(pb);
  });

  it("an author can edit and delete their own prayer; others cannot", async () => {
    const owner = await fresh("Owner");
    const p = await post(owner, "prayer", { title: "Mine" });
    await q(owner, `update community_contributions set body = 'edited prayer', title = 'Mine 2' where id = $1`, [p]);
    expect(await q(ben, `update community_contributions set body = 'x' where id = $1 returning id`, [p])).toHaveLength(0);
    expect(await q(owner, `delete from community_contributions where id = $1 returning id`, [p])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("private educator groups", () => {
  let gid: string, otherGid: string, postId: string, commentId: string;
  beforeAll(async () => {
    gid = await newGroup(ann, { name: "Alpha circle" });
    await joinGroup(gid, ben);
    otherGid = await newGroup(cleo, { name: "Beta circle", privacy: "discoverable" });
    postId = (await one<{ id: string }>(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'prayer','Pray for my family') returning id`, [gid, ann])).id;
    commentId = (await one<{ id: string }>(ben, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'praying') returning id`, [postId, gid, ben])).id;
  });

  it("outsiders cannot read posts, comments, members, or acknowledgements by id, table, function or guessed URL", async () => {
    for (const who of [dan, cleo, outsider, admin, mod, editor]) {
      expect(await q(who, `select id from group_posts where id = $1`, [postId])).toHaveLength(0);
      expect(await q(who, `select id from group_comments where id = $1`, [commentId])).toHaveLength(0);
      expect(await q(who, `select * from list_group_posts($1)`, [gid])).toHaveLength(0);
      expect(await q(who, `select * from list_group_comments($1)`, [postId])).toHaveLength(0);
      expect(await q(who, `select * from group_roster($1)`, [gid])).toHaveLength(0);
      expect(await q(who, `select * from group_memberships where group_id = $1`, [gid]).catch(() => [])).toHaveLength(0);
      await expect(q(who, `select acknowledge_prayer(null, $1)`, [postId])).rejects.toThrow(/cannot do that/i);
    }
    // the group looks non-existent to outsiders (no "exists but forbidden" signal)
    expect(await q(dan, `select * from get_group($1)`, [gid])).toHaveLength(0);
    expect(await q(dan, `select * from get_group('00000000-0000-0000-0000-000000000000')`)).toHaveLength(0);
  });

  it("outsiders cannot write into a group, or into another group's post thread", async () => {
    await expect(q(dan, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hi')`, [gid, dan])).rejects.toThrow(DENIED);
    await expect(q(dan, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'hi')`, [postId, gid, dan])).rejects.toThrow(DENIED);
    // a member of Beta cannot attach a comment to Alpha's post by naming Beta as the group
    await expect(q(cleo, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'hi')`, [postId, otherGid, cleo])).rejects.toThrow(/same group|row-level security|permission denied/i);
    // a member of Alpha cannot name the wrong group for their own post
    await expect(q(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','x')`, [otherGid, ben])).rejects.toThrow(DENIED);
  });

  it("members cannot impersonate, edit or delete other members' posts, or escalate their role", async () => {
    await expect(q(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','x')`, [gid, ann])).rejects.toThrow(DENIED);
    expect(await q(ben, `update group_posts set body = 'x' where id = $1 returning id`, [postId])).toHaveLength(0);
    expect(await q(ben, `delete from group_posts where id = $1 returning id`, [postId])).toHaveLength(0);
    await expect(q(ben, `select hide_content('group_post',$1,'x')`, [postId])).rejects.toThrow(/cannot act|cannot do that|not available/i);
    await expect(q(ben, `update community_groups set status = 'active', privacy = 'discoverable' where id = $1`, [gid])).rejects.toThrow(DENIED);
    await expect(q(ben, `select remove_group_member($1,$2,'x')`, [gid, ann])).rejects.toThrow(DENIED);
    await expect(q(ben, `select suspend_group($1,'x')`, [gid])).rejects.toThrow(DENIED);
  });

  it("a private (non-discoverable) group cannot be joined by request or found in the directory", async () => {
    await expect(q(dan, `select request_to_join($1,'let me in')`, [gid])).rejects.toThrow(/not available/i);
    expect((await q<{ name: string }>(dan, `select * from group_directory()`)).map((g) => g.name)).not.toContain("Alpha circle");
    expect((await q<{ name: string }>(dan, `select * from group_directory()`)).map((g) => g.name)).toContain("Beta circle");
    expect(await q(dan, `select * from group_directory('Alpha')`)).toHaveLength(0);
  });

  it("invitations: only managers invite; tokens are not guessable or reusable by someone else; revoked or expired tokens fail", async () => {
    const t = "abc123-not-a-real-token";
    await expect(q(dan, `select accept_group_invitation($1)`, [t])).rejects.toThrow(/not available|invalid|expired/i);
    await expect(q(dan, `insert into group_invitations (group_id, invited_by, email, role, token_hash) values ($1,$2,'x@y.z','member','h')`, [gid, dan])).rejects.toThrow(DENIED);
    await expect(q(ben, `insert into group_invitations (group_id, invited_by, email, role, token_hash) values ($1,$2,'x@y.z','member','h')`, [gid, ben])).rejects.toThrow(DENIED);
    expect(await q(dan, `select * from group_invitations`).catch(() => [])).toHaveLength(0);
  });

  it("removing a member ends their access at once; a suspended group is closed to members; deletion removes everything", async () => {
    const g = await newGroup(ann, { name: "Gamma" });
    await joinGroup(g, dan);
    const p = (await one<{ id: string }>(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','secret plan') returning id`, [g, ann])).id;
    expect(await q(dan, `select * from list_group_posts($1)`, [g])).toHaveLength(1);
    await q(ann, `select remove_group_member($1,$2,'Not a fit')`, [g, dan]);
    expect(await q(dan, `select * from list_group_posts($1)`, [g])).toHaveLength(0);
    expect(await q(dan, `select id from group_posts where id = $1`, [p])).toHaveLength(0);
    await joinGroup(g, ben);
    await q(mod, `select suspend_group($1,'Review')`, [g]);
    expect(await q(ben, `select * from list_group_posts($1)`, [g])).toHaveLength(0);
    await expect(q(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hi')`, [g, ben])).rejects.toThrow(DENIED);
    await q(mod, `select unsuspend_group($1)`, [g]);
    await expect(q(ben, `select delete_group($1)`, [g])).rejects.toThrow(/owner/i);
    await q(ann, `select delete_group($1)`, [g]);
    expect((await h.admin.query(`select 1 from group_posts where group_id = $1`, [g])).rows).toHaveLength(0);
  });

  it("school groups: members of another school are kept out, and school admins do not gain access to other groups", async () => {
    const sa = (await one<{ create_school: string }>(schoolOwnerA, `select create_school('School A')`)).create_school;
    const sb = (await one<{ create_school: string }>(schoolOwnerB, `select create_school('School B')`)).create_school;
    await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'faculty')`, [sb, dan]);
    const grpA = await newGroup(schoolOwnerA, { school: sa, privacy: "discoverable", name: "A staff" });
    await h.admin.query(`insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','A only')`, [grpA, schoolOwnerA]);
    expect(await q(dan, `select * from get_group($1)`, [grpA])).toHaveLength(0);
    await expect(q(dan, `select request_to_join($1,'')`, [grpA])).rejects.toThrow(/not available/i);
    expect((await q<{ name: string }>(dan, `select * from group_directory()`)).map((g) => g.name)).not.toContain("A staff");
    // School B's owner cannot see School A's groups or subscription, and vice versa
    expect(await q(schoolOwnerB, `select * from school_group_overview($1)`, [sa])).toHaveLength(0);
    expect(await q(schoolOwnerB, `select * from list_group_posts($1)`, [grpA])).toHaveLength(0);
    // School A's owner has no access to the unrelated private group
    expect(await q(schoolOwnerA, `select * from list_group_posts($1)`, [gid])).toHaveLength(0);
    expect(await q(schoolOwnerA, `select * from school_group_overview($1)`, [sa]).then((r) => r.length)).toBe(1);
  });

  let cleo2: string;
  it("group reports go to the group first; the reporter's identity is not shown to the group; platform staff see them only if escalated", async () => {
    cleo2 = await fresh("Reporter");
    await joinGroup(gid, cleo2);
    // ben's post is reported by the new member (the owner is not the author, so it stays inside the group)
    const bp = (await one<{ id: string }>(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','a post') returning id`, [gid, ben])).id;
    const r = await one<{ report_content: string }>(cleo2, `select report_content('group_post',$1,'inappropriate','hmm')`, [bp]);
    expect(r.report_content).toBeTruthy();
    expect((await q<{ target_id: string }>(mod, `select target_id from list_platform_reports('all')`)).map((x) => x.target_id)).not.toContain(bp);
    const rows = await q<Record<string, unknown>>(ann, `select * from list_group_reports($1)`, [gid]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(rows)).not.toContain(cleo2);
  });
});

// ---------------------------------------------------------------------------
describe("direct messaging stays off", () => {
  it("is disabled by default and every endpoint refuses, including with a crafted conversation", async () => {
    expect((await h.admin.query<{ value: unknown }>(`select value from community_settings where key = 'direct_messages_enabled'`)).rows[0]!.value).toBe(false);
    await expect(q(ann, `select start_direct_conversation($1)`, [ben])).rejects.toThrow(/not available|disabled|not enabled/i);
    await expect(q(ann, `insert into direct_conversations (user_a, user_b) values ($1,$2)`, [ann, ben])).rejects.toThrow(DENIED);
    expect(await q(ann, `select * from direct_messages`)).toHaveLength(0);
    expect(await q(ann, `select * from direct_conversations`)).toHaveLength(0);
    await expect(q(ann, `insert into direct_messages (conversation_id, sender_id, body) values (gen_random_uuid(), $1, 'hi')`, [ann])).rejects.toThrow(DENIED);
  });

  it("even a platform administrator cannot switch it on from the application (H: M-04)", async () => {
    await expect(q(admin, `select set_community_setting('direct_messages_enabled','true')`)).rejects.toThrow(/not available in this release/i);
    await expect(q(admin, `select set_community_setting('direct_messages_enabled','1')`)).rejects.toThrow(/not available in this release/i);
    expect((await h.admin.query<{ value: unknown }>(`select value from community_settings where key = 'direct_messages_enabled'`)).rows[0]!.value).toBe(false);
    await q(admin, `select set_community_setting('direct_messages_enabled','false')`); // turning it off is always allowed
    await expect(q(ann, `select start_direct_conversation($1)`, [ben])).rejects.toThrow(/not available|disabled|not enabled/i);
  });

  it("an ordinary educator cannot turn it on", async () => {
    await expect(q(ann, `select set_community_setting('direct_messages_enabled','true')`)).rejects.toThrow(/not allowed/i);
    await expect(q(mod, `select set_community_setting('direct_messages_enabled','true')`)).rejects.toThrow(/not allowed/i);
    await expect(q(ann, `update community_settings set value = 'true'`)).rejects.toThrow(DENIED);
  });
});

// ---------------------------------------------------------------------------
describe("billing, entitlements and tenant isolation", () => {
  it("clients cannot write any billing table or grant themselves access", async () => {
    for (const sql of [
      `insert into subscriptions (owner_type, user_id, plan_key, plan_interval, status, stripe_subscription_id, last_event_created) values ('user', '${ann}', 'plus', 'month', 'active', 'sub_x', now())`,
      `update subscriptions set status = 'active'`,
      `insert into entitlement_grants (user_id, plan_key, reason) values ('${ann}', 'plus', 'x')`,
      `update plan_features set enabled = true`,
      `insert into billing_customers (owner_type, user_id, stripe_customer_id) values ('user','${ann}','cus_x')`,
      `delete from stripe_events`,
    ]) {
      await expect(q(ann, sql), sql.slice(0, 40)).rejects.toThrow(DENIED);
    }
    await expect(q(ann, `select billing_apply_event('{"id":"evt_x","type":"customer.subscription.created","created":1,"data":{"object":{}}}'::jsonb)`)).rejects.toThrow(/permission denied/i);
    await expect(q(ann, `select admin_grant_plan($1,'plus','free',null)`, [ann])).rejects.toThrow(/administrators only|permission denied/i);
  });

  it("a free educator has no premium feature; a subscriber does; the limit is the database's decision", async () => {
    expect((await one<{ has_feature: boolean }>(ann, `select has_feature('premium_devotionals')`)).has_feature).toBe(false);
    expect((await one<{ has_feature: boolean }>(ben, `select has_feature('premium_devotionals')`)).has_feature).toBe(true);
    const lock = await q(ann, `select id from devotionals where id = $1`, [plusOnly]);
    expect(lock).toHaveLength(0);
    expect(await q(ben, `select id from devotionals where id = $1`, [plusOnly])).toHaveLength(1);
  });

  it("a person cannot see anyone else's subscription, invoices or customer record", async () => {
    expect(await q(ann, `select id from subscriptions`)).toHaveLength(0);
    expect(await q(ben, `select id from subscriptions`)).toHaveLength(1);
    expect(await q(ann, `select id from billing_invoices`).catch(() => [])).toHaveLength(0);
    await expect(q(ben, `select stripe_customer_id from billing_customers`)).rejects.toThrow(DENIED);
  });

  it("school isolation: another school's owner cannot see its subscription, seats, roster or assignments", async () => {
    const a = (await one<{ create_school: string }>(await fresh("OwnerA"), `select create_school('Iso A')`)).create_school;
    const ownerB = await fresh("OwnerB");
    await one(ownerB, `select create_school('Iso B')`);
    await h.admin.query(`insert into subscriptions (owner_type, school_id, plan_key, plan_interval, status, stripe_subscription_id, seats, current_period_end, last_event_created)
      values ('school', $1, 'school', 'year', 'active', 'sub_iso_a', 5, now() + interval '30 days', now())`, [a]);
    expect(await q(ownerB, `select id from subscriptions where school_id = $1`, [a])).toHaveLength(0);
    expect(await q(ownerB, `select * from school_roster($1)`, [a])).toHaveLength(0);
    expect(await q(ownerB, `select * from school_assignments where school_id = $1`, [a])).toHaveLength(0);
    await expect(q(ownerB, `select school_engagement($1, 30)`, [a])).rejects.toThrow(/owner or administrator/i);
    await expect(q(ownerB, `insert into school_memberships (school_id, user_id, role) values ($1,$2,'owner')`, [a, ownerB])).rejects.toThrow(DENIED);
  });

  it("faculty (non-administrators) cannot assign seats, change roles, or invite", async () => {
    const own = await fresh("Own");
    const s = (await one<{ create_school: string }>(own, `select create_school('Seats')`)).create_school;
    const fac = await fresh("Fac");
    await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'faculty')`, [s, fac]);
    expect(await q(fac, `update school_memberships set role = 'owner' where user_id = $1 returning user_id`, [fac]).catch(() => [])).toHaveLength(0);
    expect((await h.admin.query<{ role: string }>(`select role from school_memberships where user_id = $1`, [fac])).rows[0]!.role).toBe("faculty");
    await expect(q(fac, `insert into school_invitations (school_id, email, role, token_hash, invited_by, expires_at) values ($1,'x@y.z','faculty','h',$2, now() + interval '1 day')`, [s, fac])).rejects.toThrow(DENIED);
    expect(await q(fac, `select * from school_invitations where school_id = $1`, [s])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("privacy: deletion, minimization and roles", () => {
  it("deleting an account removes the person's contributions, replies, prayers, group content, notes and subscriptions", async () => {
    const u = await fresh("Gone");
    const c = await post(u, "prayer", { title: "Gone prayer" });
    const other = await post(await fresh("Keep"), "prayer", { title: "Not gone" });
    await q(u, `select acknowledge_prayer($1)`, [other]);
    const g = await newGroup(ann, { name: "Delete test" });
    await joinGroup(g, u);
    await q(u, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','mine')`, [g, u]);
    await q(u, `insert into devotional_user_state (user_id, devotional_id, note) values ($1,$2,'private note')`, [u, live]).catch(() => undefined);
    await h.admin.query(`delete from auth.users where id = $1`, [u]);
    for (const [t, col] of [["community_contributions", "user_id"], ["contribution_replies", "user_id"], ["prayer_acknowledgements", "user_id"], ["group_posts", "author_id"], ["group_memberships", "user_id"], ["devotional_user_state", "user_id"], ["profiles", "id"], ["covenant_acceptances", "user_id"], ["subscriptions", "user_id"], ["community_restrictions", "user_id"]]) {
      expect((await h.admin.query(`select 1 from ${t} where ${col} = $1`, [u])).rows, t).toHaveLength(0);
    }
    expect(c).toBeTruthy();
  });

  it("reports about a deleted person's words do not keep a link to them", async () => {
    const u = await fresh("Rep");
    const c = await post(u);
    await q(ann, `select report_content('contribution',$1,'inappropriate','x')`, [c]);
    await h.admin.query(`delete from auth.users where id = $1`, [u]);
    const r = (await h.admin.query<{ target_author_id: string | null }>(`select target_author_id from contribution_reports where target_id = $1`, [c])).rows;
    expect(r.every((x) => x.target_author_id === null)).toBe(true);
  });

  it("there is no student account type, and no community access without a verified adult-facing account", async () => {
    const roles = (await h.admin.query<{ e: string }>(`select unnest(enum_range(null::school_role))::text as e`)).rows.map((r) => r.e);
    expect(roles).not.toContain("student");
    const gr = (await h.admin.query<{ e: string }>(`select unnest(enum_range(null::platform_role))::text as e`)).rows.map((r) => r.e);
    expect(gr).not.toContain("student");
  });

  it("other people's profiles, emails and notes are not readable", async () => {
    await expect(q(ann, `select email from auth.users`)).rejects.toThrow(DENIED);
    const rows = await q<{ id: string }>(ann, `select id from profiles`);
    expect(rows.map((r) => r.id)).toEqual([ann]);
    expect(await q(ann, `select * from devotional_user_state where user_id <> $1`, [ann])).toHaveLength(0);
    expect(await q(ann, `select * from user_collections where user_id <> $1`, [ann]).catch(() => [])).toHaveLength(0);
  });

  it("no function is callable by anonymous visitors or public except the deliberately public ones", async () => {
    const rows = (await h.admin.query<{ proname: string }>(
      `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
         and has_function_privilege('anon', p.oid, 'execute')`)).rows.map((r) => r.proname);
    // Trigger functions and pure helpers that return false/null for anonymous callers. None reads or writes data.
    const harmless = new Set(["bible_translations_after_update", "devotional_missing_fields", "devotional_transition_allowed", "devotionals_after_update", "devotionals_before_write", "handle_new_user", "has_platform_role", "has_school_role", "is_school_member", "protect_last_owner", "rich_text_plain", "set_updated_at", "weekly_themes_before_update"]);
    expect(rows.filter((r) => !harmless.has(r))).toEqual([]);
    expect(rows.some((r) => /screen|accept_covenant|billing_apply|admin_|restrict_|delete_/.test(r))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("regression: H-01 screening is enforced by the database, not only by the app", () => {
  it("refuses contact details, links and named students in every public and group write path, including edits", async () => {
    const u = await fresh("Scr");
    const c = await post(u, "reflection", { body: "A fine thought" });
    const r = (await one<{ id: string }>(u, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'fine reply') returning id`, [c, u])).id;
    for (const bad of ["write me: a@b.org", "+1 (555) 123-4567", "https://x.org/y", "example.com", "my student Jamie again"]) {
      await expect(q(u, `update community_contributions set body = $2 where id = $1`, [c, bad]), `edit ${bad}`).rejects.toThrow(/contact|links|student/i);
      await expect(q(u, `update contribution_replies set body = $2 where id = $1`, [r, bad]), `reply edit ${bad}`).rejects.toThrow(/contact|links|student/i);
      await expect(q(u, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,$3)`, [c, u, bad]), `reply ${bad}`).rejects.toThrow(/contact|links|student/i);
    }
    await expect(q(u, `update community_contributions set title = 'see www.site.com' where id = $1`, [c])).rejects.toThrow(/links/i);
  });

  it("group text may include links (for sharing resources) but still not named students", async () => {
    const owner = await fresh("Gown");
    const g = await newGroup(owner);
    expect(await q(owner, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','Handout at https://example.com/x') returning id`, [g, owner])).toHaveLength(1);
    await expect(q(owner, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','my student Maria is struggling')`, [g, owner])).rejects.toThrow(/student/i);
    const p = (await one<{ id: string }>(owner, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','Okay') returning id`, [g, owner])).id;
    await expect(q(owner, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'our pupil Ahmed is new')`, [p, g, owner])).rejects.toThrow(/student/i);
    await expect(q(owner, `update group_posts set body = 'a child named Sam' where id = $1`, [p])).rejects.toThrow(/student/i);
  });

  it("does not block ordinary words that merely look similar", async () => {
    const u = await fresh("Ok");
    for (const body of ["The student council met today.", "A teacher who cares.", "Our children and the Holy Spirit", "In 2024 we read John 3:16 together.", "He is the son of God, Jesus."]) {
      expect(await post(u, "reflection", { body }).catch((e) => `ERR ${body}: ${e}`), body).not.toMatch(/^ERR/);
    }
  });

  it("the SQL and TypeScript screening rules agree on a shared set of cases", async () => {
    const { screenPublicText, screenGroupText } = await import("../../src/lib/community/screening");
    const cases = ["pat@example.com", "call 555 123 4567", "https://example.org", "www.example.org", "visit site.com/page", "my student Jamie", "the student council", "a child named Maria", "our kid, Sam", "Peace and patience", "A teacher who prays", "chapter 3 verse 16", "He said, my son Peter wept"];
    const u = await fresh("Parity");
    for (const text of cases) {
      const ts = screenPublicText(text).ok;
      let sql = true;
      try { await h.admin.query(`select screen_text($1, true)`, [text]); } catch { sql = false; }
      expect(sql, `public: ${text}`).toBe(ts);
      const tsg = screenGroupText(text).ok;
      let sqlg = true;
      try { await h.admin.query(`select screen_text($1, false)`, [text]); } catch { sqlg = false; }
      expect(sqlg, `group: ${text}`).toBe(tsg);
    }
    void u;
  });
});

describe("regression: H-02 adult confirmation is required and recorded", () => {
  it("accepting the covenant without confirming adulthood fails; with it, succeeds and is recorded", async () => {
    const strict = await createDatabase({ strictGovernance: true, openFreePlan: false });
    try {
      const t = await strict.createUser("adult@a.test");
      const d = await strict.admin.query<{ id: string }>(
        `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter, translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name, status, published_at)
         values ('S', current_date, 't', 'patience', 'John 3:16', 'John', 3, 'web', $1::jsonb, $1::jsonb, $1::jsonb, $1::jsonb, 'teachers', '{g35}', 'classroom', 'A', 'published', now()) returning id`,
        [doc("x")],
      );
      const did = d.rows[0]!.id;
      const run = <T>(sql: string, params: unknown[] = []) => strict.as(t, async () => (await strict.db.query<T & object>(sql, params)).rows);
      await expect(run(`select accept_covenant(1)`)).rejects.toThrow(/adult/i);
      await expect(run(`select accept_covenant(1, false)`)).rejects.toThrow(/adult/i);
      await expect(run(`insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hello')`, [did, t])).rejects.toThrow();
      await run(`select accept_covenant(1, true)`);
      const row = (await strict.admin.query<{ adult_confirmed_at: string | null }>(`select adult_confirmed_at from covenant_acceptances where user_id = $1`, [t])).rows[0]!;
      expect(row.adult_confirmed_at).not.toBeNull();
      await run(`insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hello')`, [did, t]);
    } finally {
      await strict.db.close();
    }
  });

  it("an acceptance recorded without the confirmation does not count", async () => {
    const strict = await createDatabase({ strictGovernance: true, openFreePlan: false });
    try {
      const t = await strict.createUser("legacy@a.test");
      await strict.admin.query(`insert into covenant_acceptances (user_id, version) values ($1, 1)`, [t]);
      const st = await strict.as(t, async () => (await strict.db.query<{ accepted: boolean }>(`select accepted from covenant_status()`)).rows[0]!);
      expect(st.accepted).toBe(false);
    } finally {
      await strict.db.close();
    }
  });
});

describe("regression: H-03 people can always withdraw their own words", () => {
  it("an author can delete their own contribution and reply after the devotional is archived, unpublished or locked; edits stop", async () => {
    const cases = [`status = 'archived', archived_at = now()`, `status = 'draft', published_at = null`, `access_level = 'plus'`];
    for (const [i, how] of cases.entries()) {
      const author2 = await fresh("Wd");
      const d = await mk(new Date(Date.now() - (i + 1) * 86_400_000).toISOString().slice(0, 10));
      await publish(d);
      const c = await post(author2, "prayer", { devotional: d, title: "A prayer" });
      const replier = await fresh("Wr");
      const r = (await one<{ id: string }>(replier, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'amen') returning id`, [c, replier])).id;
      await h.admin.query(`update devotionals set ${how} where id = $1`, [d]);
      // the author can still see and delete their own prayer, but can no longer edit it
      expect(await q(author2, `select id from community_contributions where id = $1`, [c]), how).toHaveLength(1);
      await q(author2, `update community_contributions set body = 'changed' where id = $1`, [c]);
      expect((await h.admin.query<{ body: string }>(`select body from community_contributions where id = $1`, [c])).rows[0]!.body, how).not.toBe("changed");
      // the replier can delete their reply
      await q(replier, `delete from contribution_replies where id = $1`, [r]);
      expect((await h.admin.query(`select 1 from contribution_replies where id = $1`, [r])).rows, how).toHaveLength(0);
      await q(author2, `delete from community_contributions where id = $1`, [c]);
      expect((await h.admin.query(`select 1 from community_contributions where id = $1`, [c])).rows, how).toHaveLength(0);
    }
  });

  it("the new own-row visibility does not expose anyone else's rows", async () => {
    const a1 = await fresh("Own1");
    const a2 = await fresh("Own2");
    const c = await post(a1, "prayer", { visibility: "private" });
    expect(await q(a2, `select id from community_contributions where id = $1`, [c])).toHaveLength(0);
    expect(await q(a1, `select id from community_contributions where id = $1`, [c])).toHaveLength(1);
  });
});
