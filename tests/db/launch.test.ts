import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * Controlled launch and founding-school pilot (migration 0009), run against the REAL closed starting state
 * (launchDefaults): every interactive feature off, nothing assumed about any school.
 */
let h: Harness;
let admin: string, mod: string, editor: string, ann: string, ben: string, cleo: string;
let today: string;

const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });
async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0]!;
const openFlag = (k: string) => h.admin.query(`update community_settings set value = 'true' where key = $1`, [k]);
const closeFlag = (k: string) => h.admin.query(`update community_settings set value = 'false' where key = $1`, [k]);
const flagValue = async (k: string) => (await h.admin.query<{ value: unknown }>(`select value from community_settings where key = $1`, [k])).rows[0]!.value;
let n = 0;
const fresh = (first = "Pat") => h.createUser(`l${++n}@l.test`, { first, last: "Person" });
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const FLAGS = ["public_discussions_enabled", "prayer_contributions_enabled", "prayer_acknowledgements_enabled", "groups_enabled", "group_creation_enabled", "group_posting_enabled", "group_invitations_enabled"];

async function devotional(date: string, extra: { author?: string; translation?: string; grades?: string; status?: string } = {}) {
  const r = await h.admin.query<{ id: string }>(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category)
     values ('T '||$1::date::text, $1::date, 'topic', 'patience', 'John 3:16', 'John', 3, $2, $3::jsonb, $3::jsonb, $3::jsonb, $3::jsonb, 'teachers', $4::text[], 'classroom')
     returning id`,
    [date, extra.translation ?? "web", doc("x"), extra.grades ?? "{g35}"]);
  const id = r.rows[0]!.id;
  const status = extra.status ?? "published";
  if (status !== "draft") {
    await h.admin.query(`update devotionals set status = $2::devotional_status, author_name = $3, published_at = case when $2::devotional_status = 'published' then now() end, publish_at = case when $2::devotional_status = 'scheduled' then now() + interval '1 day' end where id = $1`, [id, status, extra.author ?? "A. Author"]);
  }
  return id;
}

async function makeLaunchReady() {
  await h.admin.query(`insert into platform_roles (user_id, role) values ($1, 'moderator') on conflict do nothing`, [mod]);
  await h.admin.query(`update governance_settings set value = 'true' where key = 'covenant_required'`);
  for (const k of ["covenant_reviewed", "moderation_tested", "escalation_procedure", "response_expectations", "privacy_guidance", "suspension_procedure", "legal_documents"]) {
    await q(admin, `select attest_launch($1, 'Done on the staging site with the moderators present.')`, [k]);
  }
}

beforeAll(async () => {
  h = await createDatabase({ launchDefaults: true, openFreePlan: false });
  admin = await h.createUser("root@l.test");
  mod = await h.createUser("mod@l.test");
  editor = await h.createUser("ed@l.test");
  ann = await h.createUser("ann@l.test", { first: "Ann", last: "Alder" });
  ben = await h.createUser("ben@l.test", { first: "Ben", last: "Birch" });
  cleo = await h.createUser("cleo@l.test", { first: "Cleo", last: "Cedar" });
  await h.admin.query(`insert into platform_roles (user_id, role) values ($1,'platform_admin'), ($2,'content_editor')`, [admin, editor]);
  await h.admin.query(`update governance_settings set value = 'false' where key = 'covenant_required'`);
  today = iso(0);
});
afterAll(async () => { await h.db.close(); });

// ---------------------------------------------------------------------------
describe("feature flags start closed and are independent", () => {
  it("a fresh install has every interactive feature, paid checkout and school self-service OFF, and messaging OFF", async () => {
    for (const k of [...FLAGS, "school_administration_enabled", "paid_subscriptions_enabled", "direct_messages_enabled"]) {
      expect(await flagValue(k), k).toBe(false);
    }
  });

  it("with everything closed, nobody can contribute, pray, make groups or post, even calling the database directly", async () => {
    const d = await devotional(today);
    await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hello')`, [d, ann])).rejects.toThrow();
    await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'prayer','please pray')`, [d, ann])).rejects.toThrow();
    await expect(q(ann, `select create_group('G','','','','other','private')`)).rejects.toThrow(/Educator Plus|paused|not available/i);
    // reading and the classroom are unaffected by community switches
    expect(await q(ann, `select id from devotionals where id = $1`, [d])).toHaveLength(1);
    await h.admin.query(`delete from devotionals where id = $1`, [d]);
  });

  it("each switch controls only its own feature", async () => {
    const d = await devotional(today);
    const c = (kind: string, user = ann) => q(user, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,$3,$4) returning id`, [d, user, kind, `text ${++n}`]);
    try {
      await openFlag("public_discussions_enabled");
      await c("reflection");
      await expect(c("prayer"), "prayer closed").rejects.toThrow(/paused/i);

      await openFlag("prayer_contributions_enabled");
      const prayer = (await c("prayer", ben))[0] as { id: string };
      await expect(q(ann, `select acknowledge_prayer($1)`, [prayer.id]), "acks closed").rejects.toThrow(/paused|cannot do that/i);

      await openFlag("prayer_acknowledgements_enabled");
      expect((await one<{ acknowledge_prayer: number }>(ann, `select acknowledge_prayer($1)`, [prayer.id])).acknowledge_prayer).toBe(1);

      // Pausing prayers leaves reflections and acknowledgements-already-given alone
      await closeFlag("prayer_contributions_enabled");
      await expect(c("prayer", cleo)).rejects.toThrow(/paused/i);
      await c("reflection", cleo);
    } finally {
      for (const k of FLAGS) await closeFlag(k);
      await h.admin.query(`delete from devotionals where id = $1`, [d]);
    }
  });

  it("groups: creation, posting and invitations are separate switches", async () => {
    try {
      await h.admin.query(`update plan_features set enabled = true, limit_value = null where plan_key = 'free' and feature_key = 'create_groups'`);
      await openFlag("groups_enabled");
      await expect(q(ann, `select create_group('G','d','p','g','other','private')`)).rejects.toThrow(/paused/i);
      await openFlag("group_creation_enabled");
      const gid = (await one<{ create_group: string }>(ann, `select create_group('Staff room','d','p','g','other','private')`)).create_group;
      await h.admin.query(`update community_settings set value = 'false' where key = 'group_requires_approval'`);
      await h.admin.query(`update community_groups set status = 'active' where id = $1`, [gid]);

      await expect(q(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hi')`, [gid, ann]), "posting closed").rejects.toThrow(/paused/i);
      await openFlag("group_posting_enabled");
      const p = (await one<{ id: string }>(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','hi') returning id`, [gid, ann])).id;
      await expect(q(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'prayer','pray')`, [gid, ann]), "group prayer needs the prayer switch").rejects.toThrow(/paused/i);
      await q(ann, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'a comment')`, [p, gid, ann]);

      await expect(q(ann, `insert into group_invitations (group_id, email, role, token_hash, invited_by) values ($1,'x@y.org','member','h',$2)`, [gid, ann]), "invitations closed").rejects.toThrow(/paused/i);
      await openFlag("group_invitations_enabled");
      await q(ann, `insert into group_invitations (group_id, email, role, token_hash, invited_by) values ($1,'x@y.org','member','h',$2)`, [gid, ann]);

      // pause posting only: reading what exists still works for the member, and nothing is deleted
      await closeFlag("group_posting_enabled");
      await expect(q(ann, `insert into group_comments (post_id, group_id, author_id, body) values ($1,$2,$3,'more')`, [p, gid, ann])).rejects.toThrow(/paused/i);
      expect(await q(ann, `select * from list_group_posts($1)`, [gid])).toHaveLength(1);
    } finally {
      for (const k of FLAGS) await closeFlag(k);
    }
  });

  it("school administration: self-service is closed, platform administrators and the pilot are not blocked", async () => {
    await expect(q(ann, `select create_school('Self Made')`)).rejects.toThrow(/paused/i);
    expect((await one<{ create_school: string }>(admin, `select create_school('By Platform')`)).create_school).toBeTruthy();
    await openFlag("school_administration_enabled");
    try {
      expect((await one<{ create_school: string }>(ann, `select create_school('Self Made')`)).create_school).toBeTruthy();
    } finally { await closeFlag("school_administration_enabled"); }
  });

  it("direct messaging stays off however the other switches are set, and cannot be enabled from the app", async () => {
    await expect(q(admin, `select set_community_setting('direct_messages_enabled','true')`)).rejects.toThrow(/not available in this release/i);
    expect(await flagValue("direct_messages_enabled")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("the safety gate for opening interactive features", () => {
  it("shows exactly what is missing, to moderators and administrators only", async () => {
    const rows = await q<{ key: string; ok: boolean; kind: string }>(admin, `select key, ok, kind from community_readiness()`);
    expect(rows.find((r) => r.key === "human_moderator")!.ok).toBe(false);
    expect(rows.filter((r) => r.kind === "signoff").every((r) => !r.ok)).toBe(true);
    await expect(q(ann, `select * from community_readiness()`)).rejects.toThrow(/cannot do that/i);
    await expect(q(editor, `select * from community_readiness()`)).rejects.toThrow(/cannot do that/i);
  });

  it("refuses to open ANY interactive feature until it is ready, but always allows closing", async () => {
    for (const k of FLAGS) {
      await expect(q(admin, `select set_community_setting($1, 'true')`, [k]), k).rejects.toThrow(/readiness is incomplete/i);
    }
    // Non-community switches are not gated by the community gate.
    await q(admin, `select set_community_setting('school_administration_enabled', 'true')`);
    await q(admin, `select set_community_setting('school_administration_enabled', 'false')`);
    await q(admin, `select set_community_setting('groups_enabled', 'false')`); // closing is always allowed
  });

  it("is still closed with a moderator but no sign-offs, and with sign-offs but no moderator", async () => {
    await h.admin.query(`insert into platform_roles (user_id, role) values ($1, 'moderator')`, [mod]);
    await expect(q(admin, `select set_community_setting('public_discussions_enabled','true')`)).rejects.toThrow(/readiness/i);
    await h.admin.query(`delete from platform_roles where role = 'moderator'`);
    for (const k of ["covenant_reviewed", "moderation_tested", "escalation_procedure", "response_expectations", "privacy_guidance", "suspension_procedure", "legal_documents"]) {
      await q(admin, `select attest_launch($1, 'Done on the staging site with the moderators present.')`, [k]);
    }
    await expect(q(admin, `select set_community_setting('public_discussions_enabled','true')`)).rejects.toThrow(/readiness/i);
  });

  it("opens only when a moderator exists, the covenant is required and every sign-off is recorded; the opening is audited", async () => {
    await makeLaunchReady();
    expect((await q<{ ok: boolean }>(admin, `select ok from community_readiness() where kind <> 'advisory'`)).every((r) => r.ok)).toBe(true);
    await q(admin, `select set_community_setting('public_discussions_enabled','true')`);
    expect(await flagValue("public_discussions_enabled")).toBe(true);
    const log = await h.admin.query(`select 1 from admin_audit_log where action = 'setting.public_discussions_enabled'`);
    expect(log.rows.length).toBeGreaterThan(0);
    await q(admin, `select set_community_setting('public_discussions_enabled','false')`);
  });

  it("withdrawing one sign-off, or the covenant requirement, closes the gate again", async () => {
    await q(admin, `select retract_launch_attestation('moderation_tested')`);
    await expect(q(admin, `select set_community_setting('groups_enabled','true')`)).rejects.toThrow(/readiness/i);
    await q(admin, `select attest_launch('moderation_tested', 'Rehearsal repeated with the new moderator.')`);
    await h.admin.query(`update governance_settings set value = 'false' where key = 'covenant_required'`);
    await expect(q(admin, `select set_community_setting('groups_enabled','true')`)).rejects.toThrow(/readiness/i);
    await h.admin.query(`update governance_settings set value = 'true' where key = 'covenant_required'`);
    await q(admin, `select set_community_setting('groups_enabled','true')`);
    await q(admin, `select set_community_setting('groups_enabled','false')`);
  });

  it("sign-offs need a real statement, an administrator, and a known key", async () => {
    await expect(q(admin, `select attest_launch('moderation_tested', 'ok')`)).rejects.toThrow(/what was done/i);
    await expect(q(admin, `select attest_launch('made_up_key', 'A perfectly long enough sentence.')`)).rejects.toThrow(/unknown/i);
    await expect(q(mod, `select attest_launch('moderation_tested', 'A perfectly long enough sentence.')`)).rejects.toThrow(/cannot do that/i);
    await expect(q(ann, `select retract_launch_attestation('moderation_tested')`)).rejects.toThrow(/cannot do that/i);
    await expect(q(ann, `select * from launch_attestations`)).rejects.toThrow(/permission denied/i);
  });

  it("a person cannot open anything by writing the setting table directly", async () => {
    await expect(q(admin, `update community_settings set value = 'true' where key = 'groups_enabled'`)).rejects.toThrow(/permission denied/i);
  });
});

// ---------------------------------------------------------------------------
describe("content readiness", () => {
  it("counts only approved, scheduled content, and surfaces unverified licences, missing credits and missing grade labels", async () => {
    const read = () => q<{ key: string; ok: boolean; blocking: boolean; detail: string }>(editor, `select key, ok, blocking, detail from content_readiness()`);
    const by = (rows: Awaited<ReturnType<typeof read>>, k: string) => rows.find((r) => r.key === k)!;
    let rows = await read();
    expect(by(rows, "upcoming_scheduled").ok).toBe(false);
    expect(by(rows, "prayer_prompts_reviewed").ok).toBe(false);

    // 13 days is not enough; a draft on day 14 does not help; an approved one does.
    for (let i = 0; i < 13; i++) await devotional(iso(1 + i), { status: "scheduled" });
    await devotional(iso(14), { status: "draft" });
    rows = await read();
    expect(by(rows, "upcoming_scheduled").ok).toBe(false);
    expect(by(rows, "upcoming_scheduled").detail).toMatch(/^13 of 14 days/);
    await devotional(iso(0), { status: "published" });
    rows = await read();
    expect(by(rows, "upcoming_scheduled").ok).toBe(true);

    // licence: a verified translation passes; an unverified one in use blocks
    await h.admin.query(`update bible_translations set license_verified_at = null, text_allowed = true where code = 'web'`);
    expect(by(await read(), "translations_verified").ok).toBe(false);
    await h.admin.query(`update bible_translations set license_verified_at = now() where code = 'web'`);
    expect(by(await read(), "translations_verified").ok).toBe(true);

    // authors and grade labels
    expect(by(await read(), "authors_credited").ok).toBe(true);
    // (published content is locked against edits, so these are separate devotionals)
    const noAuthor = await devotional(iso(20), { status: "scheduled", author: "" });
    expect(by(await read(), "authors_credited").ok).toBe(false);
    await h.admin.query(`delete from devotionals where id = $1`, [noAuthor]);
    expect(by(await read(), "authors_credited").ok).toBe(true);
    const noGrade = await devotional(iso(21), { status: "scheduled", grades: "{}" });
    const g = by(await read(), "grade_levels");
    expect([g.ok, g.blocking]).toEqual([false, false]);
    await h.admin.query(`delete from devotionals where id = $1`, [noGrade]);

    // prayer prompts need a human sign-off
    await q(admin, `select attest_launch('prayer_prompts_reviewed', 'Closing prayers read through by the chaplain on the review day.')`);
    expect(by(await read(), "prayer_prompts_reviewed").ok).toBe(true);
    expect(by(await read(), "discussion_only_approved").ok).toBe(true);
  });

  it("is visible to editors and administrators only", async () => {
    await expect(q(ann, `select * from content_readiness()`)).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select * from content_readiness()`)).rejects.toThrow(/cannot do that/i);
    expect((await q(admin, `select * from content_readiness()`)).length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
describe("founding-school pilot", () => {
  let pilot: string, ps: string, school: string, ownerCode: string, facultyCode: string;
  let owner: string, t1: string, t2: string;

  beforeAll(async () => {
    owner = await fresh("Olive");
    t1 = await fresh("Tess");
    t2 = await fresh("Tom");
  });

  it("only platform administrators run a pilot", async () => {
    for (const who of [ann, mod, editor]) {
      await expect(q(who, `select pilot_create('X', $1, $2, 10)`, [iso(0), iso(30)]), who).rejects.toThrow(/cannot do that/i);
      await expect(q(who, `select * from pilot_overview()`)).rejects.toThrow(/cannot do that/i);
    }
    for (const t of ["pilot_programs", "pilot_schools", "pilot_access_codes", "pilot_redemptions", "pilot_interest", "usage_by_school", "pilot_code_attempts"]) {
      await expect(q(ann, `select * from ${t}`), t).rejects.toThrow(/permission denied/i);
    }
  });

  it("dates must make sense", async () => {
    await expect(q(admin, `select pilot_create('Bad', $1, $2, 10)`, [iso(10), iso(5)])).rejects.toThrow(/check the name, the dates/i);
    await expect(q(admin, `select pilot_create('Long', $1, $2, 10)`, [iso(0), iso(800)])).rejects.toThrow(/check the name, the dates/i);
  });

  it("a school is a PROSPECT: nothing about it works until a person records that it agreed, and how", async () => {
    pilot = (await one<{ pilot_create: string }>(admin, `select pilot_create('Founding Schools 2026', $1, $2, 3)`, [iso(-1), iso(60)])).pilot_create;
    await q(admin, `select pilot_set_status($1, 'active')`, [pilot]);
    ps = (await one<{ pilot_add_school: string }>(admin, `select pilot_add_school($1, 'Grace Christian Academy', 'Ms. Reyes')`, [pilot])).pilot_add_school;
    await expect(q(admin, `select pilot_add_school($1, 'Grace Christian Academy')`, [pilot])).rejects.toThrow(/already in this pilot/i);
    const row = (await q<{ stage: string }>(admin, `select stage from pilot_school_rows($1)`, [pilot]))[0]!;
    expect(row.stage).toBe("prospect");
    await expect(q(admin, `select pilot_create_school($1)`, [ps])).rejects.toThrow(/agreement first/i);
    await expect(q(admin, `select pilot_create_code($1, 'faculty', 5, $2)`, [ps, iso(30)])).rejects.toThrow(/agreed/i);
    await expect(q(admin, `select pilot_set_school_stage($1, 'agreed', 'yes')`, [ps])).rejects.toThrow(/record how the school agreed/i);
    await expect(q(admin, `select pilot_set_school_stage($1, 'active', 'x')`, [ps])).rejects.toThrow(/choose prospect/i);
    await q(admin, `select pilot_set_school_stage($1, 'agreed', 'Signed pilot letter from the head of school, received by email.')`, [ps]);
    school = (await one<{ pilot_create_school: string }>(admin, `select pilot_create_school($1)`, [ps])).pilot_create_school;
    expect(school).toBeTruthy();
    expect((await one<{ pilot_create_school: string }>(admin, `select pilot_create_school($1)`, [ps])).pilot_create_school).toBe(school);
  });

  it("codes are single-purpose, hashed, shown once, and bounded by the pilot's dates", async () => {
    await expect(q(admin, `select pilot_create_code($1, 'owner', 3, $2)`, [ps, iso(30)])).rejects.toThrow(/owner code is single-use/i);
    await expect(q(admin, `select pilot_create_code($1, 'faculty', 5, $2)`, [ps, iso(-1)])).rejects.toThrow(/expire in the future/i);
    await expect(q(admin, `select pilot_create_code($1, 'faculty', 5, $2)`, [ps, iso(200)])).rejects.toThrow(/no later than the end/i);
    ownerCode = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'owner', 1, $2, 'Head of school')`, [ps, iso(30)])).pilot_create_code;
    facultyCode = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'faculty', 2, $2, 'Faculty')`, [ps, iso(30)])).pilot_create_code;
    expect(ownerCode).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(ownerCode).not.toBe(facultyCode);
    const stored = JSON.stringify((await h.admin.query(`select * from pilot_access_codes`)).rows);
    expect(stored).not.toContain(ownerCode);
    expect(stored).not.toContain(ownerCode.replace(/-/g, ""));
    const listed = JSON.stringify(await q(admin, `select * from pilot_list_codes($1)`, [ps]));
    expect(listed).not.toContain(ownerCode);
    expect(listed).toContain(ownerCode.replace(/-/g, "").slice(-4));
  });

  it("redeeming enrolls, assigns a seat while seats last, grants the pilot school license, and is repeat-safe", async () => {
    const feature = async (u: string) => (await one<{ school_has_feature: boolean }>(u, `select school_has_feature($1, 'school_groups')`, [school])).school_has_feature;
    expect(await feature(owner)).toBe(false);

    const r1 = (await one<{ redeem_pilot_code: Record<string, unknown> }>(owner, `select redeem_pilot_code($1)`, [ownerCode])).redeem_pilot_code;
    expect(r1).toMatchObject({ ok: true, role: "owner", seat: true, school_name: "Grace Christian Academy" });
    expect(await feature(owner)).toBe(true);
    // "ABCD-efgh-..." typed in lower case and without dashes still works for faculty, once per person
    const typed = facultyCode.toLowerCase().replace(/-/g, "");
    expect((await one<{ redeem_pilot_code: { ok: boolean; already: boolean } }>(t1, `select redeem_pilot_code($1)`, [typed])).redeem_pilot_code).toMatchObject({ ok: true, already: false });
    expect((await one<{ redeem_pilot_code: { ok: boolean; already: boolean } }>(t1, `select redeem_pilot_code($1)`, [facultyCode])).redeem_pilot_code).toMatchObject({ ok: true, already: true });
    expect(await feature(t1)).toBe(true);
    expect((await h.admin.query(`select uses from pilot_access_codes where code_hash = pilot_code_hash($1)`, [facultyCode])).rows[0]).toEqual({ uses: 1 });
    expect((await h.admin.query(`select stage from pilot_schools where id = $1`, [ps])).rows[0]).toEqual({ stage: "active" });
    // the pilot never creates or fakes a subscription
    expect((await h.admin.query(`select 1 from subscriptions where school_id = $1`, [school])).rows).toHaveLength(0);
    // someone outside the pilot gets nothing
    expect(await feature(ann)).toBe(false);
  });

  it("a code cannot be used past its limit, a second owner code makes an administrator, and the seat limit is respected", async () => {
    expect((await one<{ redeem_pilot_code: { ok: boolean } }>(t2, `select redeem_pilot_code($1)`, [facultyCode])).redeem_pilot_code).toMatchObject({ ok: true });
    const third = await fresh();
    expect((await one<{ redeem_pilot_code: { ok: boolean; reason: string } }>(third, `select redeem_pilot_code($1)`, [facultyCode])).redeem_pilot_code).toMatchObject({ ok: false, reason: "exhausted" });
    const second = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'owner', 1, $2)`, [ps, iso(30)])).pilot_create_code;
    const co = await fresh("Co");
    expect((await one<{ redeem_pilot_code: { role: string; seat: boolean } }>(co, `select redeem_pilot_code($1)`, [second])).redeem_pilot_code).toMatchObject({ role: "admin", seat: false });
    // pilot seat limit is 3: owner, Tess and Tom hold them, so the fourth person is enrolled without a seat
    expect((await h.admin.query(`select count(*)::int c from school_seats where school_id = $1`, [school])).rows[0]).toEqual({ c: 3 });
  });

  it("wrong, revoked, expired and out-of-window codes are all refused the same way, and guessing is throttled", async () => {
    const guesser = await fresh("Guess");
    for (let i = 0; i < 8; i++) {
      expect((await one<{ redeem_pilot_code: { ok: boolean; reason: string } }>(guesser, `select redeem_pilot_code($1)`, [`WRNG-${1000 + i}-ZZZZ`])).redeem_pilot_code).toEqual({ ok: false, reason: "invalid" });
    }
    // even the right code is now refused for a while: the limit counted, because failures are returned, not rolled back
    expect((await one<{ redeem_pilot_code: { ok: boolean; reason: string } }>(guesser, `select redeem_pilot_code($1)`, [facultyCode])).redeem_pilot_code).toEqual({ ok: false, reason: "throttled" });

    const fresh1 = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'faculty', 5, $2)`, [ps, iso(30)])).pilot_create_code;
    const codeId = (await h.admin.query<{ id: string }>(`select id from pilot_access_codes where code_hash = pilot_code_hash($1)`, [fresh1])).rows[0]!.id;
    const user = await fresh("Rev");
    await q(admin, `select pilot_revoke_code($1)`, [codeId]);
    expect((await one<{ redeem_pilot_code: { reason: string } }>(user, `select redeem_pilot_code($1)`, [fresh1])).redeem_pilot_code.reason).toBe("invalid");
    await h.admin.query(`update pilot_access_codes set revoked_at = null, expires_at = now() - interval '1 minute' where id = $1`, [codeId]);
    expect((await one<{ redeem_pilot_code: { reason: string } }>(user, `select redeem_pilot_code($1)`, [fresh1])).redeem_pilot_code.reason).toBe("invalid");
    await h.admin.query(`update pilot_access_codes set expires_at = now() + interval '1 day' where id = $1`, [codeId]);
    await h.admin.query(`update pilot_programs set starts_on = current_date + 3 where id = $1`, [pilot]);
    expect((await one<{ redeem_pilot_code: { reason: string } }>(user, `select redeem_pilot_code($1)`, [fresh1])).redeem_pilot_code.reason).toBe("invalid");
    await h.admin.query(`update pilot_programs set starts_on = current_date - 1 where id = $1`, [pilot]);
    await h.admin.query(`update pilot_schools set stage = 'prospect', agreed_at = null, agreed_note = null where id = $1`, [ps]);
    expect((await one<{ redeem_pilot_code: { reason: string } }>(user, `select redeem_pilot_code($1)`, [fresh1])).redeem_pilot_code.reason).toBe("invalid");
    await h.admin.query(`update pilot_schools set stage = 'active', agreed_at = now(), agreed_note = 'Signed pilot letter from the head of school.' where id = $1`, [ps]);
    expect((await one<{ redeem_pilot_code: { ok: boolean } }>(user, `select redeem_pilot_code($1)`, [fresh1])).redeem_pilot_code.ok).toBe(true);
  });

  it("an unverified email cannot redeem, and nobody signed out can call it", async () => {
    const nv = await h.createUser("nv@l.test", { verified: false });
    await expect(q(nv, `select redeem_pilot_code($1)`, [facultyCode])).rejects.toThrow(/verify your email/i);
    await expect(h.asAnon(async () => h.db.query(`select redeem_pilot_code('AAAA-BBBB-CCCC')`))).rejects.toThrow(/permission denied/i);
  });

  it("declining a school revokes its codes", async () => {
    const p2 = (await one<{ pilot_add_school: string }>(admin, `select pilot_add_school($1, 'Maybe Academy')`, [pilot])).pilot_add_school;
    await q(admin, `select pilot_set_school_stage($1, 'agreed', 'Verbal agreement confirmed by phone, letter to follow.')`, [p2]);
    await q(admin, `select pilot_create_school($1)`, [p2]);
    const code = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'faculty', 5, $2)`, [p2, iso(30)])).pilot_create_code;
    await q(admin, `select pilot_set_school_stage($1, 'declined')`, [p2]);
    expect((await one<{ redeem_pilot_code: { ok: boolean } }>(await fresh(), `select redeem_pilot_code($1)`, [code])).redeem_pilot_code.ok).toBe(false);
  });

  it("members see their pilot and its end date; others and signed-out visitors see nothing", async () => {
    const mine = (await one<{ my_pilot: Record<string, unknown> }>(t1, `select my_pilot()`)).my_pilot;
    expect(mine).toMatchObject({ pilot_name: "Founding Schools 2026", school_name: "Grace Christian Academy", role: "faculty", status: "active" });
    expect(Number(mine.days_left)).toBeGreaterThan(50);
    expect((await one<{ my_pilot: unknown }>(ann, `select my_pilot()`)).my_pilot).toBeNull();
    expect((await one<{ school_pilot_info: unknown }>(ann, `select school_pilot_info($1)`, [school])).school_pilot_info).toBeNull();
    expect((await one<{ school_pilot_info: { seat_limit: number } }>(t1, `select school_pilot_info($1)`, [school])).school_pilot_info.seat_limit).toBe(3);
  });

  it("subscription interest is recorded by the right people and moves the conversion stage", async () => {
    await expect(q(ann, `select express_pilot_interest('individual_plus')`)).rejects.toThrow(/not part of a pilot/i);
    await expect(q(t1, `select express_pilot_interest('school_license')`)).rejects.toThrow(/owner or administrator/i);
    await expect(q(t1, `select express_pilot_interest('lifetime_free')`)).rejects.toThrow(/unknown choice/i);
    await q(t1, `select express_pilot_interest('individual_plus', 'Would use the archive.')`);
    await q(t1, `select express_pilot_interest('not_now', 'Maybe after Christmas.')`); // changing your mind replaces it
    expect((await h.admin.query(`select count(*)::int c from pilot_interest where user_id = $1`, [t1])).rows[0]).toEqual({ c: 1 });
    await q(owner, `select express_pilot_interest('school_license')`);
    expect((await q<{ conversion_stage: string }>(admin, `select conversion_stage from pilot_school_rows($1) where school_name = 'Grace Christian Academy'`, [pilot]))[0]!.conversion_stage).toBe("interested");
    await q(admin, `select pilot_set_conversion($1, 'proposal_sent', 'Quote sent to the bursar.')`, [ps]);
  });

  it("metrics withhold people-level numbers for a small group", async () => {
    const p2 = (await one<{ pilot_create: string }>(admin, `select pilot_create('Tiny pilot', $1, $2, 5)`, [iso(-1), iso(30)])).pilot_create;
    const s2 = (await one<{ pilot_add_school: string }>(admin, `select pilot_add_school($1, 'Tiny Academy')`, [p2])).pilot_add_school;
    await q(admin, `select pilot_set_school_stage($1, 'agreed', 'Agreement confirmed in writing by the principal.')`, [s2]);
    const m = (await one<{ pilot_metrics: Record<string, unknown> }>(admin, `select pilot_metrics($1)`, [p2])).pilot_metrics;
    expect(m.suppressed).toBe(true);
    expect(m.enrolled_educators).toBe("fewer than 5");
    for (const k of ["activated_educators", "weekly_active_educators", "devotional_sessions", "contributions_by_kind", "group_participation"]) expect(m[k], k).toBeUndefined();
  });

  it("metrics are totals only, and never contain people, private prayers or private group text", async () => {
    const extra = [await fresh(), await fresh(), await fresh()];
    const codeMany = (await one<{ pilot_create_code: string }>(admin, `select pilot_create_code($1, 'faculty', 10, $2)`, [ps, iso(30)])).pilot_create_code;
    for (const u of extra) await q(u, `select redeem_pilot_code($1)`, [codeMany]);
    const enrolled = (await h.admin.query<{ c: number }>(
      `select count(distinct m.user_id)::int c from school_memberships m where m.school_id = $1 and m.status = 'active'`, [school])).rows[0]!.c;
    expect(enrolled).toBeGreaterThanOrEqual(5);

    for (const u of [owner, t1, t2]) await h.admin.query(`update profiles set onboarding_completed_at = now(), last_active_on = current_date where id = $1`, [u]);
    for (const u of [owner, t1, t1, t2]) await q(u, `select record_usage('devotional_view')`);
    await q(t1, `select record_usage('presentation_open')`);
    await q(ann, `select record_usage('devotional_view')`); // not in any pilot: counted globally, never per school

    const d = await devotional(iso(-3));
    await h.admin.query(
      `insert into community_contributions (devotional_id, user_id, kind, body, visibility) values
         ($1,$2,'prayer','SECRET-PRAYER-TEXT about my family','private'),
         ($1,$3,'reflection','A public reflection on patience.','named')`, [d, t1, t2]);

    const m = (await one<{ pilot_metrics: Record<string, any> }>(admin, `select pilot_metrics($1)`, [pilot])).pilot_metrics;
    expect(m.suppressed).toBe(false);
    expect(m.enrolled_educators).toBe(enrolled);
    expect(m.activated_educators).toBe(3);
    expect(m.weekly_active_educators).toBe(3);
    expect(Number(m.devotional_sessions)).toBe(4);
    expect(Number(m.presentation_opens)).toBe(1);
    expect(m.contributions_by_kind).toEqual({ reflection: 1 }); // the private prayer is not even counted by kind
    expect(Number(m.codes.redemptions)).toBeGreaterThanOrEqual(5);

    const text = JSON.stringify(m);
    for (const secret of ["SECRET-PRAYER-TEXT", "public reflection", "@l.test", owner, t1, t2, "Olive", "Tess"]) expect(text, secret).not.toContain(secret);
    // no per-person keys anywhere
    expect(text).not.toMatch(/user_id|"email"|@|"name":"(Olive|Tess|Tom)/);
  });

  it("metrics and school rows are visible to platform administrators only", async () => {
    for (const who of [ann, t1, owner, mod]) await expect(q(who, `select pilot_metrics($1)`, [pilot])).rejects.toThrow(/cannot do that/i);
    for (const who of [ann, t1, owner]) await expect(q(who, `select * from pilot_school_rows($1)`, [pilot])).rejects.toThrow(/cannot do that/i);
  });

  it("the pilot licence expires on its end date with no job, and never outlives the pilot", async () => {
    const feature = async (u: string) => (await one<{ school_has_feature: boolean }>(u, `select school_has_feature($1, 'school_groups')`, [school])).school_has_feature;
    expect(await feature(t1)).toBe(true);
    await h.admin.query(`update pilot_programs set starts_on = current_date - 30, ends_on = current_date - 1 where id = $1`, [pilot]);
    expect(await feature(t1)).toBe(false);
    await h.admin.query(`update pilot_programs set ends_on = current_date + 10 where id = $1`, [pilot]);
    expect(await feature(t1)).toBe(true);
    await q(admin, `select pilot_set_status($1, 'closed')`, [pilot]);
    expect(await feature(t1)).toBe(false);
    await q(admin, `select pilot_set_status($1, 'active')`, [pilot]);
    await h.admin.query(`update pilot_schools set stage = 'declined' where id = $1`, [ps]);
    expect(await feature(t1)).toBe(false);
    await h.admin.query(`update pilot_schools set stage = 'active' where id = $1`, [ps]);
    expect(await feature(t1)).toBe(true);
  });

  it("a member of one pilot school learns nothing about another", async () => {
    const other = (await one<{ pilot_add_school: string }>(admin, `select pilot_add_school($1, 'Other Christian School')`, [pilot])).pilot_add_school;
    await q(admin, `select pilot_set_school_stage($1, 'agreed', 'Agreement confirmed by email from the head.')`, [other]);
    const os = (await one<{ pilot_create_school: string }>(admin, `select pilot_create_school($1)`, [other])).pilot_create_school;
    expect((await one<{ school_pilot_info: unknown }>(t1, `select school_pilot_info($1)`, [os])).school_pilot_info).toBeNull();
    expect((await one<{ school_has_feature: boolean }>(t1, `select school_has_feature($1, 'school_groups')`, [os])).school_has_feature).toBe(false);
    await expect(q(t1, `select * from pilot_list_codes($1)`, [other])).rejects.toThrow(/cannot do that/i);
  });
});

