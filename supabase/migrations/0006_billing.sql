-- Subscriptions, premium entitlements and school licensing.
-- Builds on 0001 (schools), 0002 (roles), 0003/0004 (devotionals, bookmarks) and 0005 (community).
--
-- Principles enforced IN THE DATABASE:
--   * What a person may use is decided by ONE function family (has_feature / feature_limit),
--     computed from subscription rows that only the server (service role) can write.
--     Nothing the browser sends can grant access.
--   * Plans, features and limits are DATA (plans, features, plan_features), editable by a platform
--     administrator without changing code. No price is hard-coded; amounts come from plan_prices.
--   * Community participation (reading, posting, praying, acknowledging, joining groups) never
--     depends on payment. Payment can add things; it cannot override privacy, moderation or membership.
--   * Billing events are applied by billing_apply_event(), which is idempotent and order-aware.

create temp table _pre_0006_fns as select oid from pg_proc where pronamespace = 'public'::regnamespace;

create type subscription_status as enum
  ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete_expired', 'paused');
create type billing_interval as enum ('month', 'year');

-- ---------------------------------------------------------------------------
-- Configuration: plans, features, which plan includes what
-- ---------------------------------------------------------------------------
create table plans (
  key text primary key check (key ~ '^[a-z][a-z_]{1,30}$'),
  name text not null,
  tagline text not null default '',
  audience text not null check (audience in ('individual', 'school')),
  sort int not null default 0,
  is_public boolean not null default true,
  trial_days int not null default 0 check (trial_days between 0 and 90),
  updated_at timestamptz not null default now()
);

create table features (
  key text primary key check (key ~ '^[a-z][a-z_]{1,40}$'),
  label text not null,
  description text not null default '',
  -- flag: on/off. limit: a number, where "unlimited" is an enabled row with no limit.
  kind text not null check (kind in ('flag', 'limit')),
  -- user: something a person can use. school: a tool for a school's administrators.
  scope text not null default 'user' check (scope in ('user', 'school')),
  sort int not null default 0
);

create table plan_features (
  plan_key text not null references plans on delete cascade,
  feature_key text not null references features on delete cascade,
  enabled boolean not null default false,
  limit_value int check (limit_value is null or limit_value >= 0),
  primary key (plan_key, feature_key)
);

-- Prices are configured, never hard-coded. stripe_price_id comes from your Stripe dashboard;
-- unit_amount/currency are a display cache that can be refreshed from Stripe.
create table plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references plans on delete cascade,
  plan_interval billing_interval not null,
  stripe_price_id text unique,
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  unit_amount int check (unit_amount is null or unit_amount >= 0),
  -- For school plans the price is per seat.
  per_seat boolean not null default false,
  active boolean not null default false,
  display_note text not null default '',
  unique (plan_key, plan_interval)
);

create table billing_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into billing_settings (key, value) values
  -- Days of access kept after a renewal payment fails, while the payment provider retries.
  ('past_due_grace_days', '7'),
  -- Hours of access kept after a period ends, to absorb webhook delay.
  ('period_slack_hours', '24'),
  ('trial_notice_days', '3'),
  -- Aggregate school analytics are shown only when at least this many people are counted.
  ('analytics_min_group', '5');

insert into plans (key, name, tagline, audience, sort, trial_days) values
  ('free', 'Free Educator', 'Daily devotionals and a Scripture-centered community, free.', 'individual', 0, 0),
  ('plus', 'Educator Plus', 'The full archive, premium resources and tools to lead a group.', 'individual', 1, 14),
  ('school', 'School License', 'For Christian schools: faculty seats, shared resources and administration.', 'school', 2, 14);

insert into features (key, label, description, kind, scope, sort) values
  ('devotional_archive_days', 'Devotional archive', 'How far back you can read published devotionals.', 'limit', 'user', 1),
  ('premium_devotionals', 'Premium devotionals', 'Devotionals marked as Plus content.', 'flag', 'user', 2),
  ('archive_advanced_search', 'Advanced search and filters', 'Filter by category, grade, theme and date.', 'flag', 'user', 3),
  ('bookmarks_limit', 'Saved devotionals', 'How many devotionals you can bookmark.', 'limit', 'user', 4),
  ('collections', 'Saved collections', 'Organize saved devotionals into collections.', 'flag', 'user', 5),
  ('premium_resources', 'Premium educator resources', 'Guides and resources for classroom use.', 'flag', 'user', 6),
  ('faculty_devotionals', 'Weekly faculty devotionals', 'A devotional written for staff each week.', 'flag', 'user', 7),
  ('presentation_materials', 'Additional presentation materials', 'Extra slide-ready classroom materials.', 'flag', 'user', 8),
  ('create_groups', 'Create private educator groups', 'Start a private group, subject to community rules.', 'flag', 'user', 9),
  ('group_tools_enhanced', 'Enhanced group organization tools', 'Reserved for upcoming group organization tools.', 'flag', 'user', 10),
  ('staff_meeting_resources', 'Staff meeting resources', 'Guides and openers for staff meetings.', 'flag', 'user', 11),
  ('school_dashboard', 'School administrator dashboard', 'Manage seats, billing and school tools.', 'flag', 'school', 20),
  ('school_groups', 'School-managed faculty groups', 'Create private groups owned by the school.', 'flag', 'school', 21),
  ('school_collections', 'Shared devotional collections', 'Curate collections for the whole faculty.', 'flag', 'school', 22),
  ('school_assignments', 'School-wide devotional assignments', 'Assign a devotional to the faculty.', 'flag', 'school', 23),
  ('school_analytics', 'Aggregate engagement analytics', 'Privacy-conscious totals; never individuals.', 'flag', 'school', 24);

-- Every plan has a row for every feature, so an administrator edits a complete matrix.
insert into plan_features (plan_key, feature_key, enabled, limit_value)
select p.key, f.key, false, null from plans p cross join features f;

update plan_features set enabled = true, limit_value = 30 where plan_key = 'free' and feature_key = 'devotional_archive_days';
update plan_features set enabled = true, limit_value = 25 where plan_key = 'free' and feature_key = 'bookmarks_limit';
update plan_features set enabled = true
  where plan_key in ('plus', 'school')
    and feature_key in ('devotional_archive_days', 'premium_devotionals', 'archive_advanced_search', 'bookmarks_limit',
                        'collections', 'premium_resources', 'faculty_devotionals', 'presentation_materials',
                        'create_groups', 'group_tools_enhanced');
update plan_features set enabled = true
  where plan_key = 'school' and feature_key in
    ('staff_meeting_resources', 'school_dashboard', 'school_groups', 'school_collections', 'school_assignments', 'school_analytics');

insert into plan_prices (plan_key, plan_interval, per_seat)
select p.key, i, (p.key = 'school') from plans p cross join (values ('month'::billing_interval), ('year')) v(i) where p.key <> 'free';

create function billing_setting_int(k text, fallback int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from billing_settings where key = k), fallback)
$$;

