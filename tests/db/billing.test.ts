import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Harness } from "./harness";

/**
 * Subscriptions, entitlements and school licensing, against the real migrations.
 * These run with the real default plan matrix (the free plan is NOT opened up here).
 */

let h: Harness;
let editor: string, platformAdmin: string, moderator: string;
let today: string, old: string, todayPlus: string, oldPlus: string;

const DENIED = /row-level security|permission denied/i;
const doc = (t: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: t }] }] });

async function q<T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) {
  return h.as(user, async () => (await h.db.query<T & object>(sql, params)).rows);
}
const one = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => (await q<T>(user, sql, params))[0]!;
const sys = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await h.admin.query<T & object>(sql, params)).rows;

let n = 0;
const person = (first = "Pat") => h.createUser(`b${++n}@b.test`, { first, last: `P${n}` });

async function devotional(date: string, level: "free" | "plus", title: string) {
  const [r] = await sys<{ id: string }>(
    `insert into devotionals (title, devotional_date, daily_topic, category_slug, scripture_reference, scripture_book, scripture_chapter,
       translation_code, reflection, prayer, discussion_question, practical_application, audience, grade_levels, educational_category,
       status, access_level)
     values ($1, $2::date, 'topic', 'patience', 'John 3:16', 'John', 3, 'web', $3::jsonb, $3::jsonb, $3::jsonb, $3::jsonb,
             'teachers', '{g35}', 'classroom', 'published', $4) returning id`,
    [title, date, doc("Secret body text"), level],
  );
  return r!.id;
}

// ----- Stripe-shaped events, as the webhook route would pass them -----
const PRICE = { plus_month: "price_plus_m", plus_year: "price_plus_y", school_month: "price_sch_m", school_year: "price_sch_y" };
let evSeq = 0;
const epoch = (d: Date) => Math.floor(d.getTime() / 1000);
const days = (k: number) => new Date(Date.now() + k * 86400_000);

function subEvent(
  type: string,
  o: {
    id?: string; sub: string; customer: string; price: string; status: string; created?: Date; end?: Date;
    owner?: { type: "user" | "school"; id: string }; qty?: number; cancelAtEnd?: boolean; trialEnd?: Date;
  },
) {
  return {
    id: o.id ?? `evt_${++evSeq}`,
    type,
    created: epoch(o.created ?? new Date()),
    data: {
      object: {
        id: o.sub,
        customer: o.customer,
        status: o.status,
        cancel_at_period_end: o.cancelAtEnd ?? false,
        trial_end: o.trialEnd ? epoch(o.trialEnd) : null,
        metadata: o.owner ? { owner_type: o.owner.type, owner_id: o.owner.id } : {},
        items: { data: [{ quantity: o.qty ?? 1, price: { id: o.price }, current_period_start: epoch(days(-1)), current_period_end: epoch(o.end ?? days(30)) }] },
      },
    },
  };
}
const apply = async (event: unknown) => (await sys<{ r: string }>(`select billing_apply_event($1::jsonb) as r`, [JSON.stringify(event)]))[0]!.r;

let subN = 0;
/** An individual on Educator Plus through a webhook, the way production does it. */
async function makePlus(user: string, opts: { status?: string; end?: Date; interval?: "month" | "year" } = {}) {
  const sub = `sub_${++subN}`;
  await apply(subEvent("customer.subscription.created", {
    sub, customer: `cus_${sub}`, price: opts.interval === "month" ? PRICE.plus_month : PRICE.plus_year,
    status: opts.status ?? "active", end: opts.end, owner: { type: "user", id: user },
  }));
  return sub;
}
async function makeSchool(owner: string, seats: number, opts: { status?: string; end?: Date } = {}) {
  const [s] = await q<{ create_school: string }>(owner, `select create_school('School ${++n}')`);
  const school = s!.create_school;
  const sub = `sub_${++subN}`;
  await apply(subEvent("customer.subscription.created", {
    sub, customer: `cus_${sub}`, price: PRICE.school_year, status: opts.status ?? "active", qty: seats, end: opts.end,
    owner: { type: "school", id: school },
  }));
  return { school, sub };
}
const addMember = (school: string, user: string, role = "faculty") =>
  sys(`insert into school_memberships (school_id, user_id, role) values ($1,$2,$3)`, [school, user, role]);
const features = async (user: string) => (await one<{ my_entitlements: { plans: string[]; features: Record<string, { enabled: boolean; limit: number | null }> } }>(user, `select my_entitlements()`)).my_entitlements;
const readable = async (user: string, id: string) => (await q(user, `select id from devotionals where id = $1`, [id])).length === 1;

beforeAll(async () => {
  h = await createDatabase();
  editor = await h.createUser("ed@b.test");
  platformAdmin = await h.createUser("root@b.test");
  moderator = await h.createUser("mod@b.test");
  await sys(`insert into platform_roles (user_id, role) values ($1,'content_editor'), ($2,'platform_admin'), ($3,'moderator')`, [editor, platformAdmin, moderator]);
  const d = (k: number) => new Date(Date.now() + k * 86400_000).toISOString().slice(0, 10);
  today = await devotional(d(0), "free", "Today free");
  old = await devotional(d(-90), "free", "Old free");
  todayPlus = await devotional(d(1), "plus", "Today plus");
  oldPlus = await devotional(d(-91), "plus", "Old plus");
  // Prices are configuration. Production sets real Stripe price ids; the tests use placeholders.
  for (const [key, id] of [["plus", "month"], ["plus", "year"], ["school", "month"], ["school", "year"]] as const) {
    await sys(`update plan_prices set stripe_price_id = $3, active = true, currency = 'usd', unit_amount = 100 where plan_key = $1 and plan_interval = $2`,
      [key, id, PRICE[`${key}_${id}` as keyof typeof PRICE]]);
  }
});
afterAll(async () => { await h.db.close(); });