// ---------------------------------------------------------------------------
describe("feedback, bug reports and feature requests", () => {
  let u: string, v: string;
  beforeAll(async () => { u = await fresh("Fee"); v = await fresh("Dback"); });
  const submit = (who: string, kind: string, o: { title?: string; body?: string; ratings?: Record<string, unknown>; willingness?: string | null; page?: string | null; severity?: string | null } = {}) =>
    one<{ submit_feedback: string }>(who, `select submit_feedback($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [kind, o.title ?? "A title", o.body ?? "Some honest words here.", JSON.stringify(o.ratings ?? {}), o.willingness ?? null, o.page ?? null, o.severity ?? null]);

  it("a survey keeps ratings and willingness; they are validated", async () => {
    await submit(u, "survey", { title: "Pilot survey", ratings: { ease_of_use: 5, classroom_presentation: 4, time_saved: 3 }, willingness: "maybe" });
    await expect(submit(u, "survey", { ratings: { ease_of_use: 9 } })).rejects.toThrow(/1 to 5/);
    await expect(submit(u, "survey", { ratings: { ease_of_use: 3.5 } })).rejects.toThrow(/1 to 5/);
    await expect(submit(u, "survey", { ratings: { holiness: 5 } })).rejects.toThrow(/1 to 5/);
    await expect(submit(u, "survey", { ratings: { ease_of_use: 4 }, willingness: "definitely" })).rejects.toThrow(/check what you entered/i);
    await expect(submit(u, "survey", { ratings: {}, body: "" })).rejects.toThrow(/at least one question/i);
    await expect(submit(u, "gossip")).rejects.toThrow(/unknown kind/i);
    await expect(submit(u, "bug", { body: "short" })).rejects.toThrow(/say a little more/i);
  });

  it("bug reports and feature requests are accepted; only an in-app page path is kept", async () => {
    await submit(v, "bug", { title: "Slide cut off", body: "The verse is cut off on the projector.", severity: "annoying", page: "/present/2026-11-14" });
    await submit(v, "feature", { title: "Print view", body: "A print layout for the lesson plan." });
    await submit(v, "bug", { title: "Odd link", body: "Something on a strange address.", page: "https://evil.example/x?token=abc" });
    const rows = (await h.admin.query<{ page_path: string | null; kind: string }>(`select page_path, kind from feedback_items where user_id = $1`, [v])).rows;
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.page_path === "/present/2026-11-14")).toBe(true);
    expect(rows.every((r) => r.page_path === null || r.page_path.startsWith("/"))).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("evil.example");
  });

  it("limits how fast anyone can submit", async () => {
    const w = await fresh("Rate");
    let refused = 0;
    for (let i = 0; i < 12; i++) {
      try { await submit(w, "feature", { title: `Idea ${i}`, body: `Idea number ${i} for the team.` }); } catch { refused++; }
    }
    expect(refused).toBeGreaterThanOrEqual(4);
  });

  it("people see only their own items; administrators triage and see all; nobody else reads feedback", async () => {
    expect((await q(u, `select id from feedback_items`)).length).toBeGreaterThan(0);
    const mineCount = (await h.admin.query<{ c: number }>(`select count(*)::int c from feedback_items where user_id = $1`, [u])).rows[0]!.c;
    expect(await q(u, `select id from feedback_items`)).toHaveLength(mineCount);
    await expect(q(u, `select admin_note from feedback_items`)).rejects.toThrow(/permission denied/i);
    await expect(q(u, `select * from list_feedback()`)).rejects.toThrow(/cannot do that/i);
    await expect(q(mod, `select * from list_feedback()`)).rejects.toThrow(/cannot do that/i);
    const rows = await q<{ id: string; kind: string }>(admin, `select * from list_feedback()`);
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const bug = rows.find((r) => r.kind === "bug")!;
    await q(admin, `select triage_feedback($1, 'triaged', 'high', 'classroom_presentation', 'Reproduced on the projector.')`, [bug.id]);
    expect((await h.admin.query(`select status, priority from feedback_items where id = $1`, [bug.id])).rows[0]).toEqual({ status: "triaged", priority: "high" });
    await expect(q(u, `select triage_feedback($1, 'done', 'low', 'x')`, [bug.id])).rejects.toThrow(/cannot do that/i);
    await expect(q(u, `update feedback_items set status = 'done' where id = $1`, [bug.id])).rejects.toThrow(/permission denied/i);
    await expect(q(admin, `select triage_feedback($1, 'launched', 'high', 'x')`, [bug.id])).rejects.toThrow(/check the status/i);
  });

  it("settled feedback is purged by the retention job; open items are not", async () => {
    const id = (await h.admin.query<{ id: string }>(`insert into feedback_items (user_id, kind, title, body, status, created_at, updated_at)
      values ($1,'feature','Old','Old settled idea.','done', now() - interval '800 days', now() - interval '800 days') returning id`, [u])).rows[0]!.id;
    const open = (await h.admin.query<{ id: string }>(`insert into feedback_items (user_id, kind, title, body, status, created_at, updated_at)
      values ($1,'feature','Old open','Old open idea.','new', now() - interval '800 days', now() - interval '800 days') returning id`, [u])).rows[0]!.id;
    await h.admin.query(`select retention_run()`);
    expect((await h.admin.query(`select 1 from feedback_items where id = $1`, [id])).rows).toHaveLength(0);
    expect((await h.admin.query(`select 1 from feedback_items where id = $1`, [open])).rows).toHaveLength(1);
  });
});
