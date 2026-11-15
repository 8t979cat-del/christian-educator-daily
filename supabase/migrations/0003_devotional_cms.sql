-- Devotional content management: structure, licensing, editorial workflow, weekly themes, search.
--
-- The placeholder devotionals/topics tables from 0001 held no data and no code
-- used them, so they are replaced here rather than altered.
--
-- Design rules enforced IN THE DATABASE (not just in the UI):
--   * Workflow status can only change through transition_devotional(), which
--     checks role, allowed transition, completeness, licensing and separation
--     of duties. Clients have no UPDATE privilege on the status columns.
--   * Scripture text can only be stored for a translation whose licence allows it.
--   * Editing approved or scheduled content returns it to draft for re-approval.
--   * Readers only ever see live (published, or scheduled and due) content.

drop table if exists devotional_topics;
drop table if exists devotionals cascade;
drop table if exists topics;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create type devotional_status as enum
  ('draft', 'in_review', 'approved', 'scheduled', 'published', 'archived');

-- Plain text of a rich-text document (ProseMirror JSON): every "text" leaf, space-joined.
create function rich_text_plain(doc jsonb) returns text
language sql immutable as $$
  select coalesce(string_agg(t, ' '), '')
  from jsonb_array_elements_text(jsonb_path_query_array(doc, 'strict $.**.text')) as t
$$;

create function is_content_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select has_platform_role('{platform_admin,content_editor}')
$$;

-- ---------------------------------------------------------------------------
-- Categories (fixed reference data) and educational contexts
-- ---------------------------------------------------------------------------
create table devotional_categories (
  slug text primary key,
  name text not null,
  sort_order int not null
);
insert into devotional_categories (slug, name, sort_order) values
  ('patience', 'Patience', 1),
  ('compassion', 'Compassion', 2),
  ('forgiveness', 'Forgiveness', 3),
  ('gratitude', 'Gratitude', 4),
  ('perseverance', 'Perseverance', 5),
  ('purpose', 'Purpose', 6),
  ('humility', 'Humility', 7),
  ('leadership', 'Leadership', 8),
  ('stewardship', 'Stewardship', 9),
  ('courage', 'Courage', 10),
  ('integrity', 'Integrity', 11),
  ('service', 'Service', 12),
  ('relationships', 'Relationships', 13),
  ('anxiety-uncertainty', 'Anxiety and uncertainty', 14),
  ('burnout-encouragement', 'Burnout and encouragement', 15);

-- ---------------------------------------------------------------------------
-- Bible translations and licensing controls
-- ---------------------------------------------------------------------------
-- A translation is "reference only" unless an administrator records that its
-- text may be shown. Licensed translations must carry the attribution that
-- is displayed with the text. This is a record of terms entered by staff, not
-- legal advice: confirm each translation's terms with its publisher.
create table bible_translations (
  code text primary key check (code ~ '^[a-z0-9]{2,10}$'),
  name text not null,
  license_type text not null check (license_type in ('public_domain', 'licensed', 'reference_only')),
  text_allowed boolean not null default false,
  attribution text,
  license_notes text,
  license_verified_by uuid references auth.users on delete set null,
  license_verified_at timestamptz,
  sort_order int not null default 100,
  updated_at timestamptz not null default now(),
  constraint reference_only_has_no_text check (license_type <> 'reference_only' or not text_allowed),
  constraint licensed_text_needs_attribution check (
    license_type <> 'licensed' or not text_allowed or length(btrim(coalesce(attribution, ''))) > 0
  )
);
create trigger bible_translations_updated before update on bible_translations
  for each row execute function set_updated_at();

insert into bible_translations (code, name, license_type, text_allowed, attribution, license_notes, sort_order) values
  ('web', 'World English Bible', 'public_domain', true, 'World English Bible (WEB), public domain.', 'Public domain.', 1),
  ('kjv', 'King James Version', 'public_domain', true, 'King James Version (KJV), public domain in the United States.', 'Public domain in the United States. The KJV is subject to a Crown patent in the United Kingdom.', 2),
  ('asv', 'American Standard Version', 'public_domain', true, 'American Standard Version (ASV), public domain.', 'Public domain.', 3),
  ('niv', 'New International Version', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 10),
  ('esv', 'English Standard Version', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 11),
  ('nlt', 'New Living Translation', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 12),
  ('nasb', 'New American Standard Bible', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 13),
  ('csb', 'Christian Standard Bible', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 14),
  ('nkjv', 'New King James Version', 'reference_only', false, null, 'Copyrighted. Reference only until a licence is recorded.', 15);

