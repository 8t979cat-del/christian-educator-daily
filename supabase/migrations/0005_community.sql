-- Remember which functions existed before this migration, so grants can be applied to the new ones only.
create temp table _pre_0005_fns as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- Community: Scripture-centred discussion, prayer, private groups, moderation.
-- Builds on 0001 (identity, schools), 0002 (roles) and 0003 (devotionals).
--
-- Two separate environments, with separate rules:
--
--   PUBLIC DEVOTIONAL COMMUNITY  community_contributions, contribution_replies
--     Responses to published devotionals only. Every row belongs to a live
--     devotional (NOT NULL foreign key plus a policy check). There is no table, policy
--     or function that can create a standalone public post or a global timeline.
--
--   PRIVATE GROUPS               community_groups, group_memberships, group_posts, ...
--     Original posts live here only. Everything is invisible to non-members.
--
-- Design rules enforced IN THE DATABASE:
--   * Row-level security is the final authority; the application checks as well.
--   * Moderation state, memberships, reports and moderation logs can only be written
--     by SECURITY DEFINER functions that check who is asking and record what happened.
--   * Authors of anonymous prayers cannot be identified by other users, not even
--     through the API: the author column is not readable by clients.
--   * Nothing here ranks content by engagement. Lists are chronological.
--   * Entitlement is ONE function, community_entitled(). When billing arrives, change it there.

-- ---------------------------------------------------------------------------
-- Platform settings and feature flags (read by everyone signed in, written by platform admins)
-- ---------------------------------------------------------------------------
create table community_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
insert into community_settings (key, value) values
  ('public_discussions_enabled', 'true'),
  ('groups_enabled', 'true'),
  -- Who may create a group: "verified" (any verified user), "school_admins" (school owners and admins, plus staff), "staff".
  ('group_creation', '"verified"'),
  ('max_groups_owned_per_user', '3'),
  -- One-to-one messaging. Off until safety testing is complete. Enforced in the database.
  ('direct_messages_enabled', 'false');

alter table community_settings enable row level security;
revoke all on community_settings from anon, authenticated;
grant select on community_settings to authenticated;
create policy community_settings_read on community_settings for select to authenticated using (true);

create function community_flag(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from community_settings where key = k), false)
$$;

create function community_setting_text(k text) returns text
language sql stable security definer set search_path = public as $$
  select value #>> '{}' from community_settings where key = k
$$;

create function set_community_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from community_settings where key = k) then
    raise exception 'unknown setting' using errcode = 'P0002';
  end if;
  update community_settings set value = v, updated_by = auth.uid(), updated_at = now() where key = k;
end $$;

-- ---------------------------------------------------------------------------
-- Profile preference: teachers can hide discussions and use devotionals privately
-- ---------------------------------------------------------------------------
alter table profiles add column show_discussions boolean not null default true;

-- ---------------------------------------------------------------------------
-- Entitlement, standing and shared predicates
-- ---------------------------------------------------------------------------
-- The single entitlement check for the community. Today: a signed-in user with a
-- verified email, the same bar as the rest of the app. Subscription tiers will plug in here.
create function community_entitled() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null)
$$;

create function is_community_moderator() returns boolean
language sql stable security definer set search_path = public as $$
  select has_platform_role('{platform_admin,moderator}')
$$;

-- Platform-wide community restrictions (suspension for a period, or a ban).
create type restriction_kind as enum ('suspension', 'ban');

create table community_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind restriction_kind not null,
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  imposed_by uuid references auth.users on delete set null,
  ends_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  constraint suspension_has_end check (kind = 'ban' or ends_at is not null)
);
create index community_restrictions_user_idx on community_restrictions (user_id) where lifted_at is null;
alter table community_restrictions enable row level security;
revoke all on community_restrictions from anon, authenticated;
grant select on community_restrictions to authenticated;
create policy restrictions_select_own on community_restrictions for select to authenticated
  using (user_id = auth.uid());
create policy restrictions_select_moderator on community_restrictions for select to authenticated
  using (is_community_moderator());

create function community_restricted(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from community_restrictions r
    where r.user_id = u and r.lifted_at is null and (r.ends_at is null or r.ends_at > now()))
$$;

-- Blocks: a blocker no longer sees the blocked person's content, and the blocked
-- person cannot reply to the blocker's content or message them.
create table user_blocks (
  blocker_id uuid not null references auth.users on delete cascade,
  blocked_id uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on user_blocks (blocked_id);
alter table user_blocks enable row level security;
revoke all on user_blocks from anon, authenticated;
grant select, delete on user_blocks to authenticated;
grant insert (blocker_id, blocked_id) on user_blocks to authenticated;
create policy blocks_select_own on user_blocks for select to authenticated using (blocker_id = auth.uid());
create policy blocks_insert_own on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid() and community_entitled());
create policy blocks_delete_own on user_blocks for delete to authenticated using (blocker_id = auth.uid());

create function viewer_blocks(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where blocker_id = auth.uid() and blocked_id = u)
$$;
create function user_blocks_viewer(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_blocks where blocker_id = u and blocked_id = auth.uid())
$$;

create function can_post_publicly() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(community_entitled()
     and community_flag('public_discussions_enabled')
     and not community_restricted(auth.uid()), false)
$$;

-- A devotional is "live" exactly as for readers: published, or scheduled and due.
create function devotional_is_live(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from devotionals d
    where d.id = did and (d.status = 'published' or (d.status = 'scheduled' and d.publish_at <= now())))
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting and duplicate protection (in the database, so no client can skip it)
-- ---------------------------------------------------------------------------
create table community_rate_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index community_rate_events_idx on community_rate_events (user_id, kind, created_at desc);
alter table community_rate_events enable row level security;
revoke all on community_rate_events from anon, authenticated;

-- Trigger arguments: kind, user column, max per hour, max per day [, body column to check for duplicates]
create function enforce_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind text := tg_argv[0];
  uid uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  per_hour int := tg_argv[2]::int;
  per_day int := tg_argv[3]::int;
  dup_col text := tg_argv[4];
  n_hour int;
  n_day int;
  dup int := 0;
begin
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into n_hour, n_day
  from community_rate_events
  where user_id = uid and community_rate_events.kind = v_kind and created_at > now() - interval '1 day';
  if n_hour >= per_hour or n_day >= per_day then
    raise exception 'You are doing that too quickly. Please wait a little and try again.' using errcode = 'P0429';
  end if;
  if dup_col is not null then
    execute format(
      'select count(*) from %I.%I where %I = $1 and %I = $2 and created_at > now() - interval ''10 minutes''',
      tg_table_schema, tg_table_name, tg_argv[1], dup_col)
      into dup using uid, to_jsonb(new) ->> dup_col;
    if dup > 0 then
      raise exception 'That looks like a duplicate of something you just posted.' using errcode = 'P0429';
    end if;
  end if;
  insert into community_rate_events (user_id, kind) values (uid, v_kind);
  return new;
end $$;

-- Housekeeping, run from a scheduled job: events older than two days are not needed.
create function purge_community_rate_events() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from community_rate_events where created_at < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end $$;

-- Marks content as edited when its words change.
create function mark_edited() returns trigger
language plpgsql as $$
begin
  if new.body is distinct from old.body or (to_jsonb(new) ->> 'title') is distinct from (to_jsonb(old) ->> 'title') then
    new.edited_at := now();
  end if;
  return new;
end $$;

-- ===========================================================================
-- PUBLIC DEVOTIONAL COMMUNITY
-- ===========================================================================
create type contribution_kind as enum ('reflection', 'prayer', 'question', 'encouragement');
create type contribution_visibility as enum ('named', 'anonymous', 'private');
create type moderation_state as enum ('visible', 'hidden');

create table community_contributions (
  id uuid primary key default gen_random_uuid(),
  -- Every public contribution belongs to a devotional. Deleting the devotional deletes the discussion.
  devotional_id uuid not null references devotionals on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  kind contribution_kind not null,
  title text check (title is null or length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 4000),
  -- Prayers may be shared with the community, shared without a name, or kept private.
  visibility contribution_visibility not null default 'named',
  moderation moderation_state not null default 'visible',
  moderation_reason text,
  moderated_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || body)) stored,
  -- A title and special visibility belong to prayers only.
  constraint prayer_only_options check (kind = 'prayer' or (title is null and visibility = 'named'))
);
create index community_contributions_feed on community_contributions (devotional_id, created_at desc, id desc);
create index community_contributions_kind on community_contributions (devotional_id, kind, created_at desc);
create index community_contributions_user on community_contributions (user_id);
create index community_contributions_search on community_contributions using gin (search);
create trigger community_contributions_updated before update on community_contributions
  for each row execute function set_updated_at();
create trigger community_contributions_edited before update on community_contributions
  for each row execute function mark_edited();
create trigger community_contributions_rate before insert on community_contributions
  for each row execute function enforce_rate_limit('contribution', 'user_id', 10, 40, 'body');

create function can_view_contribution(c community_contributions) returns boolean
language sql stable security definer set search_path = public as $$
  select community_entitled()
    and community_flag('public_discussions_enabled')
    and devotional_is_live(c.devotional_id)
    and (
      c.user_id = auth.uid()
      or (
        c.visibility <> 'private'
        and (c.moderation = 'visible' or is_community_moderator())
        and not viewer_blocks(c.user_id)
      )
    )
$$;