describe("plan configuration is data, with no hard-coded prices", () => {
  it("ships three plans, a full feature matrix, and no price amounts", async () => {
    const fresh = await createDatabase();
    try {
      const plans = (await fresh.db.query<{ key: string }>(`select key from plans order by sort`)).rows.map((r) => r.key);
      expect(plans).toEqual(["free", "plus", "school"]);
      const matrix = await fresh.db.query(`select 1 from plan_features`);
      const f = await fresh.db.query(`select count(*)::int as c from features`);
      expect(matrix.rows.length).toBe(3 * (f.rows[0] as { c: number }).c);
      const prices = await fresh.db.query<{ unit_amount: number | null; stripe_price_id: string | null; active: boolean }>(`select * from plan_prices`);
      expect(prices.rows.every((p) => p.unit_amount === null && p.stripe_price_id === null && !p.active)).toBe(true);
    } finally { await fresh.db.close(); }
  });

  it("visitors may read the public comparison but never the Stripe price ids", async () => {
    expect((await h.asAnon(() => h.db.query(`select key from plans`))).rows.length).toBe(3);
    expect((await h.asAnon(() => h.db.query(`select plan_key, unit_amount from plan_prices where active`))).rows.length).toBe(4);
    await expect(h.asAnon(() => h.db.query(`select stripe_price_id from plan_prices`))).rejects.toThrow(DENIED);
    await expect(h.asAnon(() => h.db.query(`select * from subscriptions`))).rejects.toThrow(DENIED);
  });

  it("only a platform administrator can change entitlements, and changing them needs no code", async () => {
    const ann = await person();
    await expect(q(ann, `select admin_set_plan_feature('free','premium_devotionals',true,null)`)).rejects.toThrow(/administrators only/i);
    await expect(q(editor, `select admin_set_plan_feature('free','premium_devotionals',true,null)`)).rejects.toThrow(/administrators only/i);
    expect(await readable(ann, todayPlus)).toBe(false);
    await q(platformAdmin, `select admin_set_plan_feature('free','premium_devotionals',true,null)`);
    try {
      expect(await readable(ann, todayPlus)).toBe(true);
    } finally {
      await q(platformAdmin, `select admin_set_plan_feature('free','premium_devotionals',false,null)`);
    }
    expect(await readable(ann, todayPlus)).toBe(false);
  });
});

describe("free educators", () => {
  it("get today's free devotional and the recent archive, but not Plus content or the older archive", async () => {
    const ann = await person();
    expect(await readable(ann, today)).toBe(true);
    expect(await readable(ann, old)).toBe(false);
    expect(await readable(ann, todayPlus)).toBe(false);
    expect(await readable(ann, oldPlus)).toBe(false);
    const e = await features(ann);
    expect(e.plans).toEqual(["free"]);
    expect(e.features.devotional_archive_days).toMatchObject({ enabled: true, limit: 30 });
    expect(e.features.premium_devotionals!.enabled).toBe(false);
  });

  it("see only a teaser of locked devotionals: a title, never the body", async () => {
    const ann = await person();
    const rows = await q<Record<string, unknown>>(ann, `select * from locked_teasers(10, 0)`);
    expect(rows.map((r) => r.title)).toEqual(expect.arrayContaining(["Today plus", "Old free", "Old plus"]));
    expect(JSON.stringify(rows)).not.toContain("Secret body text");
    const [info] = await q<{ reason: string }>(ann, `select * from devotional_lock_info($1)`, [todayPlus]);
    expect(info!.reason).toBe("plus");
    expect(await q(ann, `select * from devotional_lock_info($1)`, [today])).toHaveLength(0);
  });

  it("cannot read locked devotionals through any route: tables, search, or community", async () => {
    const ann = await person();
    expect((await q(ann, `select id from devotionals where title like '%plus%' or title like 'Old%'`))).toHaveLength(0);
    const hits = await q<{ id: string }>(ann, `select id from search_devotionals(null,null,null,null,null,null,null,true,50,0)`);
    expect(hits.map((r) => r.id)).toEqual([today]);
    expect((await one<{ devotional_is_live: boolean }>(ann, `select devotional_is_live($1)`, [todayPlus])).devotional_is_live).toBe(false);
    await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hello')`, [todayPlus, ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1,$2,true)`, [ann, oldPlus])).rejects.toThrow(DENIED);
  });

  it("do not get advanced filters, but keyword and Scripture search work", async () => {
    const ann = await person();
    const filtered = await q<{ id: string }>(ann, `select id from search_devotionals(null,'no-such-category','g99',null,null,null,null,true,50,0)`);
    expect(filtered.map((r) => r.id)).toEqual([today]); // the filters are ignored for free callers
    const kw = await q<{ id: string }>(ann, `select id from search_devotionals('Today',null,null,null,null,null,null,true,50,0)`);
    expect(kw.map((r) => r.id)).toEqual([today]);
    const ref = await q<{ id: string }>(ann, `select id from search_devotionals(null,null,null,null,null,null,null,true,50,0,'John',3)`);
    expect(ref.map((r) => r.id)).toEqual([today]);
  });

  it("can save a limited number of bookmarks; existing ones are never removed", async () => {
    const ann = await person();
    await sys(`update plan_features set limit_value = 2 where plan_key = 'free' and feature_key = 'bookmarks_limit'`);
    try {
      const day = (k: number) => new Date(Date.now() + k * 86400_000).toISOString().slice(0, 10);
      const a = await devotional(day(2), "free", "Bm A");
      const b = await devotional(day(3), "free", "Bm B");
      const up = `insert into devotional_user_state (user_id, devotional_id, bookmarked) values ($1,$2,true)
                  on conflict (user_id, devotional_id) do update set bookmarked = excluded.bookmarked`;
      await q(ann, up, [ann, today]);
      await q(ann, up, [ann, a]);
      await q(ann, up, [ann, a]); // re-saving something already saved is not "one more"
      await expect(q(ann, up, [ann, b])).rejects.toThrow(/limit for saved devotionals/i);
      await q(ann, `update devotional_user_state set bookmarked = false where devotional_id = $1`, [a]);
      await q(ann, up, [ann, b]);
      // Raising the limit is configuration, not code.
      await q(platformAdmin, `select admin_set_plan_feature('free','bookmarks_limit',true,5)`);
      await q(ann, up, [ann, a]);
      expect((await q(ann, `select 1 from devotional_user_state where bookmarked`)).length).toBe(3);
      // Lowering it never deletes what is already saved.
      await q(platformAdmin, `select admin_set_plan_feature('free','bookmarks_limit',true,1)`);
      expect((await q(ann, `select 1 from devotional_user_state where bookmarked`)).length).toBe(3);
    } finally {
      await sys(`update plan_features set enabled = true, limit_value = 25 where plan_key = 'free' and feature_key = 'bookmarks_limit'`);
    }
  });

  it("cannot create collections or groups, and the denial says why", async () => {
    const ann = await person();
    await expect(q(ann, `insert into user_collections (name) values ('My set')`)).rejects.toThrow(DENIED);
    await expect(q(ann, `select create_group('G','','','','other','private')`)).rejects.toThrow(/Educator Plus/);
  });

  it("cannot read premium resources, but can see that they exist", async () => {
    const ann = await person();
    await sys(`insert into resources (kind, title, summary, body, required_feature, status) values
      ('educator_resource', 'Parent night guide', 'A guide', '{"secret":"resource body"}', 'premium_resources', 'published'),
      ('educator_resource', 'Hidden draft', '', null, 'premium_resources', 'draft')`);
    expect(await q(ann, `select * from resources`)).toHaveLength(0);
    const locked = await q<{ title: string }>(ann, `select * from locked_resources()`);
    expect(locked.map((r) => r.title)).toEqual(["Parent night guide"]);
    expect(JSON.stringify(locked)).not.toContain("resource body");
    const plus = await person();
    await makePlus(plus);
    expect((await q<{ title: string }>(plus, `select title from resources`)).map((r) => r.title)).toEqual(["Parent night guide"]);
  });
});

