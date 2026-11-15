-- Foundation schema: identity, school tenancy and published devotional content.
-- Follows the approved architecture (ADR-002, ADR-003, ADR-004).
-- NOTE: written for Supabase (auth schema + auth.uid()). Apply with the
-- Supabase CLI: `supabase db push`. Not yet executed against a live project.


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type school_role as enum ('owner', 'admin', 'faculty', 'staff');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- ---------------------------------------------------------------------------
create function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default '',
  role_title text,
  grade_band text check (grade_band in ('k2', 'g35', 'g68', 'g912')),
  bio text,
  avatar_path text,
  default_translation text not null default 'web',
  email_frequency text not null default 'weekdays'
    check (email_frequency in ('daily', 'weekdays', 'off')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated before update on profiles
  for each row execute function set_updated_at();

-- Create a profile row for every new auth user.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  email_domain text,
  settings jsonb not null default '{}',
  verified_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger schools_updated before update on schools
  for each row execute function set_updated_at();

create table school_memberships (
  school_id uuid not null references schools on delete cascade,
  user_id uuid not null references profiles on delete cascade,
  role school_role not null default 'faculty',
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (school_id, user_id)
);
create index school_memberships_user_idx on school_memberships (user_id);

-- Helpers used by row-level security policies. Security definer so they can
-- read memberships without recursing into the memberships policy.
create function is_school_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from school_memberships
    where school_id = sid and user_id = auth.uid() and status = 'active'
  )
$$;

create function has_school_role(sid uuid, allowed school_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from school_memberships
    where school_id = sid and user_id = auth.uid()
      and status = 'active' and role = any (allowed)
  )
$$;

-- ---------------------------------------------------------------------------
-- Content (global, platform-owned)
-- ---------------------------------------------------------------------------
create table topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null
);

create table devotionals (
  id uuid primary key default gen_random_uuid(),
  publish_date date unique,
  status text not null default 'draft'
    check (status in ('draft', 'review', 'scheduled', 'published', 'archived')),
  theme text not null,
  scripture_ref text not null,
  reflection text not null,
  prayer text not null,
  question text not null,
  application text not null,
  grade_variants jsonb not null default '{}',
  is_premium boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector('english', theme || ' ' || reflection || ' ' || scripture_ref)
  ) stored
);
create index devotionals_search_idx on devotionals using gin (search);
create trigger devotionals_updated before update on devotionals
  for each row execute function set_updated_at();

create table devotional_topics (
  devotional_id uuid not null references devotionals on delete cascade,
  topic_id uuid not null references topics on delete cascade,
  primary key (devotional_id, topic_id)
);

-- ---------------------------------------------------------------------------
-- Row-level security: default deny, then explicit policies
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table schools enable row level security;
alter table school_memberships enable row level security;
alter table topics enable row level security;
alter table devotionals enable row level security;
alter table devotional_topics enable row level security;

-- Profiles: a user reads and edits only their own row.
create policy profiles_select_own on profiles for select using (id = auth.uid());
create policy profiles_update_own on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Schools: members can read their school; owners and admins can update it.
create policy schools_select_member on schools for select using (is_school_member(id));
create policy schools_update_admin on schools for update
  using (has_school_role(id, '{owner,admin}'))
  with check (has_school_role(id, '{owner,admin}'));

-- Memberships: members see the roster of their own school; admins manage it.
create policy memberships_select_member on school_memberships for select
  using (is_school_member(school_id));
create policy memberships_manage_admin on school_memberships for all
  using (has_school_role(school_id, '{owner,admin}'))
  with check (has_school_role(school_id, '{owner,admin}'));

-- Content: published items are readable by everyone, including visitors.
create policy topics_public_read on topics for select using (true);
create policy devotionals_public_read on devotionals for select
  using (status = 'published' and (publish_date is null or publish_date <= current_date));
create policy devotional_topics_public_read on devotional_topics for select
  using (exists (
    select 1 from devotionals d
    where d.id = devotional_id and d.status = 'published'
  ));