create function can_view_contribution_id(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_view_contribution(c) from community_contributions c where c.id = cid), false)
$$;

create table contribution_replies (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references community_contributions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  moderation moderation_state not null default 'visible',
  moderation_reason text,
  moderated_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index contribution_replies_thread on contribution_replies (contribution_id, created_at, id);
create index contribution_replies_user on contribution_replies (user_id);
create trigger contribution_replies_updated before update on contribution_replies
  for each row execute function set_updated_at();
create trigger contribution_replies_edited before update on contribution_replies
  for each row execute function mark_edited();
create trigger contribution_replies_rate before insert on contribution_replies
  for each row execute function enforce_rate_limit('reply', 'user_id', 30, 150, 'body');

create function can_view_reply(r contribution_replies) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_contribution_id(r.contribution_id)
    and (
      r.user_id = auth.uid()
      or ((r.moderation = 'visible' or is_community_moderator()) and not viewer_blocks(r.user_id))
    )
$$;

-- Replies are flat (one level) and only on public contributions the person can see
-- and who has not blocked them.
create function can_reply_to_contribution(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_post_publicly()
    and exists (
      select 1 from community_contributions c
      where c.id = cid
        and c.visibility <> 'private'
        and c.moderation = 'visible'
        and devotional_is_live(c.devotional_id)
        and not viewer_blocks(c.user_id)
        and not user_blocks_viewer(c.user_id))
$$;

-- RLS: the author column is not readable by clients, so an anonymous prayer cannot be traced
-- through the API. Readers use list_contributions(), which returns names only where allowed.
alter table community_contributions enable row level security;
alter table contribution_replies enable row level security;
revoke all on community_contributions, contribution_replies from anon, authenticated;
grant select (id, devotional_id, kind, title, body, visibility, moderation, edited_at, created_at, updated_at)
  on community_contributions to authenticated;
grant insert (devotional_id, user_id, kind, title, body, visibility) on community_contributions to authenticated;
grant update (title, body, visibility) on community_contributions to authenticated;
grant delete on community_contributions to authenticated;
grant select (id, contribution_id, body, moderation, edited_at, created_at, updated_at) on contribution_replies to authenticated;
grant insert (contribution_id, user_id, body) on contribution_replies to authenticated;
grant update (body) on contribution_replies to authenticated;
grant delete on contribution_replies to authenticated;

create policy contributions_select on community_contributions for select to authenticated
  using (can_view_contribution(community_contributions));
create policy contributions_insert on community_contributions for insert to authenticated
  with check (user_id = auth.uid() and can_post_publicly() and devotional_is_live(devotional_id));
create policy contributions_update on community_contributions for update to authenticated
  using (user_id = auth.uid() and moderation = 'visible')
  with check (user_id = auth.uid() and moderation = 'visible' and can_post_publicly());
create policy contributions_delete on community_contributions for delete to authenticated
  using (user_id = auth.uid());

create policy replies_select on contribution_replies for select to authenticated
  using (can_view_reply(contribution_replies));
create policy replies_insert on contribution_replies for insert to authenticated
  with check (user_id = auth.uid() and can_reply_to_contribution(contribution_id));
create policy replies_update on contribution_replies for update to authenticated
  using (user_id = auth.uid() and moderation = 'visible')
  with check (user_id = auth.uid() and moderation = 'visible' and can_post_publicly());
create policy replies_delete on contribution_replies for delete to authenticated
  using (user_id = auth.uid());

-- ===========================================================================
-- PRIVATE COMMUNITY GROUPS
-- ===========================================================================
create type group_privacy as enum ('private', 'discoverable');
create type group_role as enum ('owner', 'moderator', 'member');
create type group_post_kind as enum ('post', 'prayer', 'question');

create table community_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 80),
  description text not null default '' check (length(description) <= 500),
  purpose text not null default '' check (length(purpose) <= 500),
  guidelines text not null default '' check (length(guidelines) <= 3000),
  category text check (category in ('school', 'grade_level', 'subject', 'new_teacher', 'study', 'regional', 'other')),
  -- private: invitation only, invisible to everyone else.
  -- discoverable: appears in the directory with its name and purpose; content stays members-only.
  privacy group_privacy not null default 'private',
  -- A school-linked group admits only active members of that school.
  school_id uuid references schools on delete cascade,
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_reason text,
  suspended_at timestamptz,
  suspended_by uuid references auth.users on delete set null,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index community_groups_discoverable on community_groups (name) where privacy = 'discoverable' and status = 'active';
create trigger community_groups_updated before update on community_groups
  for each row execute function set_updated_at();

create table group_memberships (
  group_id uuid not null references community_groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role group_role not null default 'member',
  status text not null default 'active' check (status in ('active', 'suspended')),
  suspended_until timestamptz,
  suspended_reason text,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_memberships_user_idx on group_memberships (user_id);

-- Membership helpers. Suspended members can read but not write; a timed suspension ends by itself.
create function group_role_of(gid uuid) returns group_role
language sql stable security definer set search_path = public as $$
  select role from group_memberships where group_id = gid and user_id = auth.uid()
$$;

create function group_member_state(gid uuid) returns text
language sql stable security definer set search_path = public as $$
  select case
           when m.status = 'active' then 'active'
           when m.suspended_until is not null and m.suspended_until <= now() then 'active'
           else 'suspended'
         end
  from group_memberships m where m.group_id = gid and m.user_id = auth.uid()
$$;

create function group_is_active(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select status = 'active' from community_groups where id = gid), false)
$$;

-- Reading group content: a member (even if suspended) of an active group.
create function group_can_read(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(community_entitled() and group_is_active(gid) and group_member_state(gid) is not null, false)
$$;

-- Writing: an active member in good standing, in an active group.
create function group_can_write(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    community_entitled()
    and community_flag('groups_enabled')
    and not community_restricted(auth.uid())
    and group_is_active(gid)
    and group_member_state(gid) = 'active', false)
$$;

create function is_group_manager(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(group_can_write(gid) and group_role_of(gid) in ('owner', 'moderator'), false)
$$;

create function is_group_owner(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(group_can_write(gid) and group_role_of(gid) = 'owner', false)
$$;

-- Two people share a group when both are active members of the same active group.
create function share_active_group(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from group_memberships ma
    join group_memberships mb on mb.group_id = ma.group_id and mb.user_id = b
    join community_groups g on g.id = ma.group_id and g.status = 'active'
    where ma.user_id = a and ma.status = 'active' and mb.status = 'active')
$$;

-- "Moderators" in the spec: a view over memberships, so there is one source of truth.
create view group_moderators with (security_invoker = true) as
  select group_id, user_id, role, created_at from group_memberships where role in ('owner', 'moderator');

-- A group always keeps an owner while it has other members. A sole owner who leaves an
-- otherwise empty group takes the group with them.
create function protect_last_group_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and exists (select 1 from community_groups where id = old.group_id)
     and not exists (select 1 from group_memberships where group_id = old.group_id and role = 'owner' and user_id <> old.user_id)
     and exists (select 1 from group_memberships where group_id = old.group_id and user_id <> old.user_id)
  then
    raise exception 'Hand ownership to another member before leaving this group.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger group_memberships_protect_owner before update or delete on group_memberships
  for each row execute function protect_last_group_owner();

create function delete_empty_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from group_memberships where group_id = old.group_id) then
    delete from community_groups where id = old.group_id;
  end if;
  return old;
end $$;
create trigger group_memberships_cleanup after delete on group_memberships
  for each row execute function delete_empty_group();

-- ----- posts and comments -----
create table group_posts (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  kind group_post_kind not null default 'post',
  title text check (title is null or length(btrim(title)) between 1 and 120),
  body text not null check (length(btrim(body)) between 1 and 5000),
  -- Group-linked Scripture and devotional discussion.
  devotional_id uuid references devotionals on delete set null,
  scripture_reference text check (scripture_reference is null or length(scripture_reference) <= 120),
  moderation moderation_state not null default 'visible',
  moderation_reason text,
  moderated_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('english', coalesce(title, '') || ' ' || body)) stored
);
create index group_posts_feed on group_posts (group_id, created_at desc, id desc);
create index group_posts_author on group_posts (author_id);
create index group_posts_search on group_posts using gin (search);
create trigger group_posts_updated before update on group_posts for each row execute function set_updated_at();
create trigger group_posts_edited before update on group_posts for each row execute function mark_edited();
create trigger group_posts_rate before insert on group_posts
  for each row execute function enforce_rate_limit('group_post', 'author_id', 15, 60, 'body');

create table group_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references group_posts on delete cascade,
  group_id uuid not null references community_groups on delete cascade,
  author_id uuid not null references auth.users on delete cascade,
  -- One level of nesting: a reply to a comment, never a reply to a reply.
  parent_id uuid references group_comments on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 3000),
  moderation moderation_state not null default 'visible',
  moderation_reason text,
  moderated_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index group_comments_thread on group_comments (post_id, created_at, id);
create index group_comments_author on group_comments (author_id);
create trigger group_comments_updated before update on group_comments for each row execute function set_updated_at();
create trigger group_comments_edited before update on group_comments for each row execute function mark_edited();
create trigger group_comments_rate before insert on group_comments
  for each row execute function enforce_rate_limit('group_comment', 'author_id', 40, 200, 'body');

create function group_comments_check() returns trigger
language plpgsql security definer set search_path = public as $$
declare parent group_comments;
begin
  if new.group_id is distinct from (select group_id from group_posts where id = new.post_id) then
    raise exception 'comment must belong to the same group as its post' using errcode = '23514';
  end if;
  if new.parent_id is not null then
    select * into parent from group_comments where id = new.parent_id;
    if not found or parent.post_id <> new.post_id or parent.parent_id is not null then
      raise exception 'replies can only answer a top-level comment on the same post' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger group_comments_before_insert before insert on group_comments
  for each row execute function group_comments_check();

create function can_view_group_post(p group_posts) returns boolean
language sql stable security definer set search_path = public as $$
  select group_can_read(p.group_id)
    and (
      p.author_id = auth.uid()
      or is_group_manager(p.group_id)
      or (p.moderation = 'visible' and not viewer_blocks(p.author_id))
    )
$$;

create function can_view_group_post_id(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_view_group_post(p) from group_posts p where p.id = pid), false)
$$;