describe("activation, upgrades and the client never being trusted", () => {
  it("a verified webhook upgrade turns premium on, and nothing else does", async () => {
    const ann = await person();
    expect(await readable(ann, oldPlus)).toBe(false);
    await expect(q(ann, `insert into subscriptions (owner_type, user_id, plan_key, plan_interval, status, stripe_subscription_id, last_event_created)
      values ('user',$1,'plus','year','active','sub_forged',now())`, [ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `insert into entitlement_grants (user_id, plan_key, reason) values ($1,'plus','me')`, [ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `update plan_features set enabled = true where plan_key = 'free'`)).rejects.toThrow(DENIED);
    await expect(q(ann, `select billing_apply_event('{}'::jsonb)`)).rejects.toThrow(DENIED);
    await expect(q(ann, `select plan_feature_value($1, 'premium_devotionals')`, [ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `select user_plan_keys($1)`, [ann])).rejects.toThrow(DENIED);
    await expect(h.asAnon(() => h.db.query(`select billing_apply_event('{}'::jsonb)`))).rejects.toThrow(DENIED);
    expect(await readable(ann, oldPlus)).toBe(false);
    await makePlus(ann);
    expect(await readable(ann, oldPlus)).toBe(true);
    expect(await readable(ann, old)).toBe(true);
    const e = await features(ann);
    expect(e.plans.sort()).toEqual(["free", "plus"]);
    expect(e.features.bookmarks_limit).toMatchObject({ enabled: true, limit: null });
  });

  it("Educator Plus unlocks filters, collections, group creation and community on premium content", async () => {
    const ann = await person();
    await makePlus(ann);
    const f = await q<{ id: string }>(ann, `select id from search_devotionals(null,'patience',null,null,null,null,null,true,50,0)`);
    expect(f.length).toBeGreaterThanOrEqual(4);
    expect(await q(ann, `select id from search_devotionals(null,'nope',null,null,null,null,null,true,50,0)`)).toHaveLength(0);
    const [c] = await q<{ id: string }>(ann, `insert into user_collections (name) values ('Advent') returning id`);
    await q(ann, `insert into user_collection_items (collection_id, devotional_id) values ($1,$2)`, [c!.id, oldPlus]);
    await q(ann, `select create_group('Plus group','','','','other','private')`);
    await q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','On premium content')`, [todayPlus, ann]);
  });

  it("another person's subscription never helps me", async () => {
    const payer = await person();
    const other = await person();
    await makePlus(payer);
    expect(await readable(other, oldPlus)).toBe(false);
    expect(await q(other, `select id from subscriptions`)).toHaveLength(0);
    expect(await q(other, `select * from billing_invoices`)).toHaveLength(0);
    expect(await q(payer, `select id from subscriptions`)).toHaveLength(1);
    await expect(q(payer, `select stripe_subscription_id from subscriptions`)).rejects.toThrow(DENIED);
    await expect(q(payer, `select * from billing_customers`)).rejects.toThrow(DENIED);
    await expect(q(payer, `select * from stripe_events`)).rejects.toThrow(DENIED);
  });

  it("an upgrade or downgrade between monthly and annual updates the same subscription", async () => {
    const ann = await person();
    const sub = await makePlus(ann, { interval: "month" });
    const cus = `cus_${sub}`;
    await apply(subEvent("customer.subscription.updated", { sub, customer: cus, price: PRICE.plus_year, status: "active", created: days(0.001) }));
    let [row] = await sys<{ plan_interval: string }>(`select plan_interval from subscriptions where stripe_subscription_id = $1`, [sub]);
    expect(row!.plan_interval).toBe("year");
    await apply(subEvent("customer.subscription.updated", { sub, customer: cus, price: PRICE.plus_month, status: "active", created: days(0.002) }));
    [row] = await sys(`select plan_interval from subscriptions where stripe_subscription_id = $1`, [sub]);
    expect(row!.plan_interval).toBe("month");
    expect(await sys(`select 1 from subscriptions where user_id = $1`, [ann])).toHaveLength(1);
  });

  it("a school price cannot be attached to a person, nor a personal price to a school", async () => {
    const ann = await person();
    const r = await apply(subEvent("customer.subscription.created", { sub: "sub_mix1", customer: "cus_mix1", price: PRICE.school_year, status: "active", owner: { type: "user", id: ann } }));
    expect(r).toMatch(/does not match/);
    expect(await readable(ann, oldPlus)).toBe(false);
  });

  it("a trial grants access, records that a trial was used, and is noticed before it ends", async () => {
    const ann = await person();
    const sub = `sub_trial_${++subN}`;
    await apply(subEvent("customer.subscription.created", {
      sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "trialing", end: days(2), trialEnd: days(2), owner: { type: "user", id: ann },
    }));
    expect(await readable(ann, oldPlus)).toBe(true);
    const [c] = await sys<{ had_trial: boolean }>(`select had_trial from billing_customers where user_id = $1`, [ann]);
    expect(c!.had_trial).toBe(true);
    expect((await q<{ kind: string }>(ann, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("trial_ending");
  });

  it("a complimentary grant gives access until revoked or expired, and only administrators can give one", async () => {
    const ann = await person();
    const boss = await person();
    await expect(q(boss, `select admin_grant_plan($1,'plus','pilot',null)`, [ann])).rejects.toThrow(/administrators only/i);
    const [g] = await q<{ admin_grant_plan: string }>(platformAdmin, `select admin_grant_plan($1,'plus','Scholarship',null)`, [ann]);
    expect(await readable(ann, oldPlus)).toBe(true);
    await q(platformAdmin, `select admin_revoke_grant($1)`, [g!.admin_grant_plan]);
    expect(await readable(ann, oldPlus)).toBe(false);
    await q(platformAdmin, `select admin_grant_plan($1,'plus','Short pilot',$2)`, [ann, new Date(Date.now() - 1000).toISOString()]);
    expect(await readable(ann, oldPlus)).toBe(false);
  });
});

describe("webhooks: idempotent, ordered, retryable", () => {
  it("applying the same event twice changes nothing the second time", async () => {
    const ann = await person();
    const e = subEvent("customer.subscription.created", { sub: "sub_dup", customer: "cus_dup", price: PRICE.plus_year, status: "active", owner: { type: "user", id: ann } });
    expect(await apply(e)).toBe("subscription active");
    expect(await apply(e)).toBe("duplicate");
    expect(await apply(e)).toBe("duplicate");
    expect(await sys(`select 1 from subscriptions where stripe_subscription_id = 'sub_dup'`)).toHaveLength(1);
    expect(await sys(`select 1 from stripe_events where id = $1`, [e.id])).toHaveLength(1);
  });

  it("a late, older event cannot roll state back", async () => {
    const ann = await person();
    const sub = await makePlus(ann);
    const cus = `cus_${sub}`;
    await apply(subEvent("customer.subscription.updated", { sub, customer: cus, price: PRICE.plus_year, status: "canceled", created: days(0.01) }));
    expect(await readable(ann, oldPlus)).toBe(false);
    const stale = await apply(subEvent("customer.subscription.updated", { sub, customer: cus, price: PRICE.plus_year, status: "active", created: days(-1) }));
    expect(stale).toBe("stale");
    expect(await readable(ann, oldPlus)).toBe(false);
  });

  it("an event that cannot be matched yet fails loudly, leaves no trace, and succeeds on retry", async () => {
    const ann = await person();
    const e = subEvent("customer.subscription.created", { sub: "sub_early", customer: "cus_early", price: PRICE.plus_year, status: "active" });
    await expect(apply(e)).rejects.toThrow(/Cannot match/);
    expect(await sys(`select 1 from stripe_events where id = $1`, [e.id])).toHaveLength(0);
    expect(await sys(`select 1 from subscriptions where stripe_subscription_id = 'sub_early'`)).toHaveLength(0);
    // The checkout confirmation arrives and links the customer; Stripe's retry now succeeds.
    await apply({ id: `evt_co_${++evSeq}`, type: "checkout.session.completed", created: epoch(new Date()),
      data: { object: { customer: "cus_early", metadata: { owner_type: "user", owner_id: ann } } } });
    expect(await apply(e)).toBe("subscription active");
    expect(await readable(ann, oldPlus)).toBe(true);
  });

  it("a customer already linked to someone cannot be claimed by forged metadata", async () => {
    const victim = await person();
    const thief = await person();
    const sub = await makePlus(victim);
    const r = await apply(subEvent("customer.subscription.updated", {
      sub: `${sub}_x`, customer: `cus_${sub}`, price: PRICE.plus_year, status: "active", owner: { type: "user", id: thief },
    }));
    expect(r).toBe("subscription active");
    expect(await readable(thief, oldPlus)).toBe(false);
  });

  it("events with an unknown price or an unhandled type are recorded and ignored, not retried", async () => {
    const ann = await person();
    expect(await apply(subEvent("customer.subscription.created", { sub: "sub_other", customer: "cus_other", price: "price_unrelated", status: "active", owner: { type: "user", id: ann } }))).toMatch(/unknown price/);
    expect(await apply({ id: `evt_${++evSeq}`, type: "charge.refunded", created: epoch(new Date()), data: { object: { id: "ch_1" } } })).toMatch(/ignored/);
    await expect(apply({ id: "x" })).rejects.toThrow(/Malformed/);
  });

  it("invoices are mirrored for receipts, and are visible only to their owner", async () => {
    const ann = await person();
    const other = await person();
    const sub = await makePlus(ann);
    const inv = (id: string, status: string, at: Date) => ({
      id: `evt_${++evSeq}`, type: status === "paid" ? "invoice.paid" : "invoice.payment_failed", created: epoch(at),
      data: { object: { id, customer: `cus_${sub}`, status, amount_due: 5000, amount_paid: status === "paid" ? 5000 : 0, currency: "USD", hosted_invoice_url: "https://invoice.stripe.com/i/x", invoice_pdf: null } },
    });
    await apply(inv("in_1", "open", days(-0.5)));
    await apply(inv("in_1", "paid", days(-0.4)));
    await apply(inv("in_1", "open", days(-0.6))); // late, older
    const rows = await q<{ status: string; currency: string }>(ann, `select status, currency from billing_invoices`);
    expect(rows).toEqual([{ status: "paid", currency: "usd" }]);
    expect(await q(other, `select * from billing_invoices`)).toHaveLength(0);
  });
});

describe("cancellation, expiry and failed payments", () => {
  it("cancelling keeps access to the end of the paid period, then premium stops and personal data stays", async () => {
    const ann = await person();
    const sub = await makePlus(ann);
    await q(ann, `insert into devotional_user_state (user_id, devotional_id, bookmarked, note) values ($1,$2,true,'my note')`, [ann, oldPlus]);
    const [c] = await q<{ id: string }>(ann, `insert into user_collections (name) values ('Keep') returning id`);
    await q(ann, `insert into user_collection_items (collection_id, devotional_id) values ($1,$2)`, [c!.id, oldPlus]);
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "active", cancelAtEnd: true, created: days(0.01) }));
    expect(await readable(ann, oldPlus)).toBe(true);
    expect((await q<{ kind: string }>(ann, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("cancels_on");
    // The period ends and the provider's final event arrives.
    await apply(subEvent("customer.subscription.deleted", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "canceled", end: days(-2), created: days(0.02) }));
    expect(await readable(ann, oldPlus)).toBe(false);
    expect(await readable(ann, old)).toBe(false);
    expect((await q<{ kind: string }>(ann, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("expired");
    // Nothing the person made was deleted.
    expect(await sys(`select 1 from devotional_user_state where user_id = $1 and note = 'my note'`, [ann])).toHaveLength(1);
    expect(await q(ann, `select * from user_collections`)).toHaveLength(1);
    expect(await q(ann, `select * from user_collection_items`)).toHaveLength(1);
    // But new premium actions are closed, and removing things is still allowed.
    await expect(q(ann, `insert into user_collections (name) values ('New')`)).rejects.toThrow(DENIED);
    await q(ann, `delete from user_collection_items`);
    // Re-subscribing restores access immediately.
    await apply(subEvent("customer.subscription.created", { sub: `${sub}_2`, customer: `cus_${sub}`, price: PRICE.plus_year, status: "active", created: days(0.03) }));
    expect(await readable(ann, oldPlus)).toBe(true);
  });

  it("expiry needs no job: a period that has ended stops granting by itself", async () => {
    const ann = await person();
    await makePlus(ann, { end: days(-3) }); // ended 3 days ago, still "active" because no event arrived
    expect(await readable(ann, oldPlus)).toBe(false);
    const bit = await person();
    await makePlus(bit, { end: new Date(Date.now() - 3600_000) }); // an hour late is absorbed by the slack
    expect(await readable(bit, oldPlus)).toBe(true);
  });

  it("a failed renewal keeps access through the grace period, warns, then stops; payment restores it", async () => {
    const ann = await person();
    const sub = await makePlus(ann, { end: days(-0.5) });
    expect(await readable(ann, oldPlus)).toBe(true); // within the slack
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "past_due", end: days(-0.5), created: days(0.01) }));
    expect(await readable(ann, oldPlus)).toBe(true); // grace: 7 days
    expect((await q<{ kind: string }>(ann, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("payment_failed");
    await sys(`update billing_settings set value = '0' where key = 'past_due_grace_days'`);
    await sys(`update billing_settings set value = '0' where key = 'period_slack_hours'`);
    try {
      expect(await readable(ann, oldPlus)).toBe(false); // grace is configuration
    } finally {
      await sys(`update billing_settings set value = '7' where key = 'past_due_grace_days'`);
      await sys(`update billing_settings set value = '24' where key = 'period_slack_hours'`);
    }
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "unpaid", end: days(-20), created: days(0.02) }));
    expect(await readable(ann, oldPlus)).toBe(false);
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "active", end: days(30), created: days(0.03) }));
    expect(await readable(ann, oldPlus)).toBe(true);
  });

  it("a person who lapses keeps what they wrote and their groups, and loses only premium extras", async () => {
    const ann = await person();
    const sub = await makePlus(ann);
    await q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'prayer','Lord, be near')`, [today, ann]);
    const [g] = await q<{ create_group: string }>(ann, `select create_group('Lapse group','','','','other','private')`);
    await apply(subEvent("customer.subscription.deleted", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "canceled", end: days(-2), created: days(0.01) }));
    expect(await sys(`select 1 from community_contributions where user_id = $1`, [ann])).toHaveLength(1);
    expect(await q(ann, `select id from community_contributions where body = 'Lord, be near'`)).toHaveLength(1);
    expect(await q(ann, `select 1 from group_memberships where group_id = $1 and role = 'owner'`, [g!.create_group])).toHaveLength(1);
    await q(ann, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','Still leading')`, [g!.create_group, ann]);
    await expect(q(ann, `select create_group('Another','','','','other','private')`)).rejects.toThrow(/Educator Plus/);
  });

  it("a person with an active subscription cannot delete their account until it is cancelled", async () => {
    const ann = await person();
    const sub = await makePlus(ann);
    expect((await q<{ account_deletion_blockers: string }>(ann, `select account_deletion_blockers()`)).map((r) => r.account_deletion_blockers)).toEqual(["billing:Educator Plus"]);
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.plus_year, status: "active", cancelAtEnd: true, created: days(0.01) }));
    expect(await q(ann, `select account_deletion_blockers()`)).toHaveLength(0);
  });
});