-- ---------------------------------------------------------------------------
-- Weekly themes
-- ---------------------------------------------------------------------------
create table weekly_themes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 140),
  summary text not null default '' check (length(summary) <= 1000),
  week_start date not null unique check (extract(isodow from week_start) = 1), -- a Monday
  category_slug text references devotional_categories,
  published_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger weekly_themes_updated before update on weekly_themes
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Devotionals
-- ---------------------------------------------------------------------------
create table devotionals (
  id uuid primary key default gen_random_uuid(),
  title text not null default '' check (length(title) <= 140),
  devotional_date date not null,
  theme_id uuid references weekly_themes on delete restrict,
  daily_topic text not null default '' check (length(daily_topic) <= 140),
  category_slug text references devotional_categories,
  scripture_reference text not null default '' check (length(scripture_reference) <= 120),
  -- Parsed from the reference by the application, so "John 3" finds John 3 and not 1 John 3.
  scripture_book text check (length(scripture_book) <= 30),
  scripture_chapter int check (scripture_chapter between 1 and 150),
  translation_code text references bible_translations,
  scripture_text text check (length(scripture_text) <= 6000),
  reflection jsonb not null default '{"type":"doc","content":[]}',
  prayer jsonb not null default '{"type":"doc","content":[]}',
  discussion_question jsonb not null default '{"type":"doc","content":[]}',
  practical_application jsonb not null default '{"type":"doc","content":[]}',
  audience text check (audience in ('teachers', 'school_leaders', 'all_staff')),
  grade_levels text[] not null default '{}' check (grade_levels <@ array['k2', 'g35', 'g68', 'g912']),
  educational_category text check (educational_category in
    ('classroom', 'faculty_community', 'faith_and_learning', 'school_leadership', 'personal_renewal')),
  author_id uuid references auth.users on delete set null,
  author_name text not null default '' check (length(author_name) <= 120),
  status devotional_status not null default 'draft',
  publish_at timestamptz,
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users on delete set null,
  updated_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector,
  constraint scheduled_has_time check (status <> 'scheduled' or publish_at is not null),
  unique (theme_id, devotional_date)
);
-- At most one live or scheduled devotional per calendar day.
create unique index devotionals_one_live_per_day on devotionals (devotional_date)
  where status in ('scheduled', 'published');
create index devotionals_date_idx on devotionals (devotional_date desc);
create index devotionals_status_idx on devotionals (status);
create index devotionals_search_idx on devotionals using gin (search);
create index devotionals_scripture_idx on devotionals (scripture_book, scripture_chapter);

create trigger devotionals_updated before update on devotionals
  for each row execute function set_updated_at();

create table devotional_events (
  id bigint generated always as identity primary key,
  devotional_id uuid not null references devotionals on delete cascade,
  actor_id uuid references auth.users on delete set null,
  from_status devotional_status,
  to_status devotional_status not null,
  note text,
  created_at timestamptz not null default now()
);
create index devotional_events_idx on devotional_events (devotional_id, created_at);