create function can_view_group_comment(c group_comments) returns boolean
language sql stable security definer set search_path = public as $$
  select can_view_group_post_id(c.post_id)
    and (
      c.author_id = auth.uid()
      or is_group_manager(c.group_id)
      or (c.moderation = 'visible' and not viewer_blocks(c.author_id))
    )
$$;

create function can_comment_on_group_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_posts p
    where p.id = pid
      and group_can_write(p.group_id)
      and p.moderation = 'visible'
      and not user_blocks_viewer(p.author_id))
$$;

alter table community_groups enable row level security;
alter table group_memberships enable row level security;
alter table group_posts enable row level security;
alter table group_comments enable row level security;
revoke all on community_groups, group_memberships, group_posts, group_comments from anon, authenticated;
revoke all on group_moderators from anon;
grant select on group_moderators to authenticated;

-- Groups and memberships are written only by the functions below.
grant select on community_groups, group_memberships to authenticated;
grant select on group_posts, group_comments to authenticated;
grant insert (group_id, author_id, kind, title, body, devotional_id, scripture_reference) on group_posts to authenticated;
grant update (title, body, scripture_reference) on group_posts to authenticated;
grant delete on group_posts to authenticated;
grant insert (post_id, group_id, author_id, parent_id, body) on group_comments to authenticated;
grant update (body) on group_comments to authenticated;
grant delete on group_comments to authenticated;

-- A group is visible to its members, to anyone for a discoverable active group (name, purpose,
-- guidelines only: the content has its own policies), and to platform moderators (to handle suspensions).
create policy groups_select on community_groups for select to authenticated
  using (
    community_entitled() and (
      group_member_state(id) is not null
      or (privacy = 'discoverable' and status = 'active'
          and (school_id is null or is_school_member(school_id)))
      or is_community_moderator()
    )
  );

-- Members see their own row and the roster of their group. Nobody else sees a roster.
create policy memberships_select on group_memberships for select to authenticated
  using (user_id = auth.uid() or group_can_read(group_id));

create policy group_posts_select on group_posts for select to authenticated
  using (can_view_group_post(group_posts));
create policy group_posts_insert on group_posts for insert to authenticated
  with check (
    author_id = auth.uid()
    and group_can_write(group_id)
    and (devotional_id is null or devotional_is_live(devotional_id)));
create policy group_posts_update on group_posts for update to authenticated
  using (author_id = auth.uid() and moderation = 'visible' and group_can_write(group_id))
  with check (author_id = auth.uid() and moderation = 'visible' and group_can_write(group_id));
create policy group_posts_delete on group_posts for delete to authenticated
  using (author_id = auth.uid() and group_can_read(group_id));

create policy group_comments_select on group_comments for select to authenticated
  using (can_view_group_comment(group_comments));
create policy group_comments_insert on group_comments for insert to authenticated
  with check (author_id = auth.uid() and can_comment_on_group_post(post_id));
create policy group_comments_update on group_comments for update to authenticated
  using (author_id = auth.uid() and moderation = 'visible' and group_can_write(group_id))
  with check (author_id = auth.uid() and moderation = 'visible' and group_can_write(group_id));
create policy group_comments_delete on group_comments for delete to authenticated
  using (author_id = auth.uid() and group_can_read(group_id));

-- ----- invitations and join requests -----
create table group_invitations (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role group_role not null default 'member' check (role in ('moderator', 'member')),
  -- sha256 of the secret token. The token itself is never stored.
  token_hash text not null unique,
  invited_by uuid references auth.users on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index group_invitations_group_idx on group_invitations (group_id);
create trigger group_invitations_rate before insert on group_invitations
  for each row execute function enforce_rate_limit('group_invitation', 'invited_by', 20, 60);
alter table group_invitations enable row level security;
revoke all on group_invitations from anon, authenticated;
grant select, delete on group_invitations to authenticated;
grant insert (group_id, email, role, token_hash, invited_by) on group_invitations to authenticated;
create policy group_invitations_select on group_invitations for select to authenticated
  using (is_group_manager(group_id));
create policy group_invitations_delete on group_invitations for delete to authenticated
  using (is_group_manager(group_id));
-- Managers invite members; only the owner invites moderators.
create policy group_invitations_insert on group_invitations for insert to authenticated
  with check (
    invited_by = auth.uid()
    and (
      (role = 'member' and is_group_manager(group_id))
      or (role = 'moderator' and is_group_owner(group_id))));

create table group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references community_groups on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  message text not null default '' check (length(message) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'withdrawn')),
  decided_by uuid references auth.users on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index group_join_requests_pending on group_join_requests (group_id, user_id) where status = 'pending';
create trigger group_join_requests_rate before insert on group_join_requests
  for each row execute function enforce_rate_limit('join_request', 'user_id', 5, 10);
alter table group_join_requests enable row level security;
revoke all on group_join_requests from anon, authenticated;
grant select on group_join_requests to authenticated;
create policy join_requests_select on group_join_requests for select to authenticated
  using (user_id = auth.uid() or is_group_manager(group_id));

-- ---------------------------------------------------------------------------
-- Prayer acknowledgements: "I prayed for this". A supportive gesture, never a like.
-- Only a count is ever shown. Nobody can sort by it. The author sees how many, not who.
-- ---------------------------------------------------------------------------
create table prayer_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  contribution_id uuid references community_contributions on delete cascade,
  group_post_id uuid references group_posts on delete cascade,
  created_at timestamptz not null default now(),
  constraint one_target check ((contribution_id is not null)::int + (group_post_id is not null)::int = 1)
);
create unique index prayer_ack_contribution on prayer_acknowledgements (user_id, contribution_id) where contribution_id is not null;
create unique index prayer_ack_group_post on prayer_acknowledgements (user_id, group_post_id) where group_post_id is not null;
create index prayer_ack_by_contribution on prayer_acknowledgements (contribution_id);
create index prayer_ack_by_group_post on prayer_acknowledgements (group_post_id);
create trigger prayer_ack_rate before insert on prayer_acknowledgements
  for each row execute function enforce_rate_limit('acknowledgement', 'user_id', 60, 300);

create function can_acknowledge_contribution(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(can_post_publicly()
    and exists (
      select 1 from community_contributions c
      where c.id = cid and c.kind = 'prayer' and c.visibility <> 'private'
        and c.moderation = 'visible' and c.user_id <> auth.uid()
        and devotional_is_live(c.devotional_id)
        and not viewer_blocks(c.user_id)), false)
$$;

create function can_acknowledge_group_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(exists (
    select 1 from group_posts p
    where p.id = pid and p.kind = 'prayer' and p.moderation = 'visible'
      and p.author_id <> auth.uid() and group_can_write(p.group_id)), false)
$$;

alter table prayer_acknowledgements enable row level security;
revoke all on prayer_acknowledgements from anon, authenticated;
grant select, delete on prayer_acknowledgements to authenticated;
grant insert (user_id, contribution_id, group_post_id) on prayer_acknowledgements to authenticated;
create policy ack_select_own on prayer_acknowledgements for select to authenticated using (user_id = auth.uid());
create policy ack_insert on prayer_acknowledgements for insert to authenticated
  with check (
    user_id = auth.uid()
    and ((contribution_id is not null and can_acknowledge_contribution(contribution_id))
      or (group_post_id is not null and can_acknowledge_group_post(group_post_id))));
create policy ack_delete_own on prayer_acknowledgements for delete to authenticated using (user_id = auth.uid());

-- ===========================================================================
-- DIRECT MESSAGING: data model and permissions only. OFF by default.
-- Nothing can be created or read unless community_settings.direct_messages_enabled is true,
-- and even then two people need a group in common, no block between them and good standing.
-- No user interface is built for it in this release.
-- ===========================================================================
create table direct_conversations (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users on delete cascade,
  user_b uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create table direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references direct_conversations on delete cascade,
  sender_id uuid not null references auth.users on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 2000),
  moderation moderation_state not null default 'visible',
  moderation_reason text,
  moderated_at timestamptz,
  created_at timestamptz not null default now()
);
create index direct_messages_thread on direct_messages (conversation_id, created_at);
create trigger direct_messages_rate before insert on direct_messages
  for each row execute function enforce_rate_limit('direct_message', 'sender_id', 30, 200, 'body');

create function can_message_pair(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(community_flag('direct_messages_enabled')
     and community_entitled()
     and a <> b
     and not community_restricted(a) and not community_restricted(b)
     and share_active_group(a, b)
     and not exists (select 1 from user_blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)), false)