describe("community entitlements: payment never overrides privacy, moderation or membership", () => {
  it("a free person can read, post every kind, and pray on accessible content, with no payment", async () => {
    const ann = await person();
    const ben = await person();
    for (const kind of ["reflection", "question", "encouragement"]) {
      await q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,$3,$4)`, [today, ann, kind, `A ${kind} ${n}`]);
    }
    const [p] = await q<{ id: string }>(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'prayer','Please pray') returning id`, [today, ann]);
    expect((await one<{ acknowledge_prayer: number }>(ben, `select acknowledge_prayer($1)`, [p!.id])).acknowledge_prayer).toBe(1);
    expect(await q(ben, `select 1 from community_contributions`)).not.toHaveLength(0);
  });

  it("standalone public posting is not possible on any plan", async () => {
    const plus = await person();
    await makePlus(plus);
    await expect(q(plus, `insert into community_contributions (user_id, kind, body) values ($1,'reflection','free floating')`, [plus])).rejects.toThrow();
    await expect(q(plus, `insert into community_contributions (devotional_id, user_id, kind, body) values (gen_random_uuid(),$1,'reflection','x')`, [plus])).rejects.toThrow();
  });

  it("a paid plan does not lift a restriction, and a restriction does not cost the subscription", async () => {
    const ann = await person();
    await makePlus(ann);
    await q(moderator, `select restrict_user($1,'suspension',3,'Repeated harassment')`, [ann]);
    await expect(q(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','hi')`, [today, ann])).rejects.toThrow(DENIED);
    await expect(q(ann, `select create_group('Restricted','','','','other','private')`)).rejects.toThrow(/restricted/i);
    expect(await readable(ann, oldPlus)).toBe(true);
  });

  it("a paid plan does not open a private group", async () => {
    const owner = await person();
    const plus = await person();
    await makePlus(plus);
    const [g] = await sys<{ id: string }>(`insert into community_groups (name, description, purpose, guidelines, category, privacy, created_by) values ('Closed','a','b','c','other','private',$1) returning id`, [owner]);
    await sys(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'owner')`, [g!.id, owner]);
    expect(await q(plus, `select 1 from community_groups where id = $1`, [g!.id])).toHaveLength(0);
    await expect(q(plus, `insert into group_posts (group_id, author_id, kind, body) values ($1,$2,'post','sneak')`, [g!.id, plus])).rejects.toThrow(DENIED);
  });

  it("a moderator can hide a subscriber's contribution, and a subscription does not undo it", async () => {
    const ann = await person();
    await makePlus(ann);
    const [c] = await q<{ id: string }>(ann, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','Needs review') returning id`, [today, ann]);
    await q(moderator, `select hide_content('contribution', $1, 'Please keep this kind and on the passage.')`, [c!.id]);
    const other = await person();
    expect(await q(other, `select id from community_contributions where body = 'Needs review'`)).toHaveLength(0);
    // Paying changes nothing about the decision.
    await makePlus(ann);
    expect(await q(other, `select id from community_contributions where body = 'Needs review'`)).toHaveLength(0);
  });
});