-- ---------------------------------------------------------------------------
-- Customers, subscriptions, invoices, webhook log (written only by the server)
-- ---------------------------------------------------------------------------
create table billing_customers (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'school')),
  user_id uuid references auth.users on delete cascade,
  school_id uuid references schools on delete cascade,
  stripe_customer_id text not null unique,
  -- A free trial is offered once per owner.
  had_trial boolean not null default false,
  created_at timestamptz not null default now(),
  check ((owner_type = 'user' and user_id is not null and school_id is null)
      or (owner_type = 'school' and school_id is not null and user_id is null))
);
create unique index billing_customers_user on billing_customers (user_id) where owner_type = 'user';
create unique index billing_customers_school on billing_customers (school_id) where owner_type = 'school';

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('user', 'school')),
  user_id uuid references auth.users on delete cascade,
  school_id uuid references schools on delete cascade,
  plan_key text not null references plans,
  plan_interval billing_interval not null,
  status subscription_status not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  -- Licensed seats for a school plan (the Stripe quantity). 1 for individuals.
  seats int not null default 1 check (seats >= 1),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  ended_at timestamptz,
  -- Stripe's timestamp of the newest event applied, so late or repeated events cannot roll state back.
  last_event_created timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((owner_type = 'user' and user_id is not null and school_id is null)
      or (owner_type = 'school' and school_id is not null and user_id is null))
);
create index subscriptions_user on subscriptions (user_id) where user_id is not null;
create index subscriptions_school on subscriptions (school_id) where school_id is not null;
create trigger subscriptions_updated before update on subscriptions for each row execute function set_updated_at();

create table billing_invoices (
  stripe_invoice_id text primary key,
  owner_type text not null check (owner_type in ('user', 'school')),
  user_id uuid references auth.users on delete cascade,
  school_id uuid references schools on delete cascade,
  status text not null,
  amount_due int,
  amount_paid int,
  currency text,
  hosted_invoice_url text,
  invoice_pdf text,
  created_at timestamptz not null default now(),
  last_event_created timestamptz not null
);
create index billing_invoices_user on billing_invoices (user_id) where user_id is not null;
create index billing_invoices_school on billing_invoices (school_id) where school_id is not null;

create table stripe_events (
  id text primary key,
  type text not null,
  created timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text
);

-- Complimentary access (scholarships, pilots, support). Platform administrators only.
create table entitlement_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  plan_key text not null references plans,
  reason text not null check (length(btrim(reason)) between 1 and 300),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index entitlement_grants_user on entitlement_grants (user_id);

-- School seats. A seat is a licensed place held by one active member.
create table school_seats (
  school_id uuid not null references schools on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  assigned_by uuid references auth.users on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index school_seats_user on school_seats (user_id);

alter table profiles add column share_school_aggregates boolean not null default true;

-- ---------------------------------------------------------------------------
-- Entitlement resolution (server-side truth)
-- ---------------------------------------------------------------------------
-- Does this subscription currently give access? Time-based, so expiry needs no job.
create function subscription_grants(s subscriptions) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (s.status in ('active', 'trialing')
       and (s.current_period_end is null
            or s.current_period_end + make_interval(hours => billing_setting_int('period_slack_hours', 24)) > now()))
    or (s.status = 'past_due'
       and s.current_period_end is not null
       and s.current_period_end + make_interval(days => billing_setting_int('past_due_grace_days', 7)) > now()),
    false)
$$;

-- The best currently-granting subscription for a school, or nothing.
create function school_license_raw(sid uuid)
returns table (plan_key text, seats int, status subscription_status, current_period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select s.plan_key, s.seats, s.status, s.current_period_end, s.cancel_at_period_end
  from subscriptions s
  where s.school_id = sid and subscription_grants(s)
  order by s.seats desc, s.created_at
  limit 1
$$;

-- Is this person's seat inside the licensed count? When seats are reduced, the longest-held seats stay.
create function seat_in_limit(sid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (select count(*) from school_seats s2
            where s2.school_id = sid and (s2.assigned_at, s2.user_id) <= (s.assigned_at, s.user_id))
           <= (select l.seats from school_license_raw(sid) l)
    from school_seats s where s.school_id = sid and s.user_id = uid), false)
$$;

-- Every plan a person currently holds: Free for any signed-in person, plus individual
-- subscriptions, complimentary grants, and school licenses through an in-limit seat.
create function user_plan_keys(uid uuid) returns setof text
language sql stable security definer set search_path = public as $$
  select 'free'::text where uid is not null
  union
  select s.plan_key from subscriptions s where s.user_id = uid and subscription_grants(s)
  union
  select g.plan_key from entitlement_grants g
   where g.user_id = uid and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
  union
  select l.plan_key
  from school_seats st
  join school_memberships m on m.school_id = st.school_id and m.user_id = st.user_id and m.status = 'active'
  join lateral school_license_raw(st.school_id) l on true
  where st.user_id = uid and seat_in_limit(st.school_id, uid)
$$;

-- 0 = not included, 2147483647 = unlimited, otherwise the limit. Best value across all plans held.
create function plan_feature_value(uid uuid, k text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(case when pf.enabled then coalesce(pf.limit_value, 2147483647) else 0 end), 0)
  from user_plan_keys(uid) p
  join plan_features pf on pf.plan_key = p and pf.feature_key = k
$$;

-- The caller's own entitlements. These are the only entitlement functions clients can call.
create function has_feature(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select plan_feature_value(auth.uid(), k) > 0
$$;
create function feature_limit(k text) returns int
language sql stable security definer set search_path = public as $$
  select plan_feature_value(auth.uid(), k)
$$;

-- A school's tools. Visible only to people in that school; requires an active license.
create function school_has_feature(sid uuid, k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_school_member(sid) and exists (
    select 1 from school_license_raw(sid) l
    join plan_features pf on pf.plan_key = l.plan_key and pf.feature_key = k and pf.enabled), false)
$$;

create function my_entitlements() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(p order by p) from user_plan_keys(auth.uid()) p), '[]'::jsonb),
    'features', coalesce((select jsonb_object_agg(f.key,
        jsonb_build_object('enabled', plan_feature_value(auth.uid(), f.key) > 0,
                           'limit', case when f.kind = 'limit' and plan_feature_value(auth.uid(), f.key) < 2147483647
                                         then plan_feature_value(auth.uid(), f.key) end))
      from features f where f.scope = 'user'), '{}'::jsonb))
$$;