create table devotional_revisions (
  id bigint generated always as identity primary key,
  devotional_id uuid not null references devotionals on delete cascade,
  editor_id uuid references auth.users on delete set null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index devotional_revisions_idx on devotional_revisions (devotional_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Write-time rules
-- ---------------------------------------------------------------------------
create function devotionals_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws date;
  cat_name text;
  content_changed boolean;
begin
  new.title := btrim(new.title);
  new.daily_topic := btrim(new.daily_topic);
  new.scripture_reference := btrim(new.scripture_reference);
  new.author_name := btrim(new.author_name);
  new.scripture_text := nullif(btrim(coalesce(new.scripture_text, '')), '');
  new.updated_by := uid;

  if tg_op = 'INSERT' then
    new.created_by := uid;
    new.author_id := uid;
    if new.author_name = '' and uid is not null then
      select coalesce(nullif(btrim(first_name || ' ' || last_name), ''), '') into new.author_name
      from profiles where id = uid;
      new.author_name := coalesce(new.author_name, '');
    end if;
  else
    content_changed :=
      (new.title, new.devotional_date, new.theme_id, new.daily_topic, new.category_slug,
       new.scripture_reference, new.translation_code, new.reflection, new.prayer,
       new.discussion_question, new.practical_application, new.audience, new.grade_levels,
       new.educational_category, new.author_name)
      is distinct from
      (old.title, old.devotional_date, old.theme_id, old.daily_topic, old.category_slug,
       old.scripture_reference, old.translation_code, old.reflection, old.prayer,
       old.discussion_question, old.practical_application, old.audience, old.grade_levels,
       old.educational_category, old.author_name)
      or (new.scripture_text is not null and new.scripture_text is distinct from old.scripture_text);

    if content_changed and old.status = 'archived' and new.status = 'archived' then
      raise exception 'archived devotionals are read-only; restore to draft to edit' using errcode = 'P0001';
    end if;

    -- Content approved for release must be re-approved after any change.
    if content_changed and old.status in ('approved', 'scheduled') and new.status = old.status then
      new.status := 'draft';
      new.approved_by := null;
      new.approved_at := null;
      new.publish_at := null;
      insert into devotional_events (devotional_id, actor_id, from_status, to_status, note)
      values (old.id, uid, old.status, 'draft', 'Edited after approval; returned to draft for re-approval.');
    end if;
  end if;

  -- Scripture text only for translations whose licence allows it.
  if new.scripture_text is not null then
    if new.translation_code is null
       or not exists (select 1 from bible_translations t where t.code = new.translation_code and t.text_allowed) then
      raise exception 'the licence for this translation does not allow its text to be stored or shown; use a reference only'
        using errcode = 'P0001';
    end if;
  end if;

  -- A theme's devotionals fall on its Monday to Friday.
  if new.theme_id is not null then
    select week_start into ws from weekly_themes where id = new.theme_id;
    if new.devotional_date < ws or new.devotional_date > ws + 4 then
      raise exception 'a devotional in a weekly theme must be dated Monday to Friday of that week' using errcode = 'P0001';
    end if;
  end if;

  select name into cat_name from devotional_categories where slug = new.category_slug;
  new.search :=
    setweight(to_tsvector('english', new.title || ' ' || new.daily_topic), 'A')
    || setweight(to_tsvector('english', new.scripture_reference || ' ' || coalesce(cat_name, '')), 'B')
    || setweight(to_tsvector('english',
         rich_text_plain(new.reflection) || ' ' || rich_text_plain(new.prayer) || ' '
         || rich_text_plain(new.discussion_question) || ' ' || rich_text_plain(new.practical_application)), 'C')
    || setweight(to_tsvector('english', coalesce(new.scripture_text, '')), 'D');

  return new;
end $$;

create trigger devotionals_before_write before insert or update on devotionals
  for each row execute function devotionals_before_write();

create function devotionals_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.title, old.daily_topic, old.scripture_reference, old.scripture_text, old.reflection, old.prayer,
      old.discussion_question, old.practical_application, old.devotional_date, old.category_slug,
      old.translation_code, old.audience, old.grade_levels, old.educational_category, old.author_name, old.theme_id)
     is distinct from
     (new.title, new.daily_topic, new.scripture_reference, new.scripture_text, new.reflection, new.prayer,
      new.discussion_question, new.practical_application, new.devotional_date, new.category_slug,
      new.translation_code, new.audience, new.grade_levels, new.educational_category, new.author_name, new.theme_id) then
    insert into devotional_revisions (devotional_id, editor_id, snapshot)
    values (old.id, auth.uid(), to_jsonb(old) - 'search');
  end if;
  return null;
end $$;

create trigger devotionals_after_update after update on devotionals
  for each row execute function devotionals_after_update();

-- Withdrawing a translation's text permission removes stored text immediately.
create function bible_translations_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.text_allowed and not new.text_allowed then
    update devotionals set scripture_text = null
    where translation_code = new.code and scripture_text is not null;
  end if;
  return null;
end $$;

create trigger bible_translations_after_update after update on bible_translations
  for each row execute function bible_translations_after_update();

-- A theme's week cannot move once it has devotionals.
create function weekly_themes_before_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.week_start <> old.week_start and exists (select 1 from devotionals where theme_id = old.id) then
    raise exception 'remove the theme''s devotionals before changing its week' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger weekly_themes_before_update before update on weekly_themes
  for each row execute function weekly_themes_before_update();

-- ---------------------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------------------
alter table devotional_categories enable row level security;
alter table bible_translations enable row level security;
alter table weekly_themes enable row level security;
alter table devotionals enable row level security;
alter table devotional_events enable row level security;
alter table devotional_revisions enable row level security;

revoke all on devotional_categories, bible_translations, weekly_themes, devotionals,
  devotional_events, devotional_revisions from anon, authenticated;

grant select on devotional_categories to authenticated;
create policy categories_read on devotional_categories for select to authenticated using (true);

grant select on bible_translations to authenticated;
grant update (name, license_type, text_allowed, attribution, license_notes, license_verified_by, license_verified_at)
  on bible_translations to authenticated;
grant insert (code, name, license_type, text_allowed, attribution, license_notes, license_verified_by, license_verified_at)
  on bible_translations to authenticated;
create policy translations_read on bible_translations for select to authenticated using (true);
create policy translations_admin_insert on bible_translations for insert to authenticated
  with check (has_platform_role('{platform_admin}'));
create policy translations_admin_update on bible_translations for update to authenticated
  using (has_platform_role('{platform_admin}')) with check (has_platform_role('{platform_admin}'));

grant select, delete on weekly_themes to authenticated;
grant insert (title, summary, week_start, category_slug, created_by) on weekly_themes to authenticated;
grant update (title, summary, week_start, category_slug) on weekly_themes to authenticated;
create policy themes_read on weekly_themes for select to authenticated
  using (published_at is not null or is_content_editor());
create policy themes_editor_insert on weekly_themes for insert to authenticated
  with check (is_content_editor() and created_by = auth.uid());
create policy themes_editor_update on weekly_themes for update to authenticated
  using (is_content_editor()) with check (is_content_editor());
create policy themes_editor_delete on weekly_themes for delete to authenticated
  using (is_content_editor() and published_at is null);

-- Editors may write content columns only. Status, approval and publication
-- columns are written exclusively by the transition functions below.
grant select, delete on devotionals to authenticated;
grant insert (title, devotional_date, theme_id, daily_topic, category_slug, scripture_reference,
  scripture_book, scripture_chapter, translation_code, scripture_text, reflection, prayer, discussion_question, practical_application,
  audience, grade_levels, educational_category, author_name) on devotionals to authenticated;
grant update (title, devotional_date, theme_id, daily_topic, category_slug, scripture_reference,
  scripture_book, scripture_chapter, translation_code, scripture_text, reflection, prayer, discussion_question, practical_application,
  audience, grade_levels, educational_category, author_name) on devotionals to authenticated;

create policy devotionals_read_live on devotionals for select to authenticated
  using (status = 'published' or (status = 'scheduled' and publish_at <= now()));
create policy devotionals_read_editor on devotionals for select to authenticated
  using (is_content_editor());
create policy devotionals_editor_insert on devotionals for insert to authenticated
  with check (is_content_editor() and status = 'draft');
create policy devotionals_editor_update on devotionals for update to authenticated
  using (is_content_editor()) with check (is_content_editor());
create policy devotionals_editor_delete on devotionals for delete to authenticated
  using (is_content_editor() and status = 'draft');

grant select on devotional_events, devotional_revisions to authenticated;
create policy events_editor_read on devotional_events for select to authenticated
  using (is_content_editor());
create policy revisions_editor_read on devotional_revisions for select to authenticated
  using (is_content_editor());

-- ---------------------------------------------------------------------------
-- Editorial workflow
-- ---------------------------------------------------------------------------
create function devotional_transition_allowed(f devotional_status, t devotional_status) returns boolean
language sql immutable as $$
  select (f::text, t::text) in (
    ('draft', 'in_review'),
    ('in_review', 'draft'), ('in_review', 'approved'),
    ('approved', 'draft'), ('approved', 'scheduled'), ('approved', 'published'),
    ('scheduled', 'approved'), ('scheduled', 'published'),
    ('published', 'archived'),
    ('archived', 'draft')
  )
$$;

-- Names of required fields that are still empty. Required before review.
create function devotional_missing_fields(d devotionals) returns text[]
language sql stable set search_path = public as $$
  select array_remove(array[
    case when d.title = '' then 'title' end,
    case when d.daily_topic = '' then 'daily topic' end,
    case when d.category_slug is null then 'category' end,
    case when d.scripture_reference = '' then 'scripture reference' end,
    case when d.translation_code is null then 'translation' end,
    case when btrim(rich_text_plain(d.reflection)) = '' then 'reflection' end,
    case when btrim(rich_text_plain(d.prayer)) = '' then 'prayer' end,
    case when btrim(rich_text_plain(d.discussion_question)) = '' then 'discussion question' end,
    case when btrim(rich_text_plain(d.practical_application)) = '' then 'practical application' end,
    case when d.audience is null then 'intended audience' end,
    case when cardinality(d.grade_levels) = 0 then 'grade level' end,
    case when d.educational_category is null then 'educational category' end,
    case when d.author_name = '' then 'author' end
  ], null)
$$;

create function _transition_devotional(
  p_id uuid, p_to devotional_status, p_publish_at timestamptz, p_note text, p_actor uuid
) returns devotional_status
language plpgsql security definer set search_path = public as $$
declare
  d devotionals;
  missing text[];
  actor_is_admin boolean;
begin
  select * into d from devotionals where id = p_id for update;
  if not found then
    raise exception 'devotional not found' using errcode = 'P0002';
  end if;
  if not devotional_transition_allowed(d.status, p_to) then
    raise exception 'a % devotional cannot move to %', d.status, p_to using errcode = 'P0001';
  end if;

  if p_to in ('in_review', 'approved', 'scheduled', 'published') then
    missing := devotional_missing_fields(d);
    if cardinality(missing) > 0 then
      raise exception 'missing required fields: %', array_to_string(missing, ', ') using errcode = 'P0001';
    end if;
    if d.scripture_text is not null
       and not exists (select 1 from bible_translations t where t.code = d.translation_code and t.text_allowed) then
      raise exception 'the licence for this translation does not allow its text to be shown' using errcode = 'P0001';
    end if;
  end if;

  if p_to = 'approved' and d.status = 'in_review' then
    actor_is_admin := exists (select 1 from platform_roles where user_id = p_actor and role = 'platform_admin');
    if d.author_id is not null and d.author_id = p_actor and not actor_is_admin then
      raise exception 'an author cannot approve their own devotional' using errcode = 'P0001';
    end if;
    update devotionals set status = 'approved', approved_by = p_actor, approved_at = now() where id = p_id;
  elsif p_to = 'approved' then -- unscheduling
    update devotionals set status = 'approved', publish_at = null where id = p_id;
  elsif p_to = 'scheduled' then
    if p_publish_at is null or p_publish_at <= now() then
      raise exception 'choose a publication time in the future, or publish now' using errcode = 'P0001';
    end if;
    update devotionals set status = 'scheduled', publish_at = p_publish_at where id = p_id;
  elsif p_to = 'published' then
    update devotionals set status = 'published', published_at = now(),
      publish_at = least(coalesce(publish_at, now()), now()) where id = p_id;
  elsif p_to = 'archived' then
    update devotionals set status = 'archived', archived_at = now() where id = p_id;
  elsif p_to = 'draft' then
    update devotionals set status = 'draft', approved_by = null, approved_at = null,
      publish_at = null, archived_at = null where id = p_id;
  else -- in_review
    update devotionals set status = 'in_review' where id = p_id;
  end if;

  insert into devotional_events (devotional_id, actor_id, from_status, to_status, note)
  values (p_id, p_actor, d.status, p_to, nullif(btrim(coalesce(p_note, '')), ''));
  return p_to;
end $$;

create function transition_devotional(
  p_id uuid, p_to devotional_status, p_publish_at timestamptz default null, p_note text default null
) returns devotional_status
language plpgsql security definer set search_path = public as $$
begin
  if not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return _transition_devotional(p_id, p_to, p_publish_at, p_note, auth.uid());
end $$;

-- Publishes a whole week: needs exactly five approved devotionals, Monday to Friday.
-- Days whose start has passed go live now; later days are scheduled for their own
-- midnight in the given time zone.
create function publish_weekly_theme(p_theme uuid, p_timezone text default 'America/New_York') returns int
language plpgsql security definer set search_path = public as $$
declare
  ws date;
  dev record;
  at_time timestamptz;
  n int := 0;
  total int;
  approved int;
begin
  if not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select week_start into ws from weekly_themes where id = p_theme for update;
  if not found then
    raise exception 'theme not found' using errcode = 'P0002';
  end if;
  perform now() at time zone p_timezone; -- fails on an unknown zone

  select count(*), count(*) filter (where status = 'approved') into total, approved
  from devotionals where theme_id = p_theme and devotional_date between ws and ws + 4;
  if total <> 5 then
    raise exception 'a weekly theme needs exactly five devotionals (Monday to Friday); this one has %', total using errcode = 'P0001';
  end if;
  if approved <> 5 then
    raise exception 'all five devotionals must be approved first; % of 5 are approved', approved using errcode = 'P0001';
  end if;

  for dev in select id, devotional_date from devotionals where theme_id = p_theme order by devotional_date loop
    at_time := dev.devotional_date::timestamp at time zone p_timezone;
    if at_time <= now() then
      perform _transition_devotional(dev.id, 'published', null, 'Published with its weekly theme', auth.uid());
    else
      perform _transition_devotional(dev.id, 'scheduled', at_time, 'Scheduled with its weekly theme', auth.uid());
    end if;
    n := n + 1;
  end loop;
  update weekly_themes set published_at = now() where id = p_theme;
  return n;
end $$;

-- Returns a scheduled week to approved. Days already live stay live.
create function unschedule_weekly_theme(p_theme uuid) returns int
language plpgsql security definer set search_path = public as $$
declare dev record; n int := 0;
begin
  if not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  for dev in select id from devotionals where theme_id = p_theme and status = 'scheduled' loop
    perform _transition_devotional(dev.id, 'approved', null, 'Weekly theme unscheduled', auth.uid());
    n := n + 1;
  end loop;
  if not exists (select 1 from devotionals where theme_id = p_theme and status = 'published') then
    update weekly_themes set published_at = null where id = p_theme;
  end if;
  return n;
end $$;

-- Marks scheduled devotionals whose time has come as published. Reading never
-- depends on this (the read policy already treats due items as live); it keeps
-- the recorded status and dates accurate. Call it from a scheduled job.
create function publish_due_devotionals() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  with due as (
    update devotionals set status = 'published', published_at = publish_at
    where status = 'scheduled' and publish_at <= now()
    returning id
  )
  insert into devotional_events (devotional_id, actor_id, from_status, to_status, note)
  select id, auth.uid(), 'scheduled', 'published', 'Published on schedule' from due;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Search (runs with the caller's row-level security)
-- ---------------------------------------------------------------------------
create function search_devotionals(
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
                else websearch_to_tsquery('english', btrim(p_query)) end as tsq
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
    and (p_category is null or d.category_slug = p_category)
    and (p_grade is null or p_grade = any (d.grade_levels))
    and (p_theme is null or d.theme_id = p_theme)
    and (p_book is null or d.scripture_book = p_book)
    and (p_chapter is null or d.scripture_chapter = p_chapter)
    and (p_from is null or d.devotional_date >= p_from)
    and (p_through is null or d.devotional_date <= p_through)
    and (p_status is null or d.status = p_status)
    and (not p_only_live or d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now()))
  order by
    case when q.tsq is null then 0 else ts_rank(d.search, q.tsq) end desc,
    d.devotional_date desc, d.id
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0)
$$;

-- Names for the editors' history view. Profiles are private to their owner, so
-- this exposes a display name only to editors, and only for people who hold a
-- staff role or have authored or acted on devotional content.
create function staff_display_names(ids uuid[]) returns table (id uuid, display_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select p.id, coalesce(nullif(btrim(p.first_name || ' ' || p.last_name), ''), 'Unnamed editor')
    from profiles p
    where p.id = any (ids)
      and (exists (select 1 from platform_roles r where r.user_id = p.id)
           or exists (select 1 from devotionals d where d.author_id = p.id)
           or exists (select 1 from devotional_events e where e.actor_id = p.id));
end $$;

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function _transition_devotional(uuid, devotional_status, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function transition_devotional(uuid, devotional_status, timestamptz, text) from public, anon;
revoke all on function publish_weekly_theme(uuid, text) from public, anon;
revoke all on function unschedule_weekly_theme(uuid) from public, anon;
revoke all on function publish_due_devotionals() from public, anon;
revoke all on function search_devotionals(text, text, text, uuid, date, date, devotional_status, boolean, int, int, text, int) from public, anon;
revoke all on function is_content_editor() from public, anon;
grant execute on function transition_devotional(uuid, devotional_status, timestamptz, text) to authenticated;
grant execute on function publish_weekly_theme(uuid, text) to authenticated;
grant execute on function unschedule_weekly_theme(uuid) to authenticated;
grant execute on function publish_due_devotionals() to authenticated;
grant execute on function search_devotionals(text, text, text, uuid, date, date, devotional_status, boolean, int, int, text, int) to authenticated;
grant execute on function is_content_editor() to authenticated;
revoke all on function staff_display_names(uuid[]) from public, anon;
grant execute on function staff_display_names(uuid[]) to authenticated;