$$;

create function can_send_direct(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from direct_conversations c
    where c.id = cid and auth.uid() in (c.user_a, c.user_b)
      and can_message_pair(c.user_a, c.user_b))
$$;

alter table direct_conversations enable row level security;
alter table direct_messages enable row level security;
revoke all on direct_conversations, direct_messages from anon, authenticated;
grant select on direct_conversations to authenticated;
grant select, delete on direct_messages to authenticated;
grant insert (conversation_id, sender_id, body) on direct_messages to authenticated;
create policy dm_conversations_select on direct_conversations for select to authenticated
  using (community_flag('direct_messages_enabled') and auth.uid() in (user_a, user_b));
create policy dm_messages_select on direct_messages for select to authenticated
  using (
    community_flag('direct_messages_enabled')
    and exists (select 1 from direct_conversations c where c.id = conversation_id and auth.uid() in (c.user_a, c.user_b))
    and (sender_id = auth.uid() or (moderation = 'visible' and not viewer_blocks(sender_id))));
create policy dm_messages_insert on direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and can_send_direct(conversation_id));
create policy dm_messages_delete on direct_messages for delete to authenticated
  using (sender_id = auth.uid());

create function start_direct_conversation(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid; a uuid := least(auth.uid(), p_user); b uuid := greatest(auth.uid(), p_user);
begin
  if not community_flag('direct_messages_enabled') then
    raise exception 'Direct messages are not enabled.' using errcode = 'P0001';
  end if;
  if not can_message_pair(auth.uid(), p_user) then
    raise exception 'You can message only people who share a group with you.' using errcode = '42501';
  end if;
  insert into direct_conversations (user_a, user_b) values (a, b)
  on conflict (user_a, user_b) do nothing;
  select id into cid from direct_conversations where user_a = a and user_b = b;
  return cid;
end $$;

-- ===========================================================================
-- REPORTS, MODERATION, APPEALS
-- ===========================================================================
create type report_target as enum ('contribution', 'reply', 'group_post', 'group_comment', 'direct_message');
-- Disagreeing with someone's theology is deliberately not a reason: see the covenant.
create type report_reason as enum
  ('harassment', 'threat_or_hate', 'spam_or_solicitation', 'student_privacy', 'personal_information', 'inappropriate', 'other');

create table contribution_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users on delete set null,
  target_type report_target not null,
  target_id uuid not null,
  -- Set for group content. Such reports go to the group's moderators first.
  group_id uuid references community_groups on delete cascade,
  target_author_id uuid references auth.users on delete set null,
  reason report_reason not null,
  details text check (details is null or length(details) <= 1000),
  -- What was reported, as it read when reported, so a deletion cannot erase the evidence.
  snapshot text not null,
  snapshot_title text,
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  -- Group reports are visible to platform moderators only after being escalated.
  escalated_at timestamptz,
  resolved_by uuid references auth.users on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index contribution_reports_queue on contribution_reports (status, created_at);
create index contribution_reports_target on contribution_reports (target_type, target_id);
create index contribution_reports_group on contribution_reports (group_id, status);
create trigger contribution_reports_rate before insert on contribution_reports
  for each row execute function enforce_rate_limit('report', 'reporter_id', 10, 30);
alter table contribution_reports enable row level security;
revoke all on contribution_reports from anon, authenticated;
grant select (id, target_type, target_id, reason, status, created_at) on contribution_reports to authenticated;
create policy reports_select_own on contribution_reports for select to authenticated using (reporter_id = auth.uid());

create type moderation_action_kind as enum (
  'hide', 'restore', 'warn', 'dismiss', 'restrict_user', 'lift_restriction',
  'group_remove_member', 'group_suspend_member', 'group_unsuspend_member',
  'group_suspend', 'group_unsuspend', 'appeal_upheld', 'appeal_overturned');

create table moderation_actions (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('platform', 'group')),
  group_id uuid references community_groups on delete set null,
  actor_id uuid references auth.users on delete set null,
  action moderation_action_kind not null,
  target_type report_target,
  target_id uuid,
  target_user_id uuid references auth.users on delete set null,
  report_id uuid references contribution_reports on delete set null,
  restriction_id uuid references community_restrictions on delete set null,
  reason text not null default '' check (length(reason) <= 1000),
  snapshot text,
  created_at timestamptz not null default now()
);
create index moderation_actions_user on moderation_actions (target_user_id, created_at desc);
create index moderation_actions_group on moderation_actions (group_id, created_at desc);
alter table moderation_actions enable row level security;
revoke all on moderation_actions from anon, authenticated;
grant select on moderation_actions to authenticated;
-- A person can read what was done about them (and why). Moderators read the platform log;
-- a group's managers read their own group's log. The log is append-only: there is no write path for clients.
create policy actions_select_target on moderation_actions for select to authenticated
  using (target_user_id = auth.uid() and action in
    ('hide', 'warn', 'restrict_user', 'group_remove_member', 'group_suspend_member', 'group_suspend'));
create policy actions_select_platform on moderation_actions for select to authenticated
  using (scope = 'platform' and is_community_moderator());
create policy actions_select_group on moderation_actions for select to authenticated
  using (scope = 'group' and group_id is not null and is_group_manager(group_id));

create table moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null unique references moderation_actions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  message text not null check (length(btrim(message)) between 1 and 1500),
  status text not null default 'open' check (status in ('open', 'upheld', 'overturned')),
  resolved_by uuid references auth.users on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index moderation_appeals_queue on moderation_appeals (status, created_at);
create trigger moderation_appeals_rate before insert on moderation_appeals
  for each row execute function enforce_rate_limit('appeal', 'user_id', 3, 6);
alter table moderation_appeals enable row level security;
revoke all on moderation_appeals from anon, authenticated;
grant select on moderation_appeals to authenticated;
create policy appeals_select_own on moderation_appeals for select to authenticated using (user_id = auth.uid());
create policy appeals_select_moderator on moderation_appeals for select to authenticated using (is_community_moderator());