-- A school's license, visible only to its members (the raw form is for server-side use).
create function school_license(sid uuid)
returns table (plan_key text, seats int, status subscription_status, current_period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select l.* from school_license_raw(sid) l where is_school_member(sid)
$$;

-- ---------------------------------------------------------------------------
-- Premium devotional access (enforced by row-level security, not by the app)
-- ---------------------------------------------------------------------------
alter table devotionals add column access_level text not null default 'free' check (access_level in ('free', 'plus'));
grant insert (access_level) on devotionals to authenticated;
grant update (access_level) on devotionals to authenticated;

-- The daily devotional is always the single FREE one for that date. Plus devotionals are extra
-- content and may share a date with it, so premium content never displaces the free daily.
drop index devotionals_one_live_per_day;
create unique index devotionals_one_live_per_day on devotionals (devotional_date)
  where status in ('scheduled', 'published') and access_level = 'free';

-- May the caller read a live devotional of this level and date?
--   free: within the archive window of the caller's plan.   plus: only with premium_devotionals.
-- Editors and moderators are staff, not subscribers, and are never locked out of their own work.
create function devotional_readable(level text, ddate date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    is_content_editor() or is_community_moderator()
    or (level = 'free'
        and ddate >= current_date - (least(plan_feature_value(auth.uid(), 'devotional_archive_days'), 36500) + 1))
    or (level = 'plus' and plan_feature_value(auth.uid(), 'premium_devotionals') > 0),
    false)
$$;

drop policy devotionals_read_live on devotionals;
create policy devotionals_read_live on devotionals for select to authenticated
  using ((status = 'published' or (status = 'scheduled' and publish_at <= now()))
         and devotional_readable(access_level, devotional_date));

-- Community content hangs off a devotional the person can actually read.
create or replace function devotional_is_live(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devotionals d
    where d.id = did
      and (d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now()))
      and devotional_readable(d.access_level, d.devotional_date))
$$;

-- What a locked devotional may reveal: its title, date and reference, never its body.
create function locked_teasers(p_limit int default 12, p_offset int default 0)
returns table (id uuid, title text, devotional_date date, scripture_reference text, access_level text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.devotional_date, d.scripture_reference, d.access_level,
         case when d.access_level = 'plus' then 'plus' else 'archive' end
  from devotionals d
  where auth.uid() is not null
    and (d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now()))
    and not devotional_readable(d.access_level, d.devotional_date)
  order by d.devotional_date desc, d.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

create function devotional_lock_info(did uuid)
returns table (id uuid, title text, devotional_date date, scripture_reference text, reason text)
language sql stable security definer set search_path = public as $$
  select d.id, d.title, d.devotional_date, d.scripture_reference,
         case when d.access_level = 'plus' then 'plus' else 'archive' end
  from devotionals d
  where d.id = did and auth.uid() is not null
    and (d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now()))
    and not devotional_readable(d.access_level, d.devotional_date)
$$;

create function my_locked_bookmark_count() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from devotional_user_state s join devotionals d on d.id = s.devotional_id
  where s.user_id = auth.uid() and s.bookmarked
    and not devotional_readable(d.access_level, d.devotional_date)
$$;

-- Advanced filters belong to Educator Plus. Keyword and Scripture-reference search stay free.
create or replace function search_devotionals(
  p_query text default null,
  p_category text default null,
  p_grade text default null,
  p_theme uuid default null,
  p_from date default null,
  p_through date default null,
  p_status devotional_status default null,
  p_only_live boolean default true,
  p_limit int default 20,
  p_offset int default 0,
  p_book text default null,
  p_chapter int default null
) returns table (
  id uuid, title text, devotional_date date, daily_topic text, category_slug text,
  scripture_reference text, theme_id uuid, status devotional_status, author_name text,
  excerpt text, total bigint
)
language sql stable set search_path = public as $$
  with q as (
    select nullif(btrim(coalesce(p_query, '')), '') as text,
           case when nullif(btrim(coalesce(p_query, '')), '') is null then null
                else websearch_to_tsquery('english', btrim(p_query)) end as tsq,
           (has_feature('archive_advanced_search') or is_content_editor()) as adv
  )
  select d.id, d.title, d.devotional_date, d.daily_topic, d.category_slug, d.scripture_reference,
         d.theme_id, d.status, d.author_name,
         left(rich_text_plain(d.reflection), 220) as excerpt,
         count(*) over () as total
  from devotionals d, q
  where (q.text is null
         or d.search @@ q.tsq
         or position(lower(q.text) in lower(d.title)) > 0
         or position(lower(q.text) in lower(d.scripture_reference)) > 0)
    and (not q.adv or p_category is null or d.category_slug = p_category)
    and (not q.adv or p_grade is null or p_grade = any (d.grade_levels))
    and (not q.adv or p_theme is null or d.theme_id = p_theme)
    and (p_book is null or d.scripture_book = p_book)
    and (p_chapter is null or d.scripture_chapter = p_chapter)
    and (not q.adv or p_from is null or d.devotional_date >= p_from)
    and (not q.adv or p_through is null or d.devotional_date <= p_through)
    and (p_status is null or d.status = p_status)
    and (not p_only_live or d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now()))
  order by
    case when q.tsq is null then 0 else ts_rank(d.search, q.tsq) end desc,
    d.devotional_date desc, d.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- ---------------------------------------------------------------------------
-- Bookmark limit. Existing bookmarks are never removed; only adding more is blocked.
-- ---------------------------------------------------------------------------
create function enforce_bookmark_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if auth.uid() is null or not new.bookmarked then return new; end if;
  if tg_op = 'UPDATE' and old.bookmarked then return new; end if;
  if tg_op = 'INSERT' and exists (
       select 1 from devotional_user_state where user_id = new.user_id and devotional_id = new.devotional_id and bookmarked)
  then return new; end if;
  lim := plan_feature_value(new.user_id, 'bookmarks_limit');
  select count(*) into n from devotional_user_state where user_id = new.user_id and bookmarked;
  if n >= lim then
    raise exception 'You have reached the limit for saved devotionals on your plan.' using errcode = 'P0402';
  end if;
  return new;
end $$;
create trigger devotional_user_state_bookmark_limit before insert or update on devotional_user_state
  for each row execute function enforce_bookmark_limit();

-- ---------------------------------------------------------------------------
-- Personal collections (creating needs Educator Plus; reading and deleting never lock)
-- ---------------------------------------------------------------------------
create table user_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index user_collections_user on user_collections (user_id);
create table user_collection_items (
  collection_id uuid not null references user_collections on delete cascade,
  devotional_id uuid not null references devotionals on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, devotional_id)
);

alter table user_collections enable row level security;
alter table user_collection_items enable row level security;
revoke all on user_collections, user_collection_items from anon, authenticated;
grant select, delete on user_collections, user_collection_items to authenticated;
grant insert (name) on user_collections to authenticated;
grant update (name) on user_collections to authenticated;
grant insert (collection_id, devotional_id) on user_collection_items to authenticated;
create policy collections_select on user_collections for select to authenticated using (user_id = auth.uid());
create policy collections_insert on user_collections for insert to authenticated
  with check (user_id = auth.uid() and has_feature('collections'));
create policy collections_update on user_collections for update to authenticated
  using (user_id = auth.uid() and has_feature('collections')) with check (user_id = auth.uid());
create policy collections_delete on user_collections for delete to authenticated using (user_id = auth.uid());
create policy collection_items_select on user_collection_items for select to authenticated
  using (exists (select 1 from user_collections c where c.id = collection_id and c.user_id = auth.uid()));
