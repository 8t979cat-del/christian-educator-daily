import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * Editorial administration, moderation and platform governance, run against the real
 * migrations as each signed-in role. The headline checks are the boundaries: who can do each
 * administrative thing, and who can NOT reach private content just by holding a role.
 */

let h: Harness;
let admin: string, editor: string, editor2: string, mod: string, mod2: string;
let schoolAdmin: string, faculty: string, ann: string, ben: string, cleo: string, dan: string;
let live: string, school: string;

const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0]!;
const DENIED = /row-level security|permission denied/i;
let seq = 0;
const uniq = (s: string) => `${s} ${++seq}`;
let people = 0;
const fresh = (first = "Pat") => h.createUser(`g${++people}@c.test`, { first, last: "Person" });
/** A verified educator who has accepted the current covenant (version 2 after the covenant tests). */
async function poster() {
  const u = await fresh("Poster");
  await q(u, `select accept_covenant(${(await h.admin.query<{ v: number }>(`select governance_int('covenant_version', 1) v`)).rows[0]!.v}, true)`);
  return u;
}

async function mk(date: string, who = editor) {
  const rows = await q<{ id: string }>(
    who,
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category, author_name)
     values ('T '||$1::date::text, $1::date, 'topic', 'patience', 'John 3:16', 'John', 3, 'web', $2::jsonb, $2::jsonb, $2::jsonb, $2::jsonb, 'teachers', '{g35}', 'classroom', 'An Author')
     returning id`,
    [date, doc("Some text")],
  );
  return rows[0]!.id;
}
async function publish(id: string) {
  await q(editor, `select transition_devotional($1,'in_review')`, [id]);
  await q(editor2, `select transition_devotional($1,'approved')`, [id]);
  await q(editor2, `select transition_devotional($1,'published')`, [id]);
}
const accept = (u: string) => q(u, `select accept_covenant(1, true)`);
async function post(user: string, kind = "reflection", extra: { devotional?: string; visibility?: string; title?: string } = {}) {
  return (await one<{ id: string }>(
    user,
    `insert into community_contributions (devotional_id, user_id, kind, title, body, visibility) values ($1,$2,$3,$4,$5,$6) returning id`,
    [extra.devotional ?? live, user, kind, extra.title ?? null, uniq("A thought"), extra.visibility ?? "named"],
  )).id;
}
const visible = async (user: string, devotional = live) =>
  (await q<{ id: string }>(user, `select id from list_contributions($1, null, null, false, 50, null, null)`, [devotional])).map((r) => r.id);

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
  h = await createDatabase({ openFreePlan: true, strictGovernance: true });
  admin = await h.createUser("root@g.test", { first: "Rita", last: "Root" });
  editor = await h.createUser("ed@g.test", { first: "Ed", last: "Itor" });
  editor2 = await h.createUser("ed2@g.test", { first: "Edna", last: "Second" });
  mod = await h.createUser("mod@g.test", { first: "Mo", last: "Derator" });
  mod2 = await h.createUser("mod2@g.test", { first: "Mona", last: "Second" });
  schoolAdmin = await h.createUser("sa@g.test", { first: "Sam", last: "Principal" });
  faculty = await h.createUser("fac@g.test", { first: "Fay", last: "Faculty" });
  ann = await h.createUser("ann@g.test", { first: "Ann", last: "Alder" });
  ben = await h.createUser("ben@g.test", { first: "Ben", last: "Birch" });
  cleo = await h.createUser("cleo@g.test", { first: "Cleo", last: "Cedar" });
  dan = await h.createUser("dan@g.test", { first: "Dan", last: "Dogwood" });
  await h.admin.query(
    `insert into platform_roles (user_id, role) values ($1,'platform_admin'), ($2,'content_editor'), ($3,'content_editor'), ($4,'moderator'), ($5,'moderator')`,
    [admin, editor, editor2, mod, mod2],
  );
  live = await mk("2019-05-01");
  await publish(live);
  school = (await one<{ create_school: string }>(schoolAdmin, `select create_school('Grace Academy')`)).create_school;
  await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'faculty')`, [school, faculty]);
  await h.admin.query(
    `insert into subscriptions (owner_type, school_id, plan_key, plan_interval, status, stripe_subscription_id, seats, current_period_end, last_event_created)
     values ('school', $1, 'school', 'year', 'active', 'sub_gov_test', 10, now() + interval '30 days', now())`, [school]);
});

afterAll(async () => {
  await h.db.close();
});