-- ---------------------------------------------------------------------------
-- Names. Profiles are private, so names come only through here, as "First L.",
-- and only for people the caller already shares a context with.
-- ---------------------------------------------------------------------------
create function community_display_name(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare f text; l text;
begin
  if not community_entitled() or p_user is null then return null; end if;
  if p_user <> auth.uid()
     and not exists (select 1 from group_memberships a join group_memberships b on b.group_id = a.group_id
                     where a.user_id = p_user and b.user_id = auth.uid())
     and not exists (select 1 from community_contributions c
                     where c.user_id = p_user and c.visibility = 'named' and c.moderation = 'visible' and devotional_is_live(c.devotional_id))
     and not exists (select 1 from contribution_replies r join community_contributions c on c.id = r.contribution_id
                     where r.user_id = p_user and r.moderation = 'visible' and c.visibility <> 'private' and devotional_is_live(c.devotional_id))
     and not exists (select 1 from group_join_requests q
                     where q.user_id = p_user and q.status = 'pending' and is_group_manager(q.group_id))
     and not is_community_moderator()
  then
    return 'A member';
  end if;
  select p.first_name, p.last_name into f, l from profiles p where p.id = p_user;
  if coalesce(btrim(f), '') = '' then return 'A member'; end if;
  return btrim(f) || case when coalesce(btrim(l), '') <> '' then ' ' || left(btrim(l), 1) || '.' else '' end;
end $$;

-- Full name, for moderators handling a report or restriction only.
create function moderator_full_name(p_user uuid) returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_community_moderator() then return null; end if;
  return (select nullif(btrim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = p_user);
end $$;

-- ---------------------------------------------------------------------------
-- Reading: public discussions
-- ---------------------------------------------------------------------------
create function list_contributions(
  p_devotional uuid,
  p_kind contribution_kind default null,
  p_q text default null,
  p_oldest_first boolean default false,
  p_limit int default 20,
  p_after_ts timestamptz default null,
  p_after_id uuid default null
) returns table (
  id uuid, kind contribution_kind, title text, body text, visibility contribution_visibility,
  moderation moderation_state, moderation_reason text, created_at timestamptz, edited_at timestamptz,
  author_name text, is_mine boolean, prayer_count int, i_prayed boolean, reply_count int
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  lim int := least(greatest(coalesce(p_limit, 20), 1), 50);
  term text := nullif(btrim(coalesce(p_q, '')), '');
  q tsquery;
  pat text;
begin
  if not community_entitled() then return; end if;
  if term is not null then
    q := websearch_to_tsquery('english', term);
    pat := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select c.id, c.kind, c.title, c.body, c.visibility, c.moderation,
         case when c.user_id = auth.uid() or is_community_moderator() then c.moderation_reason end,
         c.created_at, c.edited_at,
         case when c.visibility = 'anonymous' and c.user_id <> auth.uid() then null
              else community_display_name(c.user_id) end,
         c.user_id = auth.uid(),
         case when c.kind = 'prayer' then (select count(*)::int from prayer_acknowledgements a where a.contribution_id = c.id) else 0 end,
         exists (select 1 from prayer_acknowledgements a where a.contribution_id = c.id and a.user_id = auth.uid()),
         (select count(*)::int from contribution_replies r where r.contribution_id = c.id and can_view_reply(r))
  from community_contributions c
  where c.devotional_id = p_devotional
    and can_view_contribution(c)
    and (p_kind is null or c.kind = p_kind)
    and (term is null or c.search @@ q or c.body ilike pat escape '\' or coalesce(c.title, '') ilike pat escape '\')
    and (p_after_ts is null
         or (not p_oldest_first and (c.created_at, c.id) < (p_after_ts, p_after_id))
         or (p_oldest_first and (c.created_at, c.id) > (p_after_ts, p_after_id)))
  -- Chronological. Never ordered by prayers, replies or anything that measures popularity.
  order by case when p_oldest_first then c.created_at end asc, case when p_oldest_first then c.id end asc,
           c.created_at desc, c.id desc
  limit lim;
end $$;

create function contribution_counts(p_devotional uuid) returns table (kind contribution_kind, n int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not community_entitled() then return; end if;
  return query
  select c.kind, count(*)::int from community_contributions c
  where c.devotional_id = p_devotional and can_view_contribution(c)
  group by c.kind;
end $$;

create function list_replies(
  p_contribution uuid, p_limit int default 20, p_after_ts timestamptz default null, p_after_id uuid default null
) returns table (
  id uuid, body text, moderation moderation_state, moderation_reason text,
  created_at timestamptz, edited_at timestamptz, author_name text, is_mine boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not community_entitled() then return; end if;
  return query
  select r.id, r.body, r.moderation,
         case when r.user_id = auth.uid() or is_community_moderator() then r.moderation_reason end,
         r.created_at, r.edited_at, community_display_name(r.user_id), r.user_id = auth.uid()
  from contribution_replies r
  where r.contribution_id = p_contribution and can_view_reply(r)
    and (p_after_ts is null or (r.created_at, r.id) > (p_after_ts, p_after_id))
  order by r.created_at asc, r.id asc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

-- ---------------------------------------------------------------------------
-- Reading: groups
-- ---------------------------------------------------------------------------
create function my_groups() returns table (
  id uuid, name text, description text, category text, privacy group_privacy,
  group_status text, my_role group_role, my_status text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not community_entitled() then return; end if;
  return query
  select g.id, g.name, g.description, g.category, g.privacy, g.status, m.role, group_member_state(g.id)
  from group_memberships m join community_groups g on g.id = m.group_id
  where m.user_id = auth.uid()
  order by g.name;
end $$;

-- The directory shows name, description and purpose only. No members, no counts, no content.
create function group_directory(p_q text default null, p_limit int default 20, p_offset int default 0)
returns table (id uuid, name text, description text, purpose text, category text, is_school_group boolean, relationship text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare term text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not community_entitled() or not community_flag('groups_enabled') then return; end if;
  return query
  select g.id, g.name, g.description, g.purpose, g.category, g.school_id is not null,
         case when group_member_state(g.id) is not null then 'member'
              when exists (select 1 from group_join_requests q where q.group_id = g.id and q.user_id = auth.uid() and q.status = 'pending') then 'requested'
              else 'none' end
  from community_groups g
  where g.privacy = 'discoverable' and g.status = 'active'
    and (g.school_id is null or is_school_member(g.school_id))
    and (term is null or g.name ilike '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\'
         or g.description ilike '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%' escape '\')
  order by g.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50) offset greatest(coalesce(p_offset, 0), 0);
end $$;

create function get_group(p_group uuid) returns table (
  id uuid, name text, description text, purpose text, guidelines text, category text, privacy group_privacy,
  group_status text, suspended_reason text, is_school_group boolean, my_role group_role, my_status text,
  join_status text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not community_entitled() then return; end if;
  return query
  select g.id, g.name, g.description, g.purpose, g.guidelines, g.category, g.privacy, g.status,
         case when group_member_state(g.id) is not null or is_community_moderator() then g.suspended_reason end,
         g.school_id is not null, group_role_of(g.id), group_member_state(g.id),
         case when group_member_state(g.id) is not null then 'member'
              when exists (select 1 from group_join_requests q where q.group_id = g.id and q.user_id = auth.uid() and q.status = 'pending') then 'requested'
              else 'none' end
  from community_groups g
  where g.id = p_group
    and (group_member_state(g.id) is not null
         or (g.privacy = 'discoverable' and g.status = 'active' and (g.school_id is null or is_school_member(g.school_id)))
         or is_community_moderator());
end $$;

create function group_roster(p_group uuid) returns table (
  user_id uuid, display_name text, role group_role, status text, joined_at timestamptz, is_me boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not group_can_read(p_group) then return; end if;
  return query
  select m.user_id, community_display_name(m.user_id), m.role,
         case when is_group_manager(p_group) or m.user_id = auth.uid() then
           case when m.status = 'suspended' and (m.suspended_until is null or m.suspended_until > now()) then 'suspended' else 'active' end
         else 'active' end,
         m.created_at, m.user_id = auth.uid()
  from group_memberships m
  where m.group_id = p_group
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, m.created_at;
end $$;

create function list_group_posts(
  p_group uuid, p_kind group_post_kind default null, p_q text default null, p_limit int default 20,
  p_after_ts timestamptz default null, p_after_id uuid default null
) returns table (
  id uuid, kind group_post_kind, title text, body text, devotional_id uuid, devotional_title text,
  scripture_reference text, moderation moderation_state, moderation_reason text,
  created_at timestamptz, edited_at timestamptz, author_name text, is_mine boolean,
  comment_count int, prayer_count int, i_prayed boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  term text := nullif(btrim(coalesce(p_q, '')), '');
  q tsquery;
  pat text;
begin
  if not group_can_read(p_group) then return; end if;
  if term is not null then
    q := websearch_to_tsquery('english', term);
    pat := '%' || replace(replace(replace(term, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select p.id, p.kind, p.title, p.body, p.devotional_id,
         (select d.title from devotionals d where d.id = p.devotional_id and devotional_is_live(d.id)),
         p.scripture_reference, p.moderation,
         case when p.author_id = auth.uid() or is_group_manager(p.group_id) then p.moderation_reason end,
         p.created_at, p.edited_at, community_display_name(p.author_id), p.author_id = auth.uid(),
         (select count(*)::int from group_comments c where c.post_id = p.id and can_view_group_comment(c)),
         case when p.kind = 'prayer' then (select count(*)::int from prayer_acknowledgements a where a.group_post_id = p.id) else 0 end,
         exists (select 1 from prayer_acknowledgements a where a.group_post_id = p.id and a.user_id = auth.uid())
  from group_posts p
  where p.group_id = p_group
    and can_view_group_post(p)
    and (p_kind is null or p.kind = p_kind)
    and (term is null or p.search @@ q or p.body ilike pat escape '\' or coalesce(p.title, '') ilike pat escape '\')
    and (p_after_ts is null or (p.created_at, p.id) < (p_after_ts, p_after_id))
  order by p.created_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
end $$;

create function list_group_comments(p_post uuid, p_limit int default 50) returns table (
  id uuid, parent_id uuid, body text, moderation moderation_state, moderation_reason text,
  created_at timestamptz, edited_at timestamptz, author_name text, is_mine boolean
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not can_view_group_post_id(p_post) then return; end if;
  return query
  select c.id, c.parent_id, c.body, c.moderation,
         case when c.author_id = auth.uid() or is_group_manager(c.group_id) then c.moderation_reason end,
         c.created_at, c.edited_at, community_display_name(c.author_id), c.author_id = auth.uid()
  from group_comments c
  where c.post_id = p_post and can_view_group_comment(c)
  order by c.created_at asc, c.id asc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

create function list_join_requests(p_group uuid) returns table (
  id uuid, requester_name text, message text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_group_manager(p_group) then return; end if;
  return query
  select q.id, community_display_name(q.user_id), q.message, q.created_at
  from group_join_requests q where q.group_id = p_group and q.status = 'pending'
  order by q.created_at;
end $$;

-- Prayer counts are supportive, never competitive: the number is shown beside a prayer and nowhere else.
create function acknowledge_prayer(p_contribution uuid default null, p_group_post uuid default null, p_on boolean default true)
returns int
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if (p_contribution is null) = (p_group_post is null) then
    raise exception 'choose one prayer' using errcode = '22023';
  end if;
  if p_on then
    if p_contribution is not null then
      if not can_acknowledge_contribution(p_contribution) then raise exception 'You cannot do that here.' using errcode = '42501'; end if;
      insert into prayer_acknowledgements (user_id, contribution_id) values (uid, p_contribution) on conflict do nothing;
    else
      if not can_acknowledge_group_post(p_group_post) then raise exception 'You cannot do that here.' using errcode = '42501'; end if;
      insert into prayer_acknowledgements (user_id, group_post_id) values (uid, p_group_post) on conflict do nothing;
    end if;
  else
    delete from prayer_acknowledgements where user_id = uid
      and (contribution_id = p_contribution or group_post_id = p_group_post);
  end if;
  select count(*) into n from prayer_acknowledgements
    where contribution_id = p_contribution or group_post_id = p_group_post;
  return n;
end $$;

-- ===========================================================================
-- GROUP MANAGEMENT
-- ===========================================================================
create function create_group(
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
  if p_school is not null and not has_school_role(p_school, '{owner,admin}') then
    raise exception 'Only a school owner or administrator can create a school group.' using errcode = '42501';
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

-- Small helper used by RPCs that are not table inserts.
create function community_rate_gate(uid uuid, v_kind text, per_hour int, per_day int) returns void
language plpgsql security definer set search_path = public as $$
declare n_hour int; n_day int;
begin
  select count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into n_hour, n_day
  from community_rate_events e where e.user_id = uid and e.kind = v_kind and e.created_at > now() - interval '1 day';
  if n_hour >= per_hour or n_day >= per_day then
    raise exception 'You are doing that too quickly. Please wait a little and try again.' using errcode = 'P0429';
  end if;
  insert into community_rate_events (user_id, kind) values (uid, v_kind);
end $$;

create function update_group(
  p_group uuid, p_name text, p_description text, p_purpose text, p_guidelines text,
  p_category text, p_privacy group_privacy
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(p_group) then raise exception 'Only the group owner can change this.' using errcode = '42501'; end if;
  update community_groups set name = btrim(p_name), description = coalesce(p_description, ''), purpose = coalesce(p_purpose, ''),
    guidelines = coalesce(p_guidelines, ''), category = p_category, privacy = p_privacy
  where id = p_group;
end $$;

create function delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(p_group) then raise exception 'Only the group owner can delete the group.' using errcode = '42501'; end if;
  delete from community_groups where id = p_group;
end $$;

create function request_to_join(p_group uuid, p_message text default '') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); g community_groups;
begin
  if not community_entitled() or not community_flag('groups_enabled') then raise exception 'Groups are not available.' using errcode = '42501'; end if;
  if community_restricted(uid) then raise exception 'Your community access is restricted.' using errcode = '42501'; end if;
  select * into g from community_groups where id = p_group;
  -- The same answer whether the group is private, suspended or does not exist.
  if not found or g.privacy <> 'discoverable' or g.status <> 'active'
     or (g.school_id is not null and not is_school_member(g.school_id)) then
    raise exception 'That group is not available.' using errcode = 'P0002';
  end if;
  if group_member_state(p_group) is not null then raise exception 'You are already in this group.' using errcode = 'P0001'; end if;
  insert into group_join_requests (group_id, user_id, message) values (p_group, uid, left(coalesce(p_message, ''), 300));
exception when unique_violation then
  raise exception 'You have already asked to join this group.' using errcode = 'P0001';
end $$;

create function withdraw_join_request(p_group uuid) returns void
language sql security definer set search_path = public as $$
  update group_join_requests set status = 'withdrawn', decided_at = now()
  where group_id = p_group and user_id = auth.uid() and status = 'pending'
$$;

create function decide_join_request(p_request uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r group_join_requests; g community_groups;
begin
  select * into r from group_join_requests where id = p_request and status = 'pending' for update;
  if not found or not is_group_manager(r.group_id) then raise exception 'Not available.' using errcode = '42501'; end if;
  if p_approve then
    select * into g from community_groups where id = r.group_id;
    if community_restricted(r.user_id) or (g.school_id is not null and not exists (
         select 1 from school_memberships s where s.school_id = g.school_id and s.user_id = r.user_id and s.status = 'active')) then
      raise exception 'This person cannot join right now.' using errcode = 'P0001';
    end if;
    insert into group_memberships (group_id, user_id, role) values (r.group_id, r.user_id, 'member') on conflict do nothing;
  end if;
  update group_join_requests set status = case when p_approve then 'approved' else 'declined' end,
    decided_by = auth.uid(), decided_at = now() where id = p_request;
end $$;

create function preview_group_invitation(p_token text) returns table (group_name text, role group_role)
language sql stable security definer set search_path = public as $$
  select g.name, i.role
  from group_invitations i join community_groups g on g.id = i.group_id
  where i.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
    and i.accepted_at is null and i.expires_at >= now() and g.status = 'active'
    and i.email = caller_verified_email()
$$;

create function accept_group_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); inv group_invitations; g community_groups;
begin
  if caller_verified_email() is null then raise exception 'verify your email first' using errcode = '42501'; end if;
  select * into inv from group_invitations
   where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') for update;
  if not found or inv.accepted_at is not null or inv.expires_at < now() or inv.email <> caller_verified_email() then
    raise exception 'this invitation is invalid or has expired' using errcode = 'P0001';
  end if;
  select * into g from community_groups where id = inv.group_id;
  if g.status <> 'active' or community_restricted(uid)
     or (g.school_id is not null and not is_school_member(g.school_id)) then
    raise exception 'this invitation is invalid or has expired' using errcode = 'P0001';
  end if;
  insert into group_memberships (group_id, user_id, role) values (inv.group_id, uid, inv.role) on conflict do nothing;
  update group_invitations set accepted_at = now() where id = inv.id;
  update group_join_requests set status = 'approved', decided_at = now()
    where group_id = inv.group_id and user_id = uid and status = 'pending';
  return inv.group_id;
end $$;

create function leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from group_memberships where group_id = p_group and user_id = auth.uid();
end $$;

create function set_group_member_role(p_group uuid, p_user uuid, p_role group_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(p_group) then raise exception 'Only the group owner can do this.' using errcode = '42501'; end if;
  if p_role = 'owner' or p_user = auth.uid() then raise exception 'Use transfer to hand over ownership.' using errcode = '22023'; end if;
  update group_memberships set role = p_role where group_id = p_group and user_id = p_user;
end $$;

create function transfer_group_ownership(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(p_group) or p_user = auth.uid() then raise exception 'Not available.' using errcode = '42501'; end if;
  if not exists (select 1 from group_memberships where group_id = p_group and user_id = p_user and status = 'active') then
    raise exception 'Choose an active member.' using errcode = 'P0001';
  end if;
  update group_memberships set role = 'owner' where group_id = p_group and user_id = p_user;
  update group_memberships set role = 'moderator' where group_id = p_group and user_id = auth.uid();
end $$;

-- ===========================================================================
-- MODERATION
-- ===========================================================================
create function log_moderation(
  p_scope text, p_group uuid, p_action moderation_action_kind, p_ttype report_target, p_tid uuid,
  p_user uuid, p_report uuid, p_restriction uuid, p_reason text, p_snapshot text
) returns uuid
language sql security definer set search_path = public as $$
  insert into moderation_actions (scope, group_id, actor_id, action, target_type, target_id, target_user_id, report_id, restriction_id, reason, snapshot)
  values (p_scope, p_group, auth.uid(), p_action, p_ttype, p_tid, p_user, p_report, p_restriction, left(coalesce(p_reason, ''), 1000), left(p_snapshot, 4000))
  returning id
$$;

create function set_content_moderation(p_type report_target, p_id uuid, p_hidden boolean, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare st moderation_state := case when p_hidden then 'hidden' else 'visible' end;
        rs text := case when p_hidden then nullif(btrim(p_reason), '') end;
begin
  if p_type = 'contribution' then
    update community_contributions set moderation = st, moderation_reason = rs, moderated_at = now() where id = p_id;
  elsif p_type = 'reply' then
    update contribution_replies set moderation = st, moderation_reason = rs, moderated_at = now() where id = p_id;
  elsif p_type = 'group_post' then
    update group_posts set moderation = st, moderation_reason = rs, moderated_at = now() where id = p_id;
  elsif p_type = 'group_comment' then
    update group_comments set moderation = st, moderation_reason = rs, moderated_at = now() where id = p_id;
  else
    update direct_messages set moderation = st, moderation_reason = rs, moderated_at = now() where id = p_id;
  end if;
end $$;

-- Who wrote it, which group it is in, and what it said. Internal.
create function content_facts(p_type report_target, p_id uuid)
returns table (author uuid, grp uuid, body text, title text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_type = 'contribution' then
    return query select c.user_id, null::uuid, c.body, c.title from community_contributions c where c.id = p_id;
  elsif p_type = 'reply' then
    return query select r.user_id, null::uuid, r.body, null::text from contribution_replies r where r.id = p_id;
  elsif p_type = 'group_post' then
    return query select p.author_id, p.group_id, p.body, p.title from group_posts p where p.id = p_id;
  elsif p_type = 'group_comment' then
    return query select c.author_id, c.group_id, c.body, null::text from group_comments c where c.id = p_id;
  else
    return query select m.sender_id, null::uuid, m.body, null::text from direct_messages m where m.id = p_id;
  end if;
end $$;

-- 'platform' or 'group' when the caller may act on this content, otherwise null.
--   * Nobody moderates their own content.
--   * Group moderators act on members' content; the owner acts on anyone else's.
--   * Platform moderators act on public content, and on group content only once a report has been escalated to them.
create function moderation_scope(p_type report_target, p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare f record; arole group_role;
begin
  select * into f from content_facts(p_type, p_id);
  if not found or f.author = auth.uid() then return null; end if;
  if f.grp is not null then
    if is_group_manager(f.grp) then
      select role into arole from group_memberships where group_id = f.grp and user_id = f.author;
      if group_role_of(f.grp) = 'owner' or arole is null or arole = 'member' then return 'group'; end if;
    end if;
    if is_community_moderator() and exists (
         select 1 from contribution_reports r where r.target_type = p_type and r.target_id = p_id and r.escalated_at is not null) then
      return 'platform';
    end if;
    return null;
  end if;
  if is_community_moderator() and (p_type in ('contribution', 'reply') or exists (
       select 1 from contribution_reports r where r.target_type = p_type and r.target_id = p_id)) then
    return 'platform';
  end if;
  return null;
end $$;

create function report_content(p_type report_target, p_id uuid, p_reason report_reason, p_details text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); f record; visible boolean; rid uuid; esc timestamptz;
begin
  if not community_entitled() then raise exception 'Not available.' using errcode = '42501'; end if;
  select * into f from content_facts(p_type, p_id);
  if not found then raise exception 'That is no longer available.' using errcode = 'P0002'; end if;
  visible := case p_type
    when 'contribution' then can_view_contribution_id(p_id)
    when 'reply' then exists (select 1 from contribution_replies r where r.id = p_id and can_view_reply(r))
    when 'group_post' then can_view_group_post_id(p_id)
    when 'group_comment' then exists (select 1 from group_comments c where c.id = p_id and can_view_group_comment(c))
    else exists (select 1 from direct_messages m join direct_conversations c on c.id = m.conversation_id
                 where m.id = p_id and uid in (c.user_a, c.user_b)) end;
  if not visible then raise exception 'That is no longer available.' using errcode = 'P0002'; end if;
  if f.author = uid then raise exception 'You cannot report your own contribution.' using errcode = 'P0001'; end if;
  -- A report about a group's owner cannot be handled by that group.
  if f.grp is not null and exists (select 1 from group_memberships where group_id = f.grp and user_id = f.author and role = 'owner') then
    esc := now();
  end if;
  insert into contribution_reports (reporter_id, target_type, target_id, group_id, target_author_id, reason, details, snapshot, snapshot_title, escalated_at)
  values (uid, p_type, p_id, f.grp, f.author, p_reason, nullif(btrim(coalesce(p_details, '')), ''), f.body, f.title, esc)
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'You have already reported this.' using errcode = 'P0001';
end $$;

create function list_platform_reports(p_status text default 'open')
returns table (
  id uuid, target_type report_target, target_id uuid, group_name text, reason report_reason, details text,
  snapshot text, snapshot_title text, status text, created_at timestamptz, escalated boolean,
  author_name text, reporter_name text, author_violations int, content_hidden boolean, resolution_note text,
  group_id uuid, author_id uuid
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_community_moderator() then return; end if;
  return query
  select r.id, r.target_type, r.target_id, (select g.name from community_groups g where g.id = r.group_id),
         r.reason, r.details, r.snapshot, r.snapshot_title, r.status, r.created_at, r.escalated_at is not null,
         moderator_full_name(r.target_author_id), moderator_full_name(r.reporter_id),
         violation_count(r.target_author_id),
         coalesce((select case r.target_type
            when 'contribution' then (select moderation = 'hidden' from community_contributions where id = r.target_id)
            when 'reply' then (select moderation = 'hidden' from contribution_replies where id = r.target_id)
            when 'group_post' then (select moderation = 'hidden' from group_posts where id = r.target_id)
            when 'group_comment' then (select moderation = 'hidden' from group_comments where id = r.target_id)
            else (select moderation = 'hidden' from direct_messages where id = r.target_id) end), false),
         r.resolution_note, r.group_id, r.target_author_id
  from contribution_reports r
  where (r.group_id is null or r.escalated_at is not null)
    and (p_status = 'all' or r.status = p_status)
  order by r.created_at desc
  limit 100;
end $$;

-- A group's own queue. The reporter's identity is never shown to the group.
create function list_group_reports(p_group uuid, p_status text default 'open')
returns table (
  id uuid, target_type report_target, target_id uuid, reason report_reason, details text,
  snapshot text, snapshot_title text, status text, created_at timestamptz, escalated boolean,
  author_name text, resolution_note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_group_manager(p_group) then return; end if;
  return query
  select r.id, r.target_type, r.target_id, r.reason, r.details, r.snapshot, r.snapshot_title, r.status, r.created_at,
         r.escalated_at is not null, community_display_name(r.target_author_id), r.resolution_note
  from contribution_reports r
  where r.group_id = p_group and (p_status = 'all' or r.status = p_status)
  order by r.created_at desc limit 100;
end $$;

create function violation_count(p_user uuid) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_community_moderator() and p_user <> auth.uid() then return 0; end if;
  return (select count(*)::int from moderation_actions a
          where a.target_user_id = p_user and a.action in ('hide', 'warn', 'restrict_user')
            and a.created_at > now() - interval '180 days'
            and not exists (select 1 from moderation_appeals p where p.action_id = a.id and p.status = 'overturned'));
end $$;

-- decision: dismiss | hide | warn. Disagreeing with a view is not a violation; "dismiss" exists for that.
create function resolve_report(p_report uuid, p_decision text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r contribution_reports; sc text; act moderation_action_kind;
begin
  select * into r from contribution_reports where id = p_report and status = 'open' for update;
  if not found then raise exception 'Not available.' using errcode = 'P0002'; end if;
  if r.reporter_id = auth.uid() then raise exception 'You cannot resolve a report you filed.' using errcode = '42501'; end if;
  sc := moderation_scope(r.target_type, r.target_id);
  if sc is null and r.target_author_id is not null and r.target_author_id <> auth.uid() then
    -- Content already deleted by its author: the report can still be closed by the right queue.
    if not exists (select 1 from content_facts(r.target_type, r.target_id)) then
      if r.group_id is null or r.escalated_at is not null then
        if is_community_moderator() then sc := 'platform'; end if;
      elsif is_group_manager(r.group_id) then sc := 'group';
      end if;
    end if;
  end if;
  if sc is null then raise exception 'You cannot act on this report.' using errcode = '42501'; end if;
  if p_decision not in ('dismiss', 'hide', 'warn') then raise exception 'unknown decision' using errcode = '22023'; end if;
  if p_decision <> 'dismiss' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'Please say what was wrong, so the person understands.' using errcode = '22023';
  end if;
  act := case p_decision when 'hide' then 'hide' when 'warn' then 'warn' else 'dismiss' end;
  if p_decision = 'hide' then perform set_content_moderation(r.target_type, r.target_id, true, p_note); end if;
  perform log_moderation(sc, r.group_id, act, r.target_type, r.target_id, r.target_author_id, r.id, null, p_note, r.snapshot);
  update contribution_reports set status = case when p_decision = 'dismiss' then 'dismissed' else 'actioned' end,
    resolved_by = auth.uid(), resolved_at = now(), resolution_note = nullif(btrim(coalesce(p_note, '')), '') where id = r.id;
end $$;

create function escalate_report(p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r contribution_reports;
begin
  select * into r from contribution_reports where id = p_report and status = 'open' and group_id is not null for update;
  if not found or not is_group_manager(r.group_id) then raise exception 'Not available.' using errcode = '42501'; end if;
  update contribution_reports set escalated_at = coalesce(escalated_at, now()) where id = r.id;
end $$;

-- Reverses a hide that was applied by someone with authority over the content.
create function restore_content(p_type report_target, p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare f record; sc text;
begin
  sc := moderation_scope(p_type, p_id);
  if sc is null then raise exception 'You cannot act on this.' using errcode = '42501'; end if;
  select * into f from content_facts(p_type, p_id);
  perform set_content_moderation(p_type, p_id, false, null);
  perform log_moderation(sc, f.grp, 'restore', p_type, p_id, f.author, null, null, p_note, f.body);
end $$;

create function remove_group_member(p_group uuid, p_user uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare trole group_role;
begin
  select role into trole from group_memberships where group_id = p_group and user_id = p_user;
  if trole is null or p_user = auth.uid() or not is_group_manager(p_group)
     or (group_role_of(p_group) = 'moderator' and trole <> 'member') or trole = 'owner' then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  perform log_moderation('group', p_group, 'group_remove_member', null, null, p_user, null, null, p_reason, null);
  delete from group_memberships where group_id = p_group and user_id = p_user;
end $$;

create function suspend_group_member(p_group uuid, p_user uuid, p_days int, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare trole group_role;
begin
  select role into trole from group_memberships where group_id = p_group and user_id = p_user;
  if trole is null or p_user = auth.uid() or not is_group_manager(p_group)
     or (group_role_of(p_group) = 'moderator' and trole <> 'member') or trole = 'owner' then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  update group_memberships set status = 'suspended', suspended_reason = btrim(p_reason),
    suspended_until = case when p_days is null then null else now() + make_interval(days => p_days) end
  where group_id = p_group and user_id = p_user;
  perform log_moderation('group', p_group, 'group_suspend_member', null, null, p_user, null, null, p_reason, null);
end $$;

create function unsuspend_group_member(p_group uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_manager(p_group) then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  update group_memberships set status = 'active', suspended_until = null, suspended_reason = null
   where group_id = p_group and user_id = p_user and status = 'suspended';
  perform log_moderation('group', p_group, 'group_unsuspend_member', null, null, p_user, null, null, '', null);
end $$;

create function suspend_group(p_group uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  update community_groups set status = 'suspended', suspended_reason = btrim(p_reason), suspended_at = now(), suspended_by = auth.uid()
    where id = p_group;
  perform log_moderation('platform', p_group, 'group_suspend', null, null, null, null, null, p_reason, null);
end $$;

create function unsuspend_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  update community_groups set status = 'active', suspended_reason = null, suspended_at = null, suspended_by = null where id = p_group;
  perform log_moderation('platform', p_group, 'group_unsuspend', null, null, null, null, null, '', null);
end $$;

create function restrict_user(p_user uuid, p_kind restriction_kind, p_days int, p_reason text, p_report uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare rid uuid;
begin
  if not is_community_moderator() or p_user = auth.uid() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if exists (select 1 from platform_roles where user_id = p_user and role in ('platform_admin', 'moderator')) then
    raise exception 'Platform staff cannot be restricted this way.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  insert into community_restrictions (user_id, kind, reason, imposed_by, ends_at)
  values (p_user, p_kind, btrim(p_reason), auth.uid(),
          case when p_kind = 'suspension' then now() + make_interval(days => greatest(coalesce(p_days, 7), 1)) end)
  returning id into rid;
  perform log_moderation('platform', null, 'restrict_user', null, null, p_user, p_report, rid, p_reason, null);
  return rid;
end $$;

create function lift_restriction(p_restriction uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r community_restrictions;
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into r from community_restrictions where id = p_restriction and lifted_at is null for update;
  if not found then return; end if;
  update community_restrictions set lifted_at = now(), lifted_by = auth.uid() where id = r.id;
  perform log_moderation('platform', null, 'lift_restriction', null, null, r.user_id, null, r.id, p_note, null);
end $$;

create function list_restrictions() returns table (
  id uuid, user_name text, kind restriction_kind, reason text, ends_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_community_moderator() then return; end if;
  return query select r.id, moderator_full_name(r.user_id), r.kind, r.reason, r.ends_at, r.created_at
    from community_restrictions r where r.lifted_at is null and (r.ends_at is null or r.ends_at > now())
    order by r.created_at desc limit 100;
end $$;

-- ----- the person's own view of what was done, and appeals -----
create function my_moderation_notices() returns table (
  id uuid, action moderation_action_kind, scope text, group_name text, reason text, snapshot text,
  created_at timestamptz, can_appeal boolean, appeal_status text, appeal_note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  return query
  select a.id, a.action, a.scope, (select g.name from community_groups g where g.id = a.group_id), a.reason, a.snapshot, a.created_at,
         (p.id is null and a.created_at > now() - interval '30 days'),
         p.status, p.resolution_note
  from moderation_actions a left join moderation_appeals p on p.action_id = a.id
  where a.target_user_id = auth.uid()
    and a.action in ('hide', 'warn', 'restrict_user', 'group_remove_member', 'group_suspend_member')
  order by a.created_at desc limit 50;
end $$;

create function file_appeal(p_action uuid, p_message text) returns uuid
language plpgsql security definer set search_path = public as $$
declare a moderation_actions; pid uuid;
begin
  select * into a from moderation_actions where id = p_action and target_user_id = auth.uid()
    and action in ('hide', 'warn', 'restrict_user', 'group_remove_member', 'group_suspend_member');
  if not found then raise exception 'Not available.' using errcode = 'P0002'; end if;
  if a.created_at < now() - interval '30 days' then raise exception 'The appeal window has closed.' using errcode = 'P0001'; end if;
  insert into moderation_appeals (action_id, user_id, message) values (a.id, auth.uid(), btrim(p_message)) returning id into pid;
  return pid;
exception when unique_violation then
  raise exception 'You have already appealed this.' using errcode = 'P0001';
end $$;

create function list_appeals(p_status text default 'open') returns table (
  id uuid, action moderation_action_kind, scope text, group_name text, user_name text, message text,
  action_reason text, snapshot text, action_at timestamptz, status text, created_at timestamptz, resolution_note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_community_moderator() then return; end if;
  return query
  select p.id, a.action, a.scope, (select g.name from community_groups g where g.id = a.group_id), moderator_full_name(p.user_id),
         p.message, a.reason, a.snapshot, a.created_at, p.status, p.created_at, p.resolution_note
  from moderation_appeals p join moderation_actions a on a.id = p.action_id
  where p_status = 'all' or p.status = p_status
  order by p.created_at desc limit 100;
end $$;

-- Appeals are reviewed by platform moderators. The person who took the original action does not review it
-- (a platform administrator may, when no one else is available).
create function resolve_appeal(p_appeal uuid, p_decision text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare p moderation_appeals; a moderation_actions;
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into p from moderation_appeals where id = p_appeal and status = 'open' for update;
  if not found then raise exception 'Not available.' using errcode = 'P0002'; end if;
  select * into a from moderation_actions where id = p.action_id;
  if a.actor_id = auth.uid() and not has_platform_role('{platform_admin}') then
    raise exception 'Someone else needs to review this appeal.' using errcode = '42501';
  end if;
  if p_decision not in ('uphold', 'overturn') then raise exception 'unknown decision' using errcode = '22023'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'Please explain the decision.' using errcode = '22023'; end if;
  if p_decision = 'overturn' then
    if a.action = 'hide' and a.target_type is not null then
      perform set_content_moderation(a.target_type, a.target_id, false, null);
    elsif a.action = 'restrict_user' and a.restriction_id is not null then
      update community_restrictions set lifted_at = coalesce(lifted_at, now()), lifted_by = auth.uid() where id = a.restriction_id;
    elsif a.action = 'group_suspend_member' then
      update group_memberships set status = 'active', suspended_until = null, suspended_reason = null
        where group_id = a.group_id and user_id = a.target_user_id;
    elsif a.action = 'group_remove_member' and a.group_id is not null and a.target_user_id is not null
          and exists (select 1 from community_groups where id = a.group_id)
          and not community_restricted(a.target_user_id) then
      insert into group_memberships (group_id, user_id, role) values (a.group_id, a.target_user_id, 'member') on conflict do nothing;
    end if;
  end if;
  update moderation_appeals set status = case p_decision when 'overturn' then 'overturned' else 'upheld' end,
    resolved_by = auth.uid(), resolved_at = now(), resolution_note = btrim(p_note) where id = p.id;
  perform log_moderation('platform', a.group_id,
    case p_decision when 'overturn' then 'appeal_overturned'::moderation_action_kind else 'appeal_upheld'::moderation_action_kind end,
    a.target_type, a.target_id, a.target_user_id, null, a.restriction_id, p_note, null);
end $$;

-- A leader who sees a problem hides it directly, with a reason the author will read.
-- Same authority rules as handling a report: not your own content, and a group moderator cannot hide a leader's.
create function hide_content(p_type report_target, p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare f record; sc text;
begin
  sc := moderation_scope(p_type, p_id);
  if sc is null then raise exception 'You cannot act on this.' using errcode = '42501'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please say what was wrong, so the person understands.' using errcode = '22023'; end if;
  select * into f from content_facts(p_type, p_id);
  perform set_content_moderation(p_type, p_id, true, p_reason);
  perform log_moderation(sc, f.grp, 'hide', p_type, p_id, f.author, null, null, p_reason, f.body);
end $$;

-- ---------------------------------------------------------------------------
-- Blocking. Clients never see author ids, so a block is made from a piece of content.
-- The blocked person is not told. A block hides their content from the blocker and ends direct messaging.
-- ---------------------------------------------------------------------------
create function block_author(p_type report_target, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f record; visible boolean;
begin
  if not community_entitled() then raise exception 'Not available.' using errcode = '42501'; end if;
  select * into f from content_facts(p_type, p_id);
  if not found then raise exception 'That is no longer available.' using errcode = 'P0002'; end if;
  visible := case p_type
    when 'contribution' then can_view_contribution_id(p_id)
    when 'reply' then exists (select 1 from contribution_replies r where r.id = p_id and can_view_reply(r))
    when 'group_post' then can_view_group_post_id(p_id)
    when 'group_comment' then exists (select 1 from group_comments c where c.id = p_id and can_view_group_comment(c))
    else false end;
  if not visible then raise exception 'That is no longer available.' using errcode = 'P0002'; end if;
  if f.author = auth.uid() then raise exception 'You cannot block yourself.' using errcode = 'P0001'; end if;
  -- Anonymous prayers: blocking their author would identify them by elimination, so it is not offered.
  if p_type = 'contribution' and exists (select 1 from community_contributions c where c.id = p_id and c.visibility = 'anonymous') then
    raise exception 'Anonymous prayers cannot be blocked. You can report one instead.' using errcode = 'P0001';
  end if;
  perform community_rate_gate(auth.uid(), 'block', 20, 60);
  insert into user_blocks (blocker_id, blocked_id) values (auth.uid(), f.author) on conflict do nothing;
end $$;

create function my_blocks() returns table (blocked_id uuid, label text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not community_entitled() then return; end if;
  return query
  select b.blocked_id, coalesce(community_display_name(b.blocked_id), 'A member'), b.created_at
  from user_blocks b where b.blocker_id = auth.uid() order by b.created_at desc;
end $$;

-- ---------------------------------------------------------------------------
-- Account deletion: also warn a sole group owner. (Replaces the 0002 function, same signature.)
-- ---------------------------------------------------------------------------
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
$$;

-- ---------------------------------------------------------------------------
-- Housekeeping and privileges
-- ---------------------------------------------------------------------------
revoke all on group_moderators from anon, authenticated;
grant select on group_moderators to authenticated;

-- New functions: closed to the public and to visitors, open to signed-in users.
-- Row policies call the predicates as the signed-in user, so they need execute too.
-- Trigger functions are never callable.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.oid not in (select oid from _pre_0005_fns)
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname not in ('enforce_rate_limit', 'mark_edited', 'protect_last_group_owner', 'delete_empty_group',
                         'group_comments_check', 'log_moderation', 'set_content_moderation', 'content_facts',
                         'community_rate_gate') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
revoke all on function account_deletion_blockers() from public, anon;
grant execute on function account_deletion_blockers() to authenticated;

drop table _pre_0005_fns;