create policy collection_items_insert on user_collection_items for insert to authenticated
  with check (has_feature('collections')
              and exists (select 1 from user_collections c where c.id = collection_id and c.user_id = auth.uid())
              and exists (select 1 from devotionals d where d.id = devotional_id));
create policy collection_items_delete on user_collection_items for delete to authenticated
  using (exists (select 1 from user_collections c where c.id = collection_id and c.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Premium resources (educator resources, weekly faculty devotionals, staff meetings, presentation materials)
-- ---------------------------------------------------------------------------
create table resources (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('educator_resource', 'faculty_devotional', 'staff_meeting', 'presentation_material')),
  title text not null check (length(btrim(title)) between 1 and 200),
  summary text not null default '' check (length(summary) <= 600),
  body jsonb,
  required_feature text not null references features,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  week_of date,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index resources_kind on resources (kind, status);
create trigger resources_updated before update on resources for each row execute function set_updated_at();
alter table resources enable row level security;
revoke all on resources from anon, authenticated;
grant select, delete on resources to authenticated;
grant insert (kind, title, summary, body, required_feature, status, week_of) on resources to authenticated;
grant update (title, summary, body, required_feature, status, week_of) on resources to authenticated;
create policy resources_read on resources for select to authenticated
  using ((status = 'published' and has_feature(required_feature)) or is_content_editor());
create policy resources_editor_insert on resources for insert to authenticated with check (is_content_editor());
create policy resources_editor_update on resources for update to authenticated
  using (is_content_editor()) with check (is_content_editor());
create policy resources_editor_delete on resources for delete to authenticated using (is_content_editor());

create function locked_resources()
returns table (id uuid, kind text, title text, summary text, week_of date, required_feature text)
language sql stable security definer set search_path = public as $$
  select r.id, r.kind, r.title, r.summary, r.week_of, r.required_feature
  from resources r
  where auth.uid() is not null and r.status = 'published' and not has_feature(r.required_feature)
  order by r.week_of desc nulls last, r.created_at desc
$$;

-- ---------------------------------------------------------------------------
-- Seats
-- ---------------------------------------------------------------------------
create function billing_fill_seats(sid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lic record; free_seats int;
begin
  if coalesce((select settings ->> 'auto_assign_seats' from schools where id = sid), 'true') = 'false' then return; end if;
  select * into lic from school_license_raw(sid);
  if not found then return; end if;
  select lic.seats - count(*) into free_seats from school_seats where school_id = sid;
  if free_seats <= 0 then return; end if;
  insert into school_seats (school_id, user_id)
  select sid, m.user_id from school_memberships m
  where m.school_id = sid and m.status = 'active'
    and not exists (select 1 from school_seats s where s.school_id = sid and s.user_id = m.user_id)
  order by m.created_at, m.user_id
  limit free_seats;
end $$;

create function assign_seat(sid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare lic record;
begin
  if not coalesce(has_school_role(sid, '{owner,admin}'), false) then
    raise exception 'Only a school owner or administrator can assign seats.' using errcode = '42501';
  end if;
  select * into lic from school_license_raw(sid);
  if not found then raise exception 'This school does not have an active license.' using errcode = 'P0402'; end if;
  if not exists (select 1 from school_memberships where school_id = sid and user_id = uid and status = 'active') then
    raise exception 'That person is not an active member of this school.' using errcode = 'P0002';
  end if;
  if exists (select 1 from school_seats where school_id = sid and user_id = uid) then return; end if;
  if (select count(*) from school_seats where school_id = sid) >= lic.seats then
    raise exception 'All licensed seats are in use. Release a seat or add seats.' using errcode = 'P0402';
  end if;
  insert into school_seats (school_id, user_id, assigned_by) values (sid, uid, auth.uid());
end $$;

create function release_seat(sid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(has_school_role(sid, '{owner,admin}'), false) then
    raise exception 'Only a school owner or administrator can release seats.' using errcode = '42501';
  end if;
  delete from school_seats where school_id = sid and user_id = uid;
end $$;

-- Seat roster for school managers. Names and roles only; no personal activity.
create function school_seat_status(sid uuid)
returns table (user_id uuid, first_name text, last_name text, role school_role, has_seat boolean, in_limit boolean, assigned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(has_school_role(sid, '{owner,admin}'), false) then
    raise exception 'Only a school owner or administrator can view seats.' using errcode = '42501';
  end if;
  return query
    select m.user_id, p.first_name, p.last_name, m.role, (s.user_id is not null),
           coalesce(s.user_id is not null and seat_in_limit(sid, m.user_id), false), s.assigned_at
    from school_memberships m
    join profiles p on p.id = m.user_id
    left join school_seats s on s.school_id = m.school_id and s.user_id = m.user_id
    where m.school_id = sid and m.status = 'active'
    order by p.last_name, p.first_name;
end $$;

-- Membership changes move seats. Nothing a person wrote is touched.
create function school_membership_seats() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record; replacement uuid;
begin
  if tg_op in ('INSERT', 'UPDATE') and new.status = 'active' then
    perform billing_fill_seats(new.school_id);
    return new;
  end if;
  -- Leaving, removal or suspension: release the seat.
  delete from school_seats where school_id = old.school_id and user_id = old.user_id;
  -- School-owned groups the person led pass to another school administrator; their membership in
  -- school groups ends. Their own posts remain attributed in the group; personal data is unaffected.
  for g in
    select cg.id from community_groups cg
    join group_memberships gm on gm.group_id = cg.id and gm.user_id = old.user_id
    where cg.school_id = old.school_id
  loop
    if exists (select 1 from group_memberships where group_id = g.id and user_id = old.user_id and role = 'owner') then
      select m.user_id into replacement from school_memberships m
        where m.school_id = old.school_id and m.status = 'active' and m.role in ('owner', 'admin')
          and m.user_id <> old.user_id
        order by (m.role = 'owner') desc, m.created_at limit 1;
      if replacement is null then continue; end if;
      insert into group_memberships (group_id, user_id, role) values (g.id, replacement, 'owner')
        on conflict (group_id, user_id) do update set role = 'owner';
    end if;
    delete from group_memberships where group_id = g.id and user_id = old.user_id;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger school_memberships_seats_ins after insert on school_memberships
  for each row execute function school_membership_seats();
create trigger school_memberships_seats_upd after update of status on school_memberships
  for each row when (old.status is distinct from new.status) execute function school_membership_seats();
create trigger school_memberships_seats_del after delete on school_memberships
  for each row execute function school_membership_seats();

-- A school with a live subscription cannot be deleted out from under its billing.
create function block_school_delete_with_subscription() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from subscriptions where school_id = old.id and status in ('active', 'trialing', 'past_due')) then
    raise exception 'Cancel the school subscription before deleting the school.' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger schools_block_delete before delete on schools for each row execute function block_school_delete_with_subscription();

-- ---------------------------------------------------------------------------
-- School tools: shared collections and assignments. Data survives a lapsed license and
-- reappears on renewal; only creating and reading the tools needs an active license.
-- ---------------------------------------------------------------------------
create table school_collections (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 500),
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index school_collections_school on school_collections (school_id);
create table school_collection_items (
  collection_id uuid not null references school_collections on delete cascade,
  devotional_id uuid not null references devotionals on delete cascade,
  added_at timestamptz not null default now(),
  primary key (collection_id, devotional_id)
);
create table school_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  devotional_id uuid not null references devotionals on delete cascade,
  note text not null default '' check (length(note) <= 500),
  due_date date,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index school_assignments_school on school_assignments (school_id, created_at desc);

alter table school_collections enable row level security;
alter table school_collection_items enable row level security;
alter table school_assignments enable row level security;
alter table school_seats enable row level security;
revoke all on school_collections, school_collection_items, school_assignments, school_seats from anon, authenticated;
grant select, delete on school_collections, school_collection_items, school_assignments, school_seats to authenticated;
grant insert (school_id, name, description) on school_collections to authenticated;
grant update (name, description) on school_collections to authenticated;
grant insert (collection_id, devotional_id) on school_collection_items to authenticated;
grant insert (school_id, devotional_id, note, due_date) on school_assignments to authenticated;
grant update (note, due_date) on school_assignments to authenticated;
-- Seats are written only by assign_seat / release_seat / the membership triggers.
revoke delete on school_seats from authenticated;

create policy school_seats_select on school_seats for select to authenticated
  using (user_id = auth.uid() or coalesce(has_school_role(school_id, '{owner,admin}'), false));

create policy school_collections_select on school_collections for select to authenticated
  using (school_has_feature(school_id, 'school_collections'));
create policy school_collections_insert on school_collections for insert to authenticated
  with check (coalesce(has_school_role(school_id, '{owner,admin}'), false) and school_has_feature(school_id, 'school_collections'));
create policy school_collections_update on school_collections for update to authenticated
  using (coalesce(has_school_role(school_id, '{owner,admin}'), false) and school_has_feature(school_id, 'school_collections'))
  with check (coalesce(has_school_role(school_id, '{owner,admin}'), false));
create policy school_collections_delete on school_collections for delete to authenticated
  using (coalesce(has_school_role(school_id, '{owner,admin}'), false));
create policy school_collection_items_select on school_collection_items for select to authenticated
  using (exists (select 1 from school_collections c where c.id = collection_id and school_has_feature(c.school_id, 'school_collections')));
create policy school_collection_items_insert on school_collection_items for insert to authenticated
  with check (exists (select 1 from school_collections c where c.id = collection_id
                      and coalesce(has_school_role(c.school_id, '{owner,admin}'), false)
                      and school_has_feature(c.school_id, 'school_collections'))
              and exists (select 1 from devotionals d where d.id = devotional_id));
create policy school_collection_items_delete on school_collection_items for delete to authenticated
  using (exists (select 1 from school_collections c where c.id = collection_id
                 and coalesce(has_school_role(c.school_id, '{owner,admin}'), false)));

create policy school_assignments_select on school_assignments for select to authenticated
  using (school_has_feature(school_id, 'school_assignments'));
create policy school_assignments_insert on school_assignments for insert to authenticated
  with check (coalesce(has_school_role(school_id, '{owner,admin}'), false) and school_has_feature(school_id, 'school_assignments')
              and exists (select 1 from devotionals d where d.id = devotional_id));
create policy school_assignments_update on school_assignments for update to authenticated
  using (coalesce(has_school_role(school_id, '{owner,admin}'), false) and school_has_feature(school_id, 'school_assignments'))
  with check (coalesce(has_school_role(school_id, '{owner,admin}'), false));
create policy school_assignments_delete on school_assignments for delete to authenticated
  using (coalesce(has_school_role(school_id, '{owner,admin}'), false));

-- Privacy-conscious analytics. Returns totals only, and only when enough people are counted
-- that no individual can be singled out. It reads completion of devotionals and nothing else:
-- never prayers, reflections, notes, bookmarks or group activity.
create function school_engagement(sid uuid, p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare k int := billing_setting_int('analytics_min_group', 5); people uuid[]; since timestamptz;
begin
  if not coalesce(has_school_role(sid, '{owner,admin}'), false) then
    raise exception 'Only a school owner or administrator can view analytics.' using errcode = '42501';
  end if;
  if not school_has_feature(sid, 'school_analytics') then
    raise exception 'School analytics are not part of this license.' using errcode = 'P0402';
  end if;
  since := now() - make_interval(days => least(greatest(p_days, 1), 365));
  select coalesce(array_agg(m.user_id), '{}') into people
  from school_memberships m join profiles p on p.id = m.user_id
  where m.school_id = sid and m.status = 'active' and p.share_school_aggregates;
  if cardinality(people) < k then
    return jsonb_build_object('suppressed', true, 'min_group', k);
  end if;
  return jsonb_build_object(
    'suppressed', false, 'min_group', k, 'counted_members', cardinality(people),
    'devotionals_completed', (select count(*) from devotional_user_state s
        where s.user_id = any (people) and s.completed_at >= since),
    'members_active', (select count(distinct s.user_id) from devotional_user_state s
        where s.user_id = any (people) and s.completed_at >= since),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object(
        'id', a.id, 'devotional_id', a.devotional_id, 'due_date', a.due_date,
        'completed', (select count(*) from devotional_user_state s
                      where s.user_id = any (people) and s.devotional_id = a.devotional_id and s.completed_at is not null))
        order by a.created_at desc)
      from school_assignments a where a.school_id = sid and a.created_at >= since - interval '90 days'), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Notices: derived from billing rows, shown before access changes. Codes only; the UI words them.
-- ---------------------------------------------------------------------------
create function my_billing_notices()
returns table (kind text, school_id uuid, school_name text, at timestamptz)
language sql stable security definer set search_path = public as $$
  -- Individual
  select 'trial_ending', null::uuid, null::text, s.trial_end from subscriptions s
   where s.user_id = auth.uid() and s.status = 'trialing' and not s.cancel_at_period_end
     and s.trial_end between now() and now() + make_interval(days => billing_setting_int('trial_notice_days', 3))
  union all
  select 'cancels_on', null, null, s.current_period_end from subscriptions s
   where s.user_id = auth.uid() and s.cancel_at_period_end and subscription_grants(s)
  union all
  select 'payment_failed', null, null, s.current_period_end + make_interval(days => billing_setting_int('past_due_grace_days', 7))
   from subscriptions s where s.user_id = auth.uid() and s.status = 'past_due' and subscription_grants(s)
  union all
  select 'expired', null, null, coalesce(s.ended_at, s.current_period_end) from subscriptions s
   where s.user_id = auth.uid() and not subscription_grants(s)
     and coalesce(s.ended_at, s.current_period_end) > now() - interval '60 days'
     and not exists (select 1 from subscriptions o where o.user_id = s.user_id and subscription_grants(o))
  union all
  -- School members
  select 'school_no_seat', m.school_id, sc.name, null::timestamptz
   from school_memberships m join schools sc on sc.id = m.school_id
   where m.user_id = auth.uid() and m.status = 'active'
     and exists (select 1 from school_license_raw(m.school_id))
     and not exists (select 1 from school_seats st where st.school_id = m.school_id and st.user_id = m.user_id)
  union all
  select 'school_seat_over_limit', m.school_id, sc.name, null
   from school_memberships m join schools sc on sc.id = m.school_id
   where m.user_id = auth.uid() and m.status = 'active'
     and exists (select 1 from school_seats st where st.school_id = m.school_id and st.user_id = m.user_id)
     and not seat_in_limit(m.school_id, m.user_id)
     and exists (select 1 from school_license_raw(m.school_id))
  union all
  select 'school_lapsed', m.school_id, sc.name,
         (select max(coalesce(s.ended_at, s.current_period_end)) from subscriptions s where s.school_id = m.school_id)
   from school_memberships m join schools sc on sc.id = m.school_id
   where m.user_id = auth.uid() and m.status = 'active'
     and exists (select 1 from subscriptions s where s.school_id = m.school_id)
     and not exists (select 1 from school_license_raw(m.school_id))
     and (select max(coalesce(s.ended_at, s.current_period_end)) from subscriptions s where s.school_id = m.school_id) > now() - interval '60 days'
  union all
  -- School administrators
  select 'school_payment_failed', s.school_id, sc.name, s.current_period_end + make_interval(days => billing_setting_int('past_due_grace_days', 7))
   from subscriptions s join schools sc on sc.id = s.school_id
   where s.status = 'past_due' and subscription_grants(s) and coalesce(has_school_role(s.school_id, '{owner,admin}'), false)
  union all
  select 'school_cancels_on', s.school_id, sc.name, s.current_period_end
   from subscriptions s join schools sc on sc.id = s.school_id
   where s.cancel_at_period_end and subscription_grants(s) and coalesce(has_school_role(s.school_id, '{owner,admin}'), false)
  union all
  select 'school_trial_ending', s.school_id, sc.name, s.trial_end
   from subscriptions s join schools sc on sc.id = s.school_id
   where s.status = 'trialing' and not s.cancel_at_period_end
     and s.trial_end between now() and now() + make_interval(days => billing_setting_int('trial_notice_days', 3))
     and coalesce(has_school_role(s.school_id, '{owner,admin}'), false)
  union all
  select 'school_out_of_seats', l.sid, sc.name, null
   from (select m.school_id as sid from school_memberships m
         where m.status = 'active' and coalesce(has_school_role(m.school_id, '{owner,admin}'), false)
           and m.user_id = auth.uid()) l
   join schools sc on sc.id = l.sid
   where exists (select 1 from school_license_raw(l.sid))
     and (select count(*) from school_memberships x where x.school_id = l.sid and x.status = 'active')
         > (select seats from school_license_raw(l.sid))
$$;

-- ---------------------------------------------------------------------------
-- Groups: creating one needs the entitlement. Existing groups never lock when a plan lapses.
-- ---------------------------------------------------------------------------
create or replace function create_group(
  p_name text, p_description text, p_purpose text, p_guidelines text,
  p_category text, p_privacy group_privacy, p_school uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  policy text := community_setting_text('group_creation');
  gid uuid;
  owned int;
  admin_somewhere boolean;
begin
  if not community_entitled() then raise exception 'Verify your email to use groups.' using errcode = '42501'; end if;
  if not community_flag('groups_enabled') then raise exception 'Groups are not available right now.' using errcode = 'P0001'; end if;
  if community_restricted(uid) then raise exception 'Your community access is restricted.' using errcode = '42501'; end if;
  select exists (select 1 from school_memberships where user_id = uid and status = 'active' and role in ('owner', 'admin'))
    into admin_somewhere;
  if policy = 'staff' and not is_community_moderator() then
    raise exception 'Groups are created by the platform team right now.' using errcode = '42501';
  end if;
  if policy = 'school_admins' and not (admin_somewhere or is_community_moderator()) then
    raise exception 'Groups are created by school administrators right now.' using errcode = '42501';
  end if;
  if p_school is not null and not coalesce(has_school_role(p_school, '{owner,admin}'), false) then
    raise exception 'Only a school owner or administrator can create a school group.' using errcode = '42501';
  end if;
  if p_school is not null and not (school_has_feature(p_school, 'school_groups') or is_community_moderator()) then
    raise exception 'Your school license does not include school groups.' using errcode = 'P0402';
  end if;
  if p_school is null and not (has_feature('create_groups') or is_community_moderator()) then
    raise exception 'Creating a group is part of Educator Plus. You can still join groups you are invited to.' using errcode = 'P0402';
  end if;
  select count(*) into owned from group_memberships where user_id = uid and role = 'owner';
  if owned >= coalesce(community_setting_text('max_groups_owned_per_user')::int, 3) then
    raise exception 'You have reached the limit for groups you can lead.' using errcode = 'P0001';
  end if;
  perform community_rate_gate(uid, 'create_group', 3, 6);
  insert into community_groups (name, description, purpose, guidelines, category, privacy, school_id, created_by)
  values (btrim(p_name), coalesce(p_description, ''), coalesce(p_purpose, ''), coalesce(p_guidelines, ''),
          p_category, p_privacy, p_school, uid)
  returning id into gid;
  insert into group_memberships (group_id, user_id, role) values (gid, uid, 'owner');
  return gid;
end $$;

-- Deleting an account must not leave a paying subscription behind.
create or replace function account_deletion_blockers() returns setof text
language sql stable security definer set search_path = public as $$
  select s.name
  from school_memberships m
  join schools s on s.id = m.school_id
  where m.user_id = auth.uid() and m.role = 'owner'
    and not exists (
      select 1 from school_memberships o
      where o.school_id = m.school_id and o.role = 'owner' and o.status = 'active'
        and o.user_id <> m.user_id)
  union all
  select g.name
  from group_memberships m
  join community_groups g on g.id = m.group_id
  where m.user_id = auth.uid() and m.role = 'owner'
    and exists (select 1 from group_memberships o where o.group_id = m.group_id and o.user_id <> m.user_id)
  union all
  select 'billing:' || p.name
  from subscriptions s join plans p on p.key = s.plan_key
  where s.user_id = auth.uid() and s.status in ('active', 'trialing', 'past_due') and not s.cancel_at_period_end
$$;

-- ---------------------------------------------------------------------------
-- Client access to billing rows (read-only; the server writes everything)
-- ---------------------------------------------------------------------------
alter table plans enable row level security;
alter table features enable row level security;
alter table plan_features enable row level security;
alter table plan_prices enable row level security;
alter table billing_settings enable row level security;
alter table billing_customers enable row level security;
alter table subscriptions enable row level security;
alter table billing_invoices enable row level security;
alter table stripe_events enable row level security;
alter table entitlement_grants enable row level security;
revoke all on plans, features, plan_features, plan_prices, billing_settings, billing_customers,
  subscriptions, billing_invoices, stripe_events, entitlement_grants from anon, authenticated;

grant select on plans, features, plan_features to anon, authenticated;
grant select (id, plan_key, plan_interval, currency, unit_amount, per_seat, active, display_note) on plan_prices to anon, authenticated;
grant select on billing_settings to authenticated;
grant select (id, owner_type, user_id, school_id, plan_key, plan_interval, status, seats, current_period_start, current_period_end,
              trial_end, cancel_at_period_end, canceled_at, ended_at, created_at) on subscriptions to authenticated;
grant select on billing_invoices to authenticated;
grant select on entitlement_grants to authenticated;

create policy plans_read on plans for select using (is_public);
create policy features_read on features for select using (true);
create policy plan_features_read on plan_features for select using (true);
create policy plan_prices_read on plan_prices for select using (active);
create policy billing_settings_read on billing_settings for select to authenticated using (true);
create policy subscriptions_read on subscriptions for select to authenticated
  using (user_id = auth.uid() or (school_id is not null and coalesce(has_school_role(school_id, '{owner,admin}'), false)));
create policy billing_invoices_read on billing_invoices for select to authenticated
  using (user_id = auth.uid() or (school_id is not null and coalesce(has_school_role(school_id, '{owner,admin}'), false)));
create policy entitlement_grants_read on entitlement_grants for select to authenticated
  using (user_id = auth.uid() or coalesce(has_platform_role('{platform_admin}'), false));

-- ---------------------------------------------------------------------------
-- Administration (platform administrators). Everything a price or plan needs is data.
-- ---------------------------------------------------------------------------
create function billing_admin_check() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(has_platform_role('{platform_admin}'), false) then
    raise exception 'Platform administrators only.' using errcode = '42501';
  end if;
end $$;

create function admin_set_plan_feature(p_plan text, p_feature text, p_enabled boolean, p_limit int default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform billing_admin_check();
  update plan_features set enabled = p_enabled, limit_value = case when p_enabled then p_limit else null end
   where plan_key = p_plan and feature_key = p_feature;
  if not found then raise exception 'Unknown plan or feature.' using errcode = 'P0002'; end if;
end $$;

create function admin_update_plan(p_plan text, p_name text, p_tagline text, p_trial_days int, p_public boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform billing_admin_check();
  update plans set name = btrim(p_name), tagline = btrim(coalesce(p_tagline, '')), trial_days = p_trial_days,
         is_public = p_public, updated_at = now() where key = p_plan;
  if not found then raise exception 'Unknown plan.' using errcode = 'P0002'; end if;
end $$;

create function admin_list_prices()
returns table (id uuid, plan_key text, plan_interval billing_interval, stripe_price_id text, currency text,
               unit_amount int, per_seat boolean, active boolean, display_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform billing_admin_check();
  return query select p.id, p.plan_key, p.plan_interval, p.stripe_price_id, p.currency, p.unit_amount, p.per_seat, p.active, p.display_note
    from plan_prices p order by p.plan_key, p.plan_interval;
end $$;

create function admin_set_price(p_plan text, p_interval billing_interval, p_stripe_price_id text, p_currency text,
                                p_amount int, p_active boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform billing_admin_check();
  update plan_prices set stripe_price_id = nullif(btrim(coalesce(p_stripe_price_id, '')), ''),
         currency = lower(nullif(btrim(coalesce(p_currency, '')), '')), unit_amount = p_amount,
         active = p_active and nullif(btrim(coalesce(p_stripe_price_id, '')), '') is not null,
         display_note = btrim(coalesce(p_note, ''))
   where plan_key = p_plan and plan_interval = p_interval;
  if not found then raise exception 'Unknown plan or interval.' using errcode = 'P0002'; end if;
end $$;

create function admin_set_billing_setting(p_key text, p_value int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform billing_admin_check();
  if p_value < 0 or p_value > 3650 then raise exception 'Out of range.' using errcode = '22023'; end if;
  update billing_settings set value = to_jsonb(p_value), updated_at = now() where key = p_key;
  if not found then raise exception 'Unknown setting.' using errcode = 'P0002'; end if;
end $$;

create function admin_grant_plan(p_user uuid, p_plan text, p_reason text, p_expires timestamptz default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  perform billing_admin_check();
  if not exists (select 1 from plans where key = p_plan and audience = 'individual') then
    raise exception 'Choose an individual plan.' using errcode = '22023';
  end if;
  insert into entitlement_grants (user_id, plan_key, reason, expires_at, created_by)
  values (p_user, p_plan, btrim(p_reason), p_expires, auth.uid()) returning id into gid;
  return gid;
end $$;

create function admin_revoke_grant(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform billing_admin_check();
  update entitlement_grants set revoked_at = now() where id = p_id and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Webhook application: idempotent, order-aware, atomic. Service role only.
-- ---------------------------------------------------------------------------
create function billing_to_ts(v text) returns timestamptz
language sql immutable as $$ select case when v is null or v = '' then null else to_timestamp(v::bigint) end $$;

-- Who does this belong to? A known customer wins; otherwise the owner the server recorded in metadata.
create function billing_resolve_owner(p_customer text, p_meta jsonb,
                                      out o_type text, out o_user uuid, out o_school uuid)
language plpgsql security definer set search_path = public as $$
declare c billing_customers; t text; i uuid;
begin
  select * into c from billing_customers where stripe_customer_id = p_customer;
  if found then o_type := c.owner_type; o_user := c.user_id; o_school := c.school_id; return; end if;
  t := p_meta ->> 'owner_type';
  begin i := (p_meta ->> 'owner_id')::uuid; exception when others then i := null; end;
  if p_customer is null or t is null or i is null then return; end if;
  if t = 'user' and exists (select 1 from auth.users where id = i) then
    insert into billing_customers (owner_type, user_id, stripe_customer_id) values ('user', i, p_customer)
      on conflict do nothing;
    o_type := 'user'; o_user := i;
  elsif t = 'school' and exists (select 1 from schools where id = i) then
    insert into billing_customers (owner_type, school_id, stripe_customer_id) values ('school', i, p_customer)
      on conflict do nothing;
    o_type := 'school'; o_school := i;
  end if;
  -- A conflicting row (customer already linked to someone else) is resolved by the first lookup next time.
  select * into c from billing_customers where stripe_customer_id = p_customer;
  if found then o_type := c.owner_type; o_user := c.user_id; o_school := c.school_id; end if;
end $$;

create function billing_apply_event(p_event jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  eid text := p_event ->> 'id';
  etype text := p_event ->> 'type';
  ecreated timestamptz;
  obj jsonb := p_event #> '{data,object}';
  n int;
  result text;
  o record;
  price_id text; pp plan_prices; pl plans;
  meta jsonb;
  stat subscription_status;
  cust text;
begin
  if eid is null or etype is null or obj is null or (p_event ->> 'created') is null then
    raise exception 'Malformed billing event.' using errcode = '22023';
  end if;
  ecreated := billing_to_ts(p_event ->> 'created');

  insert into stripe_events (id, type, created) values (eid, etype, ecreated) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from stripe_events where id = eid and processed_at is not null) then
    return 'duplicate';
  end if;

  if etype = 'checkout.session.completed' then
    meta := coalesce(obj -> 'metadata', '{}'::jsonb);
    select * into o from billing_resolve_owner(obj ->> 'customer', meta);
    result := case when o.o_type is null then 'ignored: owner unknown' else 'customer linked' end;

  elsif etype in ('customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted') then
    price_id := obj #>> '{items,data,0,price,id}';
    select * into pp from plan_prices where stripe_price_id = price_id;
    if not found then
      result := 'ignored: unknown price';
    else
      select * into pl from plans where key = pp.plan_key;
      meta := coalesce(obj -> 'metadata', '{}'::jsonb);
      select * into o from billing_resolve_owner(obj ->> 'customer', meta);
      if o.o_type is null then
        raise exception 'Cannot match subscription % to an account yet.', obj ->> 'id' using errcode = 'P0002';
      end if;
      if (pl.audience = 'school') is distinct from (o.o_type = 'school') then
        result := 'ignored: plan does not match owner type';
      else
        stat := case when etype = 'customer.subscription.deleted' then 'canceled'
                     else (obj ->> 'status')::subscription_status end;
        insert into subscriptions (owner_type, user_id, school_id, plan_key, plan_interval, status, stripe_subscription_id,
            stripe_price_id, seats, current_period_start, current_period_end, trial_end, cancel_at_period_end,
            canceled_at, ended_at, last_event_created)
        values (o.o_type, o.o_user, o.o_school, pp.plan_key, pp.plan_interval, stat, obj ->> 'id', price_id,
            case when pl.audience = 'school' then greatest(coalesce((obj #>> '{items,data,0,quantity}')::int, 1), 1) else 1 end,
            billing_to_ts(coalesce(obj ->> 'current_period_start', obj #>> '{items,data,0,current_period_start}')),
            billing_to_ts(coalesce(obj ->> 'current_period_end', obj #>> '{items,data,0,current_period_end}')),
            billing_to_ts(obj ->> 'trial_end'),
            coalesce((obj ->> 'cancel_at_period_end')::boolean, false) or (obj ->> 'cancel_at') is not null,
            billing_to_ts(obj ->> 'canceled_at'), billing_to_ts(obj ->> 'ended_at'), ecreated)
        on conflict (stripe_subscription_id) do update set
            plan_key = excluded.plan_key, plan_interval = excluded.plan_interval, status = excluded.status,
            stripe_price_id = excluded.stripe_price_id, seats = excluded.seats,
            current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
            trial_end = excluded.trial_end, cancel_at_period_end = excluded.cancel_at_period_end,
            canceled_at = excluded.canceled_at, ended_at = excluded.ended_at,
            last_event_created = excluded.last_event_created
          where subscriptions.last_event_created <= excluded.last_event_created;
        get diagnostics n = row_count;
        if n = 0 then
          result := 'stale';
        else
          result := 'subscription ' || stat::text;
          if billing_to_ts(obj ->> 'trial_end') is not null then
            update billing_customers set had_trial = true where stripe_customer_id = obj ->> 'customer';
          end if;
          if o.o_type = 'school' then perform billing_fill_seats(o.o_school); end if;
        end if;
      end if;
    end if;

  elsif etype in ('invoice.paid', 'invoice.payment_failed', 'invoice.finalized', 'invoice.payment_succeeded') then
    cust := obj ->> 'customer';
    meta := coalesce(obj #> '{subscription_details,metadata}', obj -> 'metadata', '{}'::jsonb);
    select * into o from billing_resolve_owner(cust, meta);
    if o.o_type is null then
      result := 'ignored: owner unknown';
    else
      insert into billing_invoices (stripe_invoice_id, owner_type, user_id, school_id, status, amount_due, amount_paid,
          currency, hosted_invoice_url, invoice_pdf, last_event_created)
      values (obj ->> 'id', o.o_type, o.o_user, o.o_school, coalesce(obj ->> 'status', 'open'),
          (obj ->> 'amount_due')::int, (obj ->> 'amount_paid')::int, lower(obj ->> 'currency'),
          obj ->> 'hosted_invoice_url', obj ->> 'invoice_pdf', ecreated)
      on conflict (stripe_invoice_id) do update set
          status = excluded.status, amount_due = excluded.amount_due, amount_paid = excluded.amount_paid,
          currency = excluded.currency,
          hosted_invoice_url = coalesce(excluded.hosted_invoice_url, billing_invoices.hosted_invoice_url),
          invoice_pdf = coalesce(excluded.invoice_pdf, billing_invoices.invoice_pdf),
          last_event_created = excluded.last_event_created
        where billing_invoices.last_event_created <= excluded.last_event_created;
      get diagnostics n = row_count;
      result := case when n = 0 then 'stale' else 'invoice ' || coalesce(obj ->> 'status', 'open') end;
    end if;

  else
    result := 'ignored: ' || etype;
  end if;

  update stripe_events set processed_at = now(), outcome = result where id = eid;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
-- New functions are closed to the public and visitors and open to signed-in users, except the
-- server-only ones. Entitlement internals that take a user id are never callable by clients.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.oid not in (select oid from _pre_0006_fns)
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname not in ('billing_apply_event', 'billing_resolve_owner', 'billing_to_ts', 'billing_fill_seats',
                         'billing_setting_int', 'subscription_grants', 'school_license_raw', 'seat_in_limit',
                         'user_plan_keys', 'plan_feature_value', 'school_membership_seats',
                         'block_school_delete_with_subscription', 'enforce_bookmark_limit') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
-- Anonymous visitors may read the public comparison only (tables above); nothing else.
revoke all on function create_group(text, text, text, text, text, group_privacy, uuid) from public, anon;
grant execute on function create_group(text, text, text, text, text, group_privacy, uuid) to authenticated;
revoke all on function account_deletion_blockers() from public, anon;
grant execute on function account_deletion_blockers() to authenticated;
revoke all on function search_devotionals(text, text, text, uuid, date, date, devotional_status, boolean, int, int, text, int) from public, anon;
grant execute on function search_devotionals(text, text, text, uuid, date, date, devotional_status, boolean, int, int, text, int) to authenticated;
revoke all on function devotional_is_live(uuid) from public, anon;
grant execute on function devotional_is_live(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function billing_apply_event(jsonb) to service_role;
    grant execute on function billing_fill_seats(uuid) to service_role;
    grant all on billing_customers, subscriptions, billing_invoices, stripe_events, entitlement_grants, school_seats to service_role;
    grant select on plans, features, plan_features, plan_prices, billing_settings to service_role;
  end if;
end $$;

drop table _pre_0006_fns;