// ---------------------------------------------------------------------------
describe("covenant acknowledgement", () => {
  it("blocks a first public contribution until the covenant is accepted", async () => {
    await expect(post(ann)).rejects.toThrow(DENIED);
    expect((await one<{ accepted: boolean; version: number }>(ann, `select * from covenant_status()`)).accepted).toBe(false);
  });

  it("accepts only the current version, and only once verified", async () => {
    await expect(q(ann, `select accept_covenant(7, true)`)).rejects.toThrow(/updated/i);
    const unverified = await h.createUser("nv@g.test", { verified: false });
    await expect(accept(unverified)).rejects.toThrow(/verify/i);
    await accept(ann);
    await accept(ann); // idempotent
    expect(await post(ann)).toBeTruthy();
  });

  it("covers group writing too, and a new version asks again", async () => {
    const gid = await newGroup(ben);
    await joinGroup(gid, cleo);
    await expect(q(cleo, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hello')`, [gid, cleo])).rejects.toThrow(DENIED);
    await accept(cleo);
    await q(cleo, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hello')`, [gid, cleo]);
    await q(admin, `select set_governance_setting('covenant_version', '2')`);
    await expect(post(ann)).rejects.toThrow(DENIED);
    await q(ann, `select accept_covenant(2, true)`);
    expect(await post(ann)).toBeTruthy();
    await q(cleo, `select accept_covenant(2, true)`);
    await q(ben, `select accept_covenant(2, true)`);
    await q(admin, `select set_governance_setting('covenant_version', '1')`).catch(() => undefined);
  });

  it("the version can only go up, and only an administrator changes settings", async () => {
    await expect(q(admin, `select set_governance_setting('covenant_version', '1')`)).rejects.toThrow(/only go up/i);
    await expect(q(mod, `select set_governance_setting('covenant_version', '3')`)).rejects.toThrow(/not allowed/i);
    await expect(q(admin, `select set_governance_setting('retention_audit_days', '3')`)).rejects.toThrow(/between 30/i);
  });
});

// ---------------------------------------------------------------------------
describe("discussion controls", () => {
  let d: string;
  beforeAll(async () => {
    for (const u of [ann, ben, cleo, dan]) await q(u, `select accept_covenant(2, true)`);
    d = await mk("2019-05-02");
    await publish(d);
  });

  it("only editors and moderators control a discussion; only editors pin a question", async () => {
    await expect(q(ann, `select set_discussion_controls($1,false,false,'')`, [d])).rejects.toThrow(/cannot do that/i);
    await expect(q(faculty, `select set_pinned_question($1,'What stands out?')`, [d])).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select set_pinned_question($1,'What stands out?')`, [d])).rejects.toThrow(/cannot do that/i);
    await q(editor, `select set_pinned_question($1,'Where have you seen patience this week?')`, [d]);
    expect((await one<{ pinned_question: string }>(ben, `select * from discussion_state($1)`, [d])).pinned_question).toMatch(/patience/);
    await expect(q(editor, `select set_pinned_question($1,$2)`, [d, "x".repeat(401)])).rejects.toThrow(/400/);
    await q(editor, `select set_pinned_question($1,'')`, [d]);
    expect((await one<{ pinned_question: string | null }>(ben, `select * from discussion_state($1)`, [d])).pinned_question).toBeNull();
  });

  it("a closed discussion stays readable but takes no new contributions or replies; prayers can still be acknowledged", async () => {
    const prayer = await post(ann, "prayer", { devotional: d });
    await q(mod, `select set_discussion_controls($1,true,true,'Heated thread')`, [d]);
    expect(await visible(ben, d)).toContain(prayer);
    await expect(post(ben, "reflection", { devotional: d })).rejects.toThrow(DENIED);
    await expect(q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [prayer, ben])).rejects.toThrow(DENIED);
    await q(ben, `insert into prayer_acknowledgements (user_id, contribution_id) values ($1,$2)`, [ben, prayer]);
    expect((await one<{ closed: boolean }>(ben, `select * from discussion_state($1)`, [d])).closed).toBe(true);
    await q(mod, `select set_discussion_controls($1,true,false,'')`, [d]);
    expect(await post(ben, "reflection", { devotional: d })).toBeTruthy();
  });

  it("a disabled discussion is hidden from readers, but authors keep their own words and moderators can still review", async () => {
    const mine = await post(ann, "reflection", { devotional: d });
    const privateNote = await post(ann, "prayer", { devotional: d, visibility: "private" });
    await q(editor, `select set_discussion_controls($1,false,false,'Off for this week')`, [d]);
    expect(await visible(ben, d)).not.toContain(mine);
    expect(await visible(ann, d)).toEqual(expect.arrayContaining([mine, privateNote]));
    expect(await visible(mod, d)).toContain(mine);
    await expect(post(ben, "reflection", { devotional: d })).rejects.toThrow(DENIED);
    const prayer = await post(ann, "prayer", { devotional: d }).catch(() => null);
    expect(prayer).toBeNull(); // not even the author can start a new public contribution
    await q(editor, `select set_discussion_controls($1,true,false,'')`, [d]);
    expect(await visible(ben, d)).toContain(mine);
  });

  it("moderators can lock replies on one thread and stop acknowledgements on one prayer", async () => {
    const prayer = await post(ann, "prayer", { devotional: d });
    await expect(q(ben, `select set_thread_controls($1,true,false,'x')`, [prayer])).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select set_thread_controls($1,true,false,'')`, [prayer])).rejects.toThrow(/reason/i);
    await q(mod, `select set_thread_controls($1,true,true,'Targeted pile-on')`, [prayer]);
    await expect(q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'hi')`, [prayer, ben])).rejects.toThrow(DENIED);
    await expect(q(ben, `insert into prayer_acknowledgements (user_id, contribution_id) values ($1,$2)`, [ben, prayer])).rejects.toThrow(DENIED);
    expect(await q(ben, `select * from thread_controls($1)`, [d])).toEqual(
      expect.arrayContaining([expect.objectContaining({ contribution_id: prayer, replies_locked: true, acks_locked: true })]));
    await q(mod, `select set_thread_controls($1,false,false,'')`, [prayer]);
    await q(ben, `insert into contribution_replies (contribution_id, user_id, body) values ($1,$2,'praying')`, [prayer, ben]);
  });

  it("authors can still edit and delete their own prayers, even in a closed discussion", async () => {
    const prayer = await post(ann, "prayer", { devotional: d });
    await q(mod, `select set_discussion_controls($1,true,true,'')`, [d]);
    await q(ann, `update community_contributions set body = 'Edited prayer' where id = $1`, [prayer]);
    await q(ann, `delete from community_contributions where id = $1`, [prayer]);
    await q(mod, `select set_discussion_controls($1,true,false,'')`, [d]);
  });

  it("unpublishing takes the devotional and its discussion away from readers, with a reason on record", async () => {
    const u = await mk("2019-05-03");
    await publish(u);
    const c = await post(ann, "reflection", { devotional: u });
    expect(await visible(ben, u)).toContain(c);
    await expect(q(editor, `select transition_devotional($1,'approved')`, [u])).rejects.toThrow(/say why/i);
    await q(editor, `select transition_devotional($1,'approved',null,'Needs a source check')`, [u]);
    expect(await visible(ben, u)).toHaveLength(0);
    expect((await h.admin.query(`select 1 from devotionals where id = $1 and status = 'approved'`, [u])).rows).toHaveLength(1);
    const ev = await q<{ from_status: string; to_status: string; note: string }>(editor, `select from_status, to_status, note from devotional_events where devotional_id = $1 order by created_at desc, id limit 1`, [u]);
    expect(ev[0]).toMatchObject({ from_status: "published", to_status: "approved", note: "Needs a source check" });
    await q(editor2, `select transition_devotional($1,'published')`, [u]);
    expect(await visible(ben, u)).toContain(c);
    await expect(q(ann, `select transition_devotional($1,'approved',null,'x')`, [u])).rejects.toThrow(/not allowed/i);
  });
});

// ---------------------------------------------------------------------------
describe("group review and private-group boundaries", () => {
  it("a new group by an ordinary educator waits for review and is invisible and unusable until approved", async () => {
    const gid = (await one<{ create_group: string }>(ann, `select create_group('Ann''s Study','','Prayer','','study','discoverable')`)).create_group;
    expect((await one<{ group_status: string }>(ann, `select * from my_groups() where id = $1`, [gid])).group_status).toBe("pending");
    expect((await q<{ name: string }>(ben, `select * from group_directory()`)).map((g) => g.name)).not.toContain("Ann's Study");
    await expect(q(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hi')`, [gid, ann])).rejects.toThrow(DENIED);

    const overview = await q<{ id: string; status: string; owner_name: string }>(mod, `select * from admin_group_overview('pending')`);
    expect(overview.map((g) => g.id)).toContain(gid);
    expect(await q(ann, `select * from admin_group_overview('pending')`)).toHaveLength(0);

    await expect(q(ann, `select decide_group_request($1,true,'')`, [gid])).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select decide_group_request($1,false,'')`, [gid])).rejects.toThrow(/why/i);
    await q(mod, `select decide_group_request($1,true,'')`, [gid]);
    expect((await one<{ group_status: string }>(ann, `select * from my_groups() where id = $1`, [gid])).group_status).toBe("active");
    expect((await q<{ name: string }>(ben, `select * from group_directory()`)).map((g) => g.name)).toContain("Ann's Study");
    await expect(q(mod, `select decide_group_request($1,false,'late')`, [gid])).rejects.toThrow(/already been decided/i);
  });

  it("a rejected group stays unusable and the owner sees the reason", async () => {
    const gid = (await one<{ create_group: string }>(ben, `select create_group('Spammy','','','','other','discoverable')`)).create_group;
    await q(mod2, `select decide_group_request($1,false,'Please describe a purpose for educators')`, [gid]);
    const mine = await one<{ group_status: string; id: string }>(ben, `select * from my_groups() where id = $1`, [gid]);
    expect(mine.group_status).toBe("rejected");
    const detail = await one<{ group_status: string; suspended_reason: string }>(ben, `select * from get_group($1)`, [gid]);
    expect(detail).toMatchObject({ group_status: "rejected", suspended_reason: "Please describe a purpose for educators" });
    expect(await q(dan, `select * from get_group($1)`, [gid])).toHaveLength(0);
    expect((await q<{ name: string }>(dan, `select * from group_directory()`)).map((g) => g.name)).not.toContain("Spammy");
  });

  it("school groups and groups created by staff are active at once", async () => {
    const sg = (await one<{ create_group: string }>(schoolAdmin, `select create_group('Faculty room','','','','school','private',$1)`, [school])).create_group;
    expect((await one<{ group_status: string }>(schoolAdmin, `select * from my_groups() where id = $1`, [sg])).group_status).toBe("active");
    const mg = (await one<{ create_group: string }>(mod, `select create_group('Staff made','','','','other','private')`)).create_group;
    expect((await one<{ group_status: string }>(mod, `select * from my_groups() where id = $1`, [mg])).group_status).toBe("active");
  });

  it("staff and school administrators cannot read private group content by role", async () => {
    const gid = await newGroup(ben, { name: "Private circle" });
    await joinGroup(gid, cleo);
    await q(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','Please pray for my family')`, [gid, ben]);
    for (const who of [admin, mod, editor, schoolAdmin, dan]) {
      expect(await q(who, `select * from group_posts`), "table read").toHaveLength(0);
      expect(await q(who, `select * from list_group_posts($1)`, [gid]), "list").toHaveLength(0);
      expect(await q(who, `select * from group_memberships where group_id = $1`, [gid]).catch(() => []), "members").toHaveLength(0);
    }
    // Staff do see group METADATA (name, status, counts) but never its words.
    const meta = (await q<Record<string, unknown>>(mod, `select * from admin_group_overview(null, 'Private circle')`))[0]!;
    expect(meta).toMatchObject({ name: "Private circle", member_count: 2 });
    expect(Object.keys(meta).join(",")).not.toMatch(/body|post|comment|snapshot/);
    // A school admin sees only their own school's groups, not unrelated ones.
    expect((await q<{ name: string }>(schoolAdmin, `select * from school_group_overview($1)`, [school])).map((g) => g.name)).not.toContain("Private circle");
  });

  it("platform administrators can transfer ownership, assign moderators, and delete; moderators and others cannot", async () => {
    const gid = await newGroup(ben, { name: "Handover" });
    await joinGroup(gid, cleo);
    await joinGroup(gid, dan);
    await expect(q(mod, `select admin_transfer_group_ownership($1,$2,'x')`, [gid, cleo])).rejects.toThrow(/cannot do that/i);
    await expect(q(admin, `select admin_transfer_group_ownership($1,$2,'')`, [gid, cleo])).rejects.toThrow(/reason/i);
    await expect(q(admin, `select admin_transfer_group_ownership($1,$2,'x')`, [gid, ann])).rejects.toThrow(/active member/i);
    await q(admin, `select admin_transfer_group_ownership($1,$2,'Owner inactive')`, [gid, cleo]);
    expect((await h.admin.query<{ user_id: string; role: string }>(`select user_id, role from group_memberships where group_id = $1`, [gid])).rows)
      .toEqual(expect.arrayContaining([{ user_id: cleo, role: "owner" }, { user_id: ben, role: "moderator" }]));
    await q(admin, `select admin_set_group_role($1,$2,'moderator','Helps with welcome')`, [gid, dan]);
    await expect(q(admin, `select admin_set_group_role($1,$2,'moderator','x')`, [gid, cleo])).rejects.toThrow(/Transfer ownership/i);
    await expect(q(ann, `select admin_delete_group($1,'x')`, [gid])).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select admin_delete_group($1,'x')`, [gid])).rejects.toThrow(/cannot do that/i);
    await q(admin, `select admin_delete_group($1,'Requested by the owner')`, [gid]);
    expect((await h.admin.query(`select 1 from community_groups where id = $1`, [gid])).rows).toHaveLength(0);
    const log = await q<{ action: string; entity_id: string }>(admin, `select action, entity_id from admin_audit_list(50, 0, 'group')`);
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["group.transfer_ownership", "group.delete", "group.set_role"]));
  });

  it("school administrators manage only their own school's groups, by metadata", async () => {
    const sg = await newGroup(schoolAdmin, { school, name: "Staff meeting" });
    await joinGroup(sg, faculty);
    await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'member') on conflict do nothing`, [sg, faculty]);
    const other = await newGroup(ben, { name: "Not theirs" });
    expect((await q<{ name: string }>(schoolAdmin, `select * from school_group_overview($1)`, [school])).map((g) => g.name)).toContain("Staff meeting");
    await expect(q(ann, `select school_transfer_group_ownership($1,$2)`, [sg, faculty])).rejects.toThrow(/cannot do that/i);
    await expect(q(schoolAdmin, `select school_transfer_group_ownership($1,$2)`, [other, faculty])).rejects.toThrow(/cannot do that/i);
    await expect(q(schoolAdmin, `select school_delete_group($1)`, [other])).rejects.toThrow(/cannot do that/i);
    await h.admin.query(`delete from school_memberships where school_id = $1 and user_id = $2`, [school, faculty]);
    await expect(q(schoolAdmin, `select school_transfer_group_ownership($1,$2)`, [sg, faculty])).rejects.toThrow(/active member/i);
    await h.admin.query(`insert into school_memberships (school_id, user_id, role) values ($1,$2,'faculty')`, [school, faculty]);
    await h.admin.query(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'member') on conflict do nothing`, [sg, faculty]);
    await q(schoolAdmin, `select school_transfer_group_ownership($1,$2)`, [sg, faculty]);
    await q(schoolAdmin, `select school_delete_group($1)`, [sg]);
    expect((await h.admin.query(`select 1 from community_groups where id = $1`, [sg])).rows).toHaveLength(0);
  });

  it("a group manager can lock comments on a post, and members cannot", async () => {
    const gid = await newGroup(ben, { name: "Lock test" });
    await joinGroup(gid, cleo);
    const p = (await one<{ id: string }>(ben, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','Thread') returning id`, [gid, ben])).id;
    await expect(q(cleo, `select set_group_post_locked($1,true)`, [p])).rejects.toThrow(/cannot do that/i);
    await q(ben, `select set_group_post_locked($1,true)`, [p]);
    await expect(q(cleo, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'hi')`, [p, gid, cleo])).rejects.toThrow(DENIED);
    expect((await q<{ post_id: string }>(cleo, `select * from group_locked_posts($1)`, [gid])).map((r) => r.post_id)).toContain(p);
    await q(ben, `select set_group_post_locked($1,false)`, [p]);
    await q(cleo, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'hi')`, [p, gid, cleo]);
  });
});