describe("school licensing", () => {
  it("assigns seats to members in order up to the licensed count, and the rest stay free", async () => {
    const owner = await person();
    const { school } = await makeSchool(owner, 2);
    const a = await person(), b = await person();
    await addMember(school, a);
    await addMember(school, b);
    expect(await q(owner, `select 1 from school_seats`)).toHaveLength(2); // owner + a
    expect(await readable(owner, oldPlus)).toBe(true);
    expect(await readable(a, oldPlus)).toBe(true);
    expect(await readable(b, oldPlus)).toBe(false); // member, but no seat
    expect((await q<{ kind: string }>(b, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("school_no_seat");
    expect((await q<{ kind: string }>(owner, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("school_out_of_seats");
  });

  it("only administrators assign or release seats, never past the licence, only to active members", async () => {
    const owner = await person();
    const { school } = await makeSchool(owner, 2);
    const a = await person(), b = await person(), outsider = await person();
    await addMember(school, a);
    await addMember(school, b);
    await expect(q(a, `select assign_seat($1,$2)`, [school, b])).rejects.toThrow(/owner or administrator/i);
    await expect(q(a, `select release_seat($1,$2)`, [school, owner])).rejects.toThrow(/owner or administrator/i);
    await expect(q(owner, `select assign_seat($1,$2)`, [school, b])).rejects.toThrow(/All licensed seats/);
    await q(owner, `select release_seat($1,$2)`, [school, a]);
    await q(owner, `select assign_seat($1,$2)`, [school, b]);
    expect(await readable(a, oldPlus)).toBe(false);
    expect(await readable(b, oldPlus)).toBe(true);
    await q(owner, `select release_seat($1,$2)`, [school, b]);
    await expect(q(owner, `select assign_seat($1,$2)`, [school, outsider])).rejects.toThrow(/not an active member/i);
    await expect(q(owner, `insert into school_seats (school_id, user_id) values ($1,$2)`, [school, outsider])).rejects.toThrow(DENIED);
    await expect(q(a, `insert into school_seats (school_id, user_id) values ($1,$2)`, [school, a])).rejects.toThrow(DENIED);
  });

  it("reducing seats keeps the longest-held seats and leaves the rest in place, with a notice", async () => {
    const owner = await person();
    const { school, sub } = await makeSchool(owner, 3);
    const a = await person(), b = await person();
    await addMember(school, a);
    await sys(`update school_seats set assigned_at = now() - interval '2 days' where user_id = $1`, [owner]);
    await sys(`update school_seats set assigned_at = now() - interval '1 day' where user_id = $1`, [a]);
    await addMember(school, b);
    expect(await readable(b, oldPlus)).toBe(true);
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.school_year, status: "active", qty: 2, created: days(0.01) }));
    expect(await readable(owner, oldPlus)).toBe(true);
    expect(await readable(a, oldPlus)).toBe(true);
    expect(await readable(b, oldPlus)).toBe(false);
    expect((await q<{ kind: string }>(b, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("school_seat_over_limit");
    expect(await sys(`select 1 from school_seats where school_id = $1`, [school])).toHaveLength(3);
    // The administrator sees who is over the limit.
    const roster = await q<{ user_id: string; in_limit: boolean }>(owner, `select * from school_seat_status($1)`, [school]);
    expect(roster.find((r) => r.user_id === b)!.in_limit).toBe(false);
    await expect(q(a, `select * from school_seat_status($1)`, [school])).rejects.toThrow(/owner or administrator/i);
  });

  it("a school cancelling ends faculty access after the period; their data stays; renewal restores everything", async () => {
    const owner = await person();
    const { school, sub } = await makeSchool(owner, 5);
    const a = await person();
    await addMember(school, a);
    await q(a, `insert into devotional_user_state (user_id, devotional_id, bookmarked, note) values ($1,$2,true,'faculty note')`, [a, oldPlus]);
    await q(a, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'prayer','Faculty prayer')`, [today, a]);
    const [asg] = await q<{ id: string }>(owner, `insert into school_assignments (school_id, devotional_id, note) values ($1,$2,'Read before staff meeting') returning id`, [school, oldPlus]);
    expect(await q(a, `select 1 from school_assignments`)).toHaveLength(1);
    await apply(subEvent("customer.subscription.updated", { sub, customer: `cus_${sub}`, price: PRICE.school_year, status: "active", qty: 5, cancelAtEnd: true, created: days(0.01) }));
    expect((await q<{ kind: string }>(owner, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("school_cancels_on");
    await apply(subEvent("customer.subscription.deleted", { sub, customer: `cus_${sub}`, price: PRICE.school_year, status: "canceled", qty: 5, end: days(-2), created: days(0.02) }));
    expect(await readable(a, oldPlus)).toBe(false);
    expect(await q(a, `select 1 from school_assignments`)).toHaveLength(0); // tools lock
    expect((await q<{ kind: string }>(a, `select kind from my_billing_notices()`)).map((r) => r.kind)).toContain("school_lapsed");
    expect(await sys(`select 1 from devotional_user_state where user_id = $1 and note = 'faculty note'`, [a])).toHaveLength(1);
    expect(await sys(`select 1 from community_contributions where user_id = $1`, [a])).toHaveLength(1);
    expect(await sys(`select 1 from school_assignments where id = $1`, [asg!.id])).toHaveLength(1);
    // The school's own members remain; the school can still see and remove them.
    expect(await q(owner, `select * from school_roster($1)`, [school])).toHaveLength(2);
    // Renewal after expiry.
    await apply(subEvent("customer.subscription.created", { sub: `${sub}_renew`, customer: `cus_${sub}`, price: PRICE.school_year, status: "active", qty: 5, created: days(0.03) }));
    expect(await readable(a, oldPlus)).toBe(true);
    expect(await q(a, `select 1 from school_assignments`)).toHaveLength(1);
  });

  it("removing a faculty member frees the seat and touches none of their personal content", async () => {
    const owner = await person();
    const { school } = await makeSchool(owner, 3);
    const a = await person("Alma");
    await addMember(school, a);
    await q(a, `insert into devotional_user_state (user_id, devotional_id, bookmarked, completed_at, note) values ($1,$2,true,now(),'private thoughts')`, [a, today]);
    await q(a, `insert into community_contributions (devotional_id, user_id, kind, body, visibility) values ($1,$2,'prayer','my private prayer','private')`, [today, a]);
    await q(a, `insert into community_contributions (devotional_id, user_id, kind, body) values ($1,$2,'reflection','my public reflection')`, [today, a]);
    // a school group she leads, and one personal group she owns
    const [sg] = await q<{ create_group: string }>(owner, `select create_group('Faculty','','','','school','private',$1)`, [school]);
    await sys(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'moderator')`, [sg!.create_group, a]);
    await sys(`update group_memberships set role = 'owner' where group_id = $1 and user_id = $2`, [sg!.create_group, a]);
    await sys(`update group_memberships set role = 'member' where group_id = $1 and user_id = $2`, [sg!.create_group, owner]);
    const mine = await sys<{ id: string }>(`insert into community_groups (name, description, purpose, guidelines, category, privacy, created_by) values ('Alma''s own','a','b','c','other','private',$1) returning id`, [a]);
    await sys(`insert into group_memberships (group_id, user_id, role) values ($1,$2,'owner')`, [mine[0]!.id, a]);

    await q(owner, `delete from school_memberships where school_id = $1 and user_id = $2`, [school, a]);

    expect(await sys(`select 1 from school_seats where user_id = $1`, [a])).toHaveLength(0);
    expect(await q(a, `select note from devotional_user_state`)).toEqual([{ note: "private thoughts" }]);
    expect(await sys(`select 1 from community_contributions where user_id = $1`, [a])).toHaveLength(2);
    expect(await q(a, `select 1 from group_memberships where group_id = $1`, [mine[0]!.id])).toHaveLength(1);
    // The school group is handed to an administrator and she no longer belongs to it.
    expect(await sys(`select 1 from group_memberships where group_id = $1 and user_id = $2`, [sg!.create_group, a])).toHaveLength(0);
    expect(await sys(`select role from group_memberships where group_id = $1 and user_id = $2`, [sg!.create_group, owner])).toEqual([{ role: "owner" }]);
    // The school's administrator cannot read her private notes, prayers or completion history before or after.
    expect(await q(owner, `select * from devotional_user_state where user_id = $1`, [a])).toHaveLength(0);
    expect((await q<{ id: string }>(owner, `select id from community_contributions where body = 'my private prayer'`))).toHaveLength(0);
    expect(await readable(a, oldPlus)).toBe(false);
  });

  it("a person can belong to several schools and gets access from any licensed one", async () => {
    const o1 = await person(), o2 = await person(), t = await person();
    const s1 = await makeSchool(o1, 5);
    const s2 = await makeSchool(o2, 5);
    await addMember(s1.school, t);
    await addMember(s2.school, t);
    expect(await sys(`select 1 from school_seats where user_id = $1`, [t])).toHaveLength(2);
    expect((await features(t)).plans.sort()).toEqual(["free", "school"]);
    await apply(subEvent("customer.subscription.deleted", { sub: s1.sub, customer: `cus_${s1.sub}`, price: PRICE.school_year, status: "canceled", end: days(-2), created: days(0.01) }));
    expect(await readable(t, oldPlus)).toBe(true); // the other school still covers her
    await apply(subEvent("customer.subscription.deleted", { sub: s2.sub, customer: `cus_${s2.sub}`, price: PRICE.school_year, status: "canceled", end: days(-2), created: days(0.01) }));
    expect(await readable(t, oldPlus)).toBe(false);
    // An individual subscription is separate and still counts.
    await makePlus(t);
    expect(await readable(t, oldPlus)).toBe(true);
  });

  it("schools are strictly isolated from each other", async () => {
    const o1 = await person(), o2 = await person(), m2 = await person();
    const s1 = await makeSchool(o1, 5);
    const s2 = await makeSchool(o2, 5);
    await addMember(s2.school, m2);
    await q(o2, `insert into school_assignments (school_id, devotional_id) values ($1,$2)`, [s2.school, today]);
    await q(o2, `insert into school_collections (school_id, name) values ($1,'Staff devotions')`, [s2.school]);
    expect(await q(o1, `select * from school_assignments where school_id = $1`, [s2.school])).toHaveLength(0);
    expect(await q(o1, `select * from school_collections where school_id = $1`, [s2.school])).toHaveLength(0);
    expect(await q(o1, `select id from subscriptions where school_id = $1`, [s2.school])).toHaveLength(0);
    expect(await q(o1, `select * from school_seats where school_id = $1`, [s2.school])).toHaveLength(0);
    await expect(q(o1, `select assign_seat($1,$2)`, [s2.school, o1])).rejects.toThrow(/owner or administrator/i);
    await expect(q(o1, `select * from school_seat_status($1)`, [s2.school])).rejects.toThrow(/owner or administrator/i);
    await expect(q(o1, `select school_engagement($1)`, [s2.school])).rejects.toThrow(/owner or administrator/i);
    await expect(q(o1, `insert into school_assignments (school_id, devotional_id) values ($1,$2)`, [s2.school, today])).rejects.toThrow(DENIED);
    expect(await q(o1, `select * from school_license($1)`, [s2.school])).toHaveLength(0);
    expect(await q(o1, `select * from school_assignments`)).toHaveLength(0);
    void s1;
  });

  it("faculty (non-administrators) read shared school tools but cannot change them or see billing", async () => {
    const owner = await person(), t = await person();
    const { school } = await makeSchool(owner, 5);
    await addMember(school, t);
    await q(owner, `insert into school_assignments (school_id, devotional_id, note) values ($1,$2,'Week 1')`, [school, today]);
    expect(await q(t, `select 1 from school_assignments`)).toHaveLength(1);
    await expect(q(t, `insert into school_assignments (school_id, devotional_id) values ($1,$2)`, [school, today])).rejects.toThrow(DENIED);
    expect((await q(t, `delete from school_assignments`) , await sys(`select 1 from school_assignments where school_id = $1`, [school]))).toHaveLength(1);
    expect(await q(t, `select id from subscriptions`)).toHaveLength(0);
    await expect(q(t, `select school_engagement($1)`, [school])).rejects.toThrow(/owner or administrator/i);
  });

  it("school groups need the license; an unlicensed school or non-admin cannot make them", async () => {
    const owner = await person(), t = await person(), bare = await person();
    const { school } = await makeSchool(owner, 5);
    await addMember(school, t);
    await q(owner, `select create_group('Faculty prayer','','','','school','private',$1)`, [school]);
    await expect(q(t, `select create_group('X','','','','school','private',$1)`, [school])).rejects.toThrow(/owner or administrator/i);
    const [bareSchool] = await q<{ create_school: string }>(bare, `select create_school('Unlicensed')`);
    await expect(q(bare, `select create_group('X','','','','school','private',$1)`, [bareSchool!.create_school])).rejects.toThrow(/does not include school groups/i);
  });

  it("a school with a live subscription cannot be deleted from under its billing", async () => {
    const owner = await person();
    const { school } = await makeSchool(owner, 2);
    await expect(sys(`delete from schools where id = $1`, [school])).rejects.toThrow(/Cancel the school subscription/);
  });
});

describe("privacy-conscious analytics", () => {
  async function schoolWith(count: number) {
    const owner = await person();
    const { school } = await makeSchool(owner, 40);
    const staff: string[] = [];
    for (let i = 0; i < count; i++) { const u = await person(); await addMember(school, u); staff.push(u); }
    return { owner, school, staff };
  }

  it("shows nothing until enough people are counted, then totals only", async () => {
    const { owner, school, staff } = await schoolWith(2); // 3 people with the owner
    await q(staff[0]!, `insert into devotional_user_state (user_id, devotional_id, completed_at) values ($1,$2,now())`, [staff[0], today]);
    expect(await one(owner, `select school_engagement($1) as r`, [school])).toMatchObject({ r: { suppressed: true } });
    for (let i = 0; i < 3; i++) { const u = await person(); await addMember(school, u); staff.push(u); }
    for (const u of staff.slice(0, 4)) {
      await q(u, `insert into devotional_user_state (user_id, devotional_id, completed_at) values ($1,$2,now()) on conflict (user_id, devotional_id) do update set completed_at = now()`, [u, today]);
      await q(u, `insert into community_contributions (devotional_id, user_id, kind, body, visibility) values ($1,$2,'prayer','very private request','private')`, [today, u]);
    }
    const r = (await one<{ r: Record<string, unknown> }>(owner, `select school_engagement($1) as r`, [school])).r;
    expect(r.suppressed).toBe(false);
    expect(r.devotionals_completed).toBe(4);
    expect(r.members_active).toBe(4);
    const text = JSON.stringify(r);
    for (const u of [owner, ...staff]) expect(text).not.toContain(u);
    expect(text).not.toContain("very private request");
    expect(Object.keys(r).sort()).toEqual(["assignments", "counted_members", "devotionals_completed", "members_active", "min_group", "suppressed"]);
  });

  it("respects each person's choice to be left out of aggregates", async () => {
    const { owner, school, staff } = await schoolWith(5); // 6 people
    expect((await one<{ r: { suppressed: boolean } }>(owner, `select school_engagement($1) as r`, [school])).r.suppressed).toBe(false);
    await q(staff[0]!, `update profiles set share_school_aggregates = false where id = $1`, [staff[0]]);
    await q(staff[1]!, `update profiles set share_school_aggregates = false where id = $1`, [staff[1]]);
    expect((await one<{ r: { suppressed: boolean } }>(owner, `select school_engagement($1) as r`, [school])).r.suppressed).toBe(true);
  });

  it("is a licensed tool, administrators only, and never shows an individual's private activity", async () => {
    const owner = await person();
    const [s] = await q<{ create_school: string }>(owner, `select create_school('No licence')`);
    await expect(q(owner, `select school_engagement($1)`, [s!.create_school])).rejects.toThrow(/not part of this license/i);
    const { owner: o2, staff, school } = await schoolWith(6);
    await expect(q(staff[0]!, `select school_engagement($1)`, [school])).rejects.toThrow(/owner or administrator/i);
    await q(staff[0]!, `insert into devotional_user_state (user_id, devotional_id, note) values ($1,$2,'my spiritual notes')`, [staff[0], today]);
    expect(await q(o2, `select * from devotional_user_state`)).toHaveLength(0);
    expect(await q(o2, `select id from community_contributions where body = 'very private request'`)).toHaveLength(0);
  });
});