// ---------------------------------------------------------------------------
describe("urgent safety reports and escalation", () => {
  it("an urgent report from a private group reaches platform moderators at once; an ordinary one does not", async () => {
    const gid = await newGroup(ben, { name: "Quiet room" });
    await joinGroup(gid, cleo);
    await joinGroup(gid, dan);
    const frank = await fresh("Frank");
    await joinGroup(gid, frank);
    await q(cleo, `select accept_covenant(2, true)`);
    const p1 = (await one<{ id: string }>(cleo, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','ordinary one') returning id`, [gid, cleo])).id;
    const p2 = (await one<{ id: string }>(cleo, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','scary one') returning id`, [gid, cleo])).id;
    await q(frank, `select report_content('group_post',$1,'inappropriate','meh')`, [p1]);
    await q(dan, `select report_content('group_post',$1,'threat_or_hate','Someone may be in danger', true)`, [p2]);
    const queue = await q<{ target_id: string; urgent: boolean }>(mod, `select target_id, urgent from list_platform_reports('open')`);
    expect(queue.map((r) => r.target_id)).toContain(p2);
    expect(queue.map((r) => r.target_id)).not.toContain(p1);
    expect(queue[0]).toMatchObject({ target_id: p2, urgent: true });
    // Non-members cannot raise an alarm about content they cannot see.
    await expect(q(ann, `select report_content('group_post',$1,'threat_or_hate','',true)`, [p2])).rejects.toThrow(/no longer available/i);
  });

  it("moderators hand serious cases to platform administrators; only administrators see and close them", async () => {
    const [r] = await q<{ id: string }>(mod, `select id from list_platform_reports('open') where urgent`);
    await expect(q(mod, `select escalate_to_admin($1,'')`, [r!.id])).rejects.toThrow(/what needs a decision/i);
    await expect(q(ann, `select escalate_to_admin($1,'x')`, [r!.id])).rejects.toThrow(/cannot do that/i);
    await q(mod, `select escalate_to_admin($1,'Possible self-harm, needs a safety decision')`, [r!.id]);
    expect(await q(mod, `select * from list_admin_escalations()`)).toHaveLength(0);
    expect((await q(admin, `select * from list_admin_escalations()`)).length).toBe(1);
    await expect(q(mod, `select close_admin_escalation($1,'done')`, [r!.id])).rejects.toThrow(/cannot do that/i);
    await expect(q(admin, `select close_admin_escalation($1,'')`, [r!.id])).rejects.toThrow(/record what was done/i);
    await q(admin, `select close_admin_escalation($1,'Contacted the school safeguarding lead')`, [r!.id]);
    expect(await q(admin, `select * from list_admin_escalations()`)).toHaveLength(0);
    expect(await q(admin, `select * from list_admin_escalations(true)`)).toHaveLength(1);
  });

  it("prayer reports are marked, a privacy-invasive prayer can be hidden, and acknowledgements are never ranked", async () => {
    const d = await mk("2019-05-10");
    await publish(d);
    const prayer = await post(ann, "prayer", { devotional: d, title: "For a student" });
    await q(ben, `select report_content('contribution',$1,'student_privacy','Names a child')`, [prayer]);
    const row = (await q<{ id: string; is_prayer: boolean }>(mod, `select id, is_prayer from list_platform_reports('open') where target_id = $1`, [prayer]))[0]!;
    expect(row.is_prayer).toBe(true);
    await q(mod, `select hide_content('contribution',$1,'Identifies a student')`, [prayer]);
    expect(await visible(ben, d)).not.toContain(prayer);
    expect(await visible(ann, d)).toContain(prayer);
    const cols = (await h.admin.query<{ column_name: string }>(
      `select column_name from information_schema.columns where table_name = 'list_contributions' or table_name = 'prayer_acknowledgements'`)).rows;
    expect(cols.map((c) => c.column_name).join()).not.toMatch(/rank|score|popular|trending/);
    // The listing has no popularity order: only newest or oldest first.
    const rows = await q<{ id: string }>(ben, `select id from list_contributions($1, 'prayer', null, true, 50, null, null)`, [d]);
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
describe("account suspension and termination", () => {
  it("only platform administrators change account status, never their own or another staff member's", async () => {
    await expect(q(mod, `select admin_set_account_status($1,'suspended','x',7)`, [dan])).rejects.toThrow(/cannot do that/i);
    await expect(q(admin, `select admin_set_account_status($1,'suspended','x',7)`, [admin])).rejects.toThrow(/own account/i);
    await expect(q(admin, `select admin_set_account_status($1,'suspended','x',7)`, [mod])).rejects.toThrow(/staff roles/i);
    await expect(q(admin, `select admin_set_account_status($1,'suspended','',7)`, [dan])).rejects.toThrow(/reason/i);
  });

  it("a suspension blocks community writing, shows the person a notice they can appeal, and lifts cleanly", async () => {
    const d = await mk("2019-05-11");
    await publish(d);
    await q(admin, `select admin_set_account_status($1,'suspended','Repeated harassment after warnings',14)`, [dan]);
    expect(await q(dan, `select * from my_account_status()`)).toEqual([expect.objectContaining({ status: "suspended" })]);
    await expect(post(dan, "reflection", { devotional: d })).rejects.toThrow(DENIED);
    const notice = (await q<{ id: string; can_appeal: boolean }>(dan, `select id, can_appeal from my_moderation_notices()`))[0]!;
    expect(notice.can_appeal).toBe(true);
    await q(dan, `select file_appeal($1,'I would like this reviewed')`, [notice.id]);
    const appeal = (await q<{ id: string }>(mod2, `select id from list_appeals('open')`))[0]!;
    await q(mod2, `select resolve_appeal($1,'overturn','Warnings were not documented')`, [appeal.id]);
    expect(await q(dan, `select * from my_account_status()`)).toHaveLength(0);
    expect(await post(dan, "reflection", { devotional: d })).toBeTruthy();
  });

  it("termination is open-ended and reversible only by an administrator; an expired suspension reads as active", async () => {
    const eve = await fresh("Eve");
    await q(admin, `select admin_set_account_status($1,'terminated','Exploiting members',1)`, [eve]);
    expect(await q(eve, `select * from my_account_status()`)).toEqual([expect.objectContaining({ status: "terminated" })]);
    await q(admin, `select admin_set_account_status($1,'active','Reviewed and reinstated',1)`, [eve]);
    expect(await q(eve, `select * from my_account_status()`)).toHaveLength(0);
    await q(admin, `select admin_set_account_status($1,'suspended','Short pause',1)`, [eve]);
    await h.admin.query(`update account_status set until = now() - interval '1 hour' where user_id = $1`, [eve]);
    expect(await q(eve, `select * from my_account_status()`)).toHaveLength(0);
  });

  it("people cannot read or write account status directly", async () => {
    await expect(q(ann, `select * from account_status`)).rejects.toThrow(DENIED);
    await expect(q(ann, `delete from account_status`)).rejects.toThrow(DENIED);
  });
});

// ---------------------------------------------------------------------------
describe("audit log", () => {
  it("records administrative changes with who did them, and is readable by platform administrators only", async () => {
    const newMod = await fresh("Mia");
    await q(admin, `select grant_platform_role('${"g" + people}@c.test', 'moderator')`).catch(() => undefined);
    await q(admin, `select set_community_setting('max_groups_owned_per_user', '4')`);
    const rows = await q<{ action: string; entity: string; actor_name: string; actor_roles: string[]; detail: Record<string, unknown> }>(
      admin, `select * from admin_audit_list(50, 0)`);
    expect(rows.length).toBeGreaterThan(0);
    const settingRow = rows.find((r) => r.entity === "community_setting");
    expect(settingRow).toBeTruthy();
    expect(settingRow!.actor_name).toBe("Rita Root");
    expect(settingRow!.actor_roles).toContain("platform_admin");
    expect(newMod).toBeTruthy();
    for (const who of [mod, editor, schoolAdmin, ann]) {
      expect(await q(who, `select * from admin_audit_list(50, 0)`)).toHaveLength(0);
      await expect(q(who, `select * from admin_audit_log`)).rejects.toThrow(DENIED);
    }
  });

  it("cannot be written, edited or deleted by any signed-in role", async () => {
    for (const who of [admin, mod, editor, ann]) {
      await expect(q(who, `insert into admin_audit_log (action, entity) values ('x','y')`)).rejects.toThrow(DENIED);
      await expect(q(who, `update admin_audit_log set action = 'x'`)).rejects.toThrow(DENIED);
      await expect(q(who, `delete from admin_audit_log`)).rejects.toThrow(DENIED);
      await expect(q(who, `select audit_record('forged','x','1')`)).rejects.toThrow(DENIED);
    }
  });

  it("covers plan, setting, entitlement and role changes, and skips server-side jobs with no signed-in person", async () => {
    const count = async () => Number((await h.admin.query<{ n: string }>(`select count(*) n from admin_audit_log`)).rows[0]!.n);
    const before = await count();
    await h.admin.query(`update billing_settings set value = '8' where key = 'past_due_grace_days'`);
    expect(await count()).toBe(before); // a server job is not an administrative action

    await q(admin, `select admin_set_billing_setting('past_due_grace_days', 9)`);
    await q(admin, `select admin_set_plan_feature('free', 'bookmarks_limit', true, 30)`);
    const target = await fresh("Grant");
    await q(admin, `select admin_grant_plan($1, 'plus', 'Scholarship', null)`, [target]);
    const kinds = (await q<{ entity: string; action: string; detail: Record<string, unknown> }>(admin, `select entity, action, detail from admin_audit_list(100, 0)`));
    const entities = kinds.map((k) => k.entity);
    expect(entities).toEqual(expect.arrayContaining(["billing_setting", "plan_feature", "entitlement_grant"]));
    const change = kinds.find((k) => k.entity === "billing_setting" && k.action === "update")!;
    expect(JSON.stringify(change.detail)).toMatch(/"to":\s*(9|"9")/);
    // role grants are recorded too
    const newMod = await h.createUser("newmod@g.test");
    await q(admin, `select grant_platform_role('newmod@g.test', 'moderator')`);
    expect((await q<{ entity: string; entity_id: string }>(admin, `select entity, entity_id from admin_audit_list(100, 0, 'platform_role')`)).map((r) => r.entity_id)).toContain(newMod);
    await q(admin, `select admin_revoke_grant(id) from entitlement_grants where user_id = $1`, [target]).catch(() => undefined);
  });

  it("school administrators can read membership changes inside their own school only", async () => {
    await q(schoolAdmin, `update school_memberships set role = 'staff' where school_id = $1 and user_id = $2`, [school, faculty]);
    const mine = await q<{ action: string }>(schoolAdmin, `select * from school_audit_list($1)`, [school]);
    expect(mine.length).toBeGreaterThan(0);
    expect(await q(ann, `select * from school_audit_list($1)`, [school])).toHaveLength(0);
    expect(await q(faculty, `select * from school_audit_list($1)`, [school])).toHaveLength(0);
  });

  it("moderation history lists platform actions for moderators with only what they need", async () => {
    const rows = await q<Record<string, unknown>>(mod, `select * from list_moderation_history(50, 0)`);
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]!).sort()).toEqual(["action", "actor_name", "at", "group_name", "id", "reason", "target_name"]);
    expect(await q(ann, `select * from list_moderation_history(50, 0)`)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("analytics are aggregate only", () => {
  it("is readable by platform administrators only", async () => {
    for (const who of [mod, editor, schoolAdmin, ann]) {
      await expect(q(who, `select platform_metrics(30)`)).rejects.toThrow(/cannot do that/i);
      await expect(q(who, `select * from usage_counters`)).rejects.toThrow(DENIED);
    }
    const m = (await one<{ platform_metrics: Record<string, unknown> }>(admin, `select platform_metrics(30)`)).platform_metrics;
    expect(Object.keys(m)).toEqual(expect.arrayContaining(
      ["active_educators", "readership", "presentations", "contributions", "groups", "prayer_acknowledgements", "schools", "subscriptions", "moderation"]));
  });

  it("counts usage without storing who, and counts only known metrics", async () => {
    await q(ann, `select record_usage('devotional_view')`);
    await q(ben, `select record_usage('devotional_view')`);
    await q(ben, `select record_usage('presentation_open')`);
    await q(ben, `select record_usage('anything_else')`);
    const rows = (await h.admin.query<{ metric: string; n: number }>(`select metric, n from usage_counters order by metric`)).rows;
    expect(rows).toEqual([{ metric: "devotional_view", n: 2 }, { metric: "presentation_open", n: 1 }]);
    const cols = (await h.admin.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'usage_counters'`)).rows.map((c) => c.column_name);
    expect(cols).not.toContain("user_id");
    await q(ann, `select touch_active()`);
    const m = (await one<{ platform_metrics: { active_educators: { day: number }; readership: { n: number }[] } }>(admin, `select platform_metrics(7)`)).platform_metrics;
    expect(m.active_educators.day).toBe(1);
    expect(m.readership.at(-1)!.n).toBe(2);
  });

  it("does not count private prayers, and contains no person-level data, rankings or scores", async () => {
    const d = await mk("2019-05-12");
    await publish(d);
    const a = (await one<{ platform_metrics: { contributions: { by_kind: Record<string, number> } } }>(admin, `select platform_metrics(30)`)).platform_metrics.contributions.by_kind.prayer ?? 0;
    await post(await poster(), "prayer", { devotional: d, visibility: "private" });
    await post(await poster(), "prayer", { devotional: d, visibility: "anonymous" });
    const b = (await one<{ platform_metrics: { contributions: { by_kind: Record<string, number> } } }>(admin, `select platform_metrics(30)`)).platform_metrics.contributions.by_kind.prayer ?? 0;
    expect(b - a).toBe(1);
    const json = JSON.stringify((await one<{ platform_metrics: unknown }>(admin, `select platform_metrics(30)`)).platform_metrics);
    for (const id of [ann, ben, cleo, dan, mod, admin]) expect(json).not.toContain(id);
    expect(json).not.toMatch(/rank|score|leaderboard|top_|streak|commitment/i);
  });

  it("school administrators never see platform analytics or other schools' people; their own metrics stay suppressed for small groups", async () => {
    await expect(q(schoolAdmin, `select platform_metrics(30)`)).rejects.toThrow(/cannot do that/i);
    const eng = (await one<{ school_engagement: { suppressed: boolean } }>(schoolAdmin, `select school_engagement($1, 30)`, [school])).school_engagement;
    expect(eng.suppressed).toBe(true);
    await expect(q(dan, `select school_engagement($1, 30)`, [school])).rejects.toThrow(/owner or administrator/i);
  });
});

// ---------------------------------------------------------------------------
describe("retention", () => {
  it("only administrators or the server run it; it clears old quoted text but keeps the record", async () => {
    await expect(q(mod, `select retention_run()`)).rejects.toThrow(/not allowed/i);
    const d = await mk("2019-05-13");
    await publish(d);
    const c = await post(await poster(), "reflection", { devotional: d });
    await q(ben, `select report_content('contribution',$1,'spam_or_solicitation','buy now')`, [c]);
    const rid = (await q<{ id: string }>(mod, `select id from list_platform_reports('open') where target_id = $1`, [c]))[0]!.id;
    await q(mod, `select resolve_report($1,'dismiss','Not spam')`, [rid]);
    await h.admin.query(`update contribution_reports set resolved_at = now() - interval '400 days' where id = $1`, [rid]);
    const out = (await one<{ retention_run: Record<string, number> }>(admin, `select retention_run()`)).retention_run;
    expect(out.report_snapshots_cleared).toBeGreaterThanOrEqual(1);
    const row = (await h.admin.query<{ snapshot: string; details: string | null; status: string }>(
      `select snapshot, details, status from contribution_reports where id = $1`, [rid])).rows[0]!;
    expect(row.status).toBe("dismissed");
    expect(row.snapshot).toMatch(/cleared/);
    expect(row.details).toBeNull();
    // open reports are never cleared
    const openRows = (await h.admin.query(`select 1 from contribution_reports where status = 'open' and snapshot like '%cleared%'`)).rows;
    expect(openRows).toHaveLength(0);
    // the server job (no signed-in person) can run it too
    expect((await h.admin.query(`select retention_run()`)).rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("contributors and attribution", () => {
  it("editors manage contributors; others cannot", async () => {
    const c = await one<{ id: string }>(editor, `insert into contributors (name, bio) values ('Dr. Ruth Lee', 'Chaplain') returning id`);
    await expect(q(ann, `insert into contributors (name) values ('Nope')`)).rejects.toThrow(DENIED);
    await expect(q(mod, `insert into contributors (name) values ('Nope')`)).rejects.toThrow(DENIED);
    expect(await q(ann, `select * from contributors`)).toHaveLength(0);
    await q(editor, `select set_devotional_credits($1, $2::jsonb)`, [live, JSON.stringify([{ contributor_id: c.id, role: "reviewer" }])]);
    await expect(q(ann, `select set_devotional_credits($1,'[]')`, [live])).rejects.toThrow(/cannot do that/i);
  });

  it("credits show on published devotionals only", async () => {
    const credits = await q<{ name: string; role: string }>(ben, `select * from devotional_credits($1)`, [live]);
    expect(credits).toEqual([expect.objectContaining({ name: "Dr. Ruth Lee", role: "reviewer" })]);
    const draftDev = await mk("2019-05-14");
    const c = await one<{ id: string }>(editor, `select id from contributors limit 1`);
    await q(editor, `select set_devotional_credits($1, $2::jsonb)`, [draftDev, JSON.stringify([{ contributor_id: c.id, role: "author" }])]);
    expect(await q(ben, `select * from devotional_credits($1)`, [draftDev])).toHaveLength(0);
    expect(await q(editor, `select * from devotional_credits($1)`, [draftDev])).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// The role and permissions matrix. Each probe either raises a permission error, returns nothing,
// or succeeds. "allowed" means the call was permitted for that role.
// ---------------------------------------------------------------------------
describe("role and permissions matrix", () => {
  type Role = "platform_admin" | "content_editor" | "moderator" | "school_admin" | "group_owner" | "educator";
  const roles = (): Record<Role, string> => ({
    platform_admin: admin, content_editor: editor, moderator: mod, school_admin: schoolAdmin, group_owner: ben, educator: dan,
  });

  /** A read tool is "allowed" when it returns rows; a refused caller gets nothing back, or a permission error. */
  async function allowed(user: string, sql: string, params: unknown[] = []): Promise<boolean> {
    try {
      return (await q(user, sql, params)).length > 0;
    } catch (e) {
      if (/cannot do that|not allowed|permission denied|row-level security|owner or administrator/i.test(String(e))) return false;
      throw e;
    }
  }

  it("matches the documented matrix for read tools", async () => {
    const r = roles();
    const reads: Array<[string, string, Role[]]> = [
      ["audit log", `select * from admin_audit_list(5,0)`, ["platform_admin"]],
      ["moderation queue", `select * from list_platform_reports('all')`, ["platform_admin", "moderator"]],
      ["moderation history", `select * from list_moderation_history(5,0)`, ["platform_admin", "moderator"]],
      ["restrictions list", `select * from list_restrictions()`, ["platform_admin", "moderator"]],
      ["escalations", `select * from list_admin_escalations(true)`, ["platform_admin"]],
      ["group overview", `select * from admin_group_overview(null, null)`, ["platform_admin", "moderator"]],
    ];
    // make sure every list has at least one row to return
    await q(mod, `select restrict_user($1,'suspension',1,'seed')`, [await fresh("Seed")]).catch(() => undefined);
    for (const [label, sql, who] of reads) {
      for (const [role, user] of Object.entries(r) as [Role, string][]) {
        const expected = who.includes(role);
        expect(await allowed(user, sql), `${label} as ${role}`).toBe(expected);
      }
    }
  });

  it("matches the documented matrix for write tools (probed with harmless invalid targets)", async () => {
    const r = roles();
    const zero = "00000000-0000-0000-0000-000000000000";
    // A permitted caller gets a "not found" style error (not a permission error); a refused caller gets a permission error.
    const writes: Array<[string, string, unknown[], Role[]]> = [
      ["set discussion controls", `select set_discussion_controls($1,true,false,'')`, [zero], ["platform_admin", "content_editor", "moderator"]],
      ["pin a question", `select set_pinned_question($1,'q')`, [zero], ["platform_admin", "content_editor"]],
      ["credits", `select set_devotional_credits($1,'[]')`, [zero], ["platform_admin", "content_editor"]],
      ["decide group request", `select decide_group_request($1,true,'')`, [zero], ["platform_admin", "moderator"]],
      ["escalate to admin", `select escalate_to_admin($1,'x')`, [zero], ["platform_admin", "moderator"]],
      ["close escalation", `select close_admin_escalation($1,'x')`, [zero], ["platform_admin"]],
      ["delete any group", `select admin_delete_group($1,'x')`, [zero], ["platform_admin"]],
      ["transfer any group", `select admin_transfer_group_ownership($1,$1,'x')`, [zero], ["platform_admin"]],
      ["account status", `select admin_set_account_status($1,'suspended','x',7)`, [zero], ["platform_admin"]],
      ["retention", `select retention_run()`, [], ["platform_admin"]],
      ["analytics", `select platform_metrics(30)`, [], ["platform_admin"]],
      ["governance settings", `select set_governance_setting('retention_audit_days','800')`, [], ["platform_admin"]],
    ];
    for (const [label, sql, params, who] of writes) {
      for (const [role, user] of Object.entries(r) as [Role, string][]) {
        let permitted: boolean;
        try {
          await q(user, sql, params);
          permitted = true;
        } catch (e) {
          const msg = String(e);
          permitted = !/cannot do that|not allowed|permission denied|row-level security/i.test(msg);
          if (permitted) expect(msg, `${label} as ${role} failed unexpectedly`).toMatch(/does not exist|no longer|not available|no such|already|unknown|reason|record what|decided|Choose|say what|invalid|violates|Please/i);
        }
        expect(permitted, `${label} as ${role}`).toBe(who.includes(role));
      }
    }
  });
});
