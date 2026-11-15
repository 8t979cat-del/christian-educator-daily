-- Accounts, roles, school invitations and tightened access policies.
-- Builds on 0001_foundation.sql. Designed for Supabase (auth.uid(), auth.users).
--
-- Principles:
--   * Row-level security is the final authority. The application also checks
--     permissions, but nothing here relies on that.
--   * Clients cannot insert into schools or school_memberships directly. Those
--     writes happen only through the SECURITY DEFINER functions below, which
--     validate who is asking.
--   * Platform roles can never be written by clients.

-- ---------------------------------------------------------------------------
-- Profile fields collected at onboarding
-- ---------------------------------------------------------------------------
alter table profiles drop column role_title;
alter table profiles drop column grade_band;

alter table profiles
  add column first_name text not null default '' check (char_length(first_name) <= 80),
  add column last_name text not null default '' check (char_length(last_name) <= 80),
  add column educational_role text check (educational_role in (
    'elementary_teacher', 'middle_school_teacher', 'high_school_teacher',
    'administrator', 'counselor', 'coach', 'homeschool', 'other')),
  add column grade_levels text[] not null default '{}'
    check (grade_levels <@ array['k2', 'g35', 'g68', 'g912']),
  add column subjects text[] not null default '{}' check (cardinality(subjects) <= 20),
  add column denomination text check (char_length(denomination) <= 80),
  -- Free text the user typed. It is NOT proof of membership and grants no access.
  add column school_affiliation text check (char_length(school_affiliation) <= 120),
  add column notify_assignments boolean not null default true,
  add column notify_community boolean not null default true,
  add column notify_product boolean not null default false,
  add column onboarding_completed_at timestamptz;

alter table profiles
  add constraint profiles_translation_check check (default_translation in ('web', 'kjv'));

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fn text := left(btrim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), 80);
  ln text := left(btrim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), 80);
begin
  insert into profiles (id, first_name, last_name, display_name)
  values (new.id, fn, ln, btrim(fn || ' ' || ln));
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Platform roles (staff). Never writable by clients.
-- ---------------------------------------------------------------------------
create type platform_role as enum ('platform_admin', 'content_editor', 'moderator');

create table platform_roles (
  user_id uuid not null references profiles on delete cascade,
  role platform_role not null,
  granted_by uuid references profiles on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
alter table platform_roles enable row level security;
revoke insert, update, delete on platform_roles from anon, authenticated;

create function has_platform_role(allowed platform_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform_roles
    where user_id = auth.uid() and role = any (allowed)
  )
$$;

create policy platform_roles_select_own on platform_roles for select
  using (user_id = auth.uid());
create policy platform_roles_select_admin on platform_roles for select
  using (has_platform_role('{platform_admin}'));

-- Grant a staff role by email. Only a platform admin may call this.
create function grant_platform_role(target_email text, new_role platform_role) returns void
language plpgsql security definer set search_path = public as $$
declare target uuid;
begin
  if not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into target from auth.users where lower(email) = lower(btrim(target_email));
  if target is null then
    raise exception 'no user with that email' using errcode = 'P0002';
  end if;
  insert into platform_roles (user_id, role, granted_by)
  values (target, new_role, auth.uid())
  on conflict do nothing;
end $$;

-- Revoke a staff role. The last platform admin can never be removed.
create function revoke_platform_role(target_user uuid, old_role platform_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if old_role = 'platform_admin'
     and (select count(*) from platform_roles where role = 'platform_admin' and user_id <> target_user) = 0 then
    raise exception 'cannot remove the last platform admin' using errcode = 'P0001';
  end if;
  delete from platform_roles where user_id = target_user and role = old_role;
end $$;

-- Content editors write devotionals; everyone else only reads published ones.
create policy devotionals_editor_read on devotionals for select
  using (has_platform_role('{platform_admin,content_editor}'));
create policy devotionals_editor_write on devotionals for all
  using (has_platform_role('{platform_admin,content_editor}'))
  with check (has_platform_role('{platform_admin,content_editor}'));
create policy topics_editor_write on topics for all
  using (has_platform_role('{platform_admin,content_editor}'))
  with check (has_platform_role('{platform_admin,content_editor}'));
create policy devotional_topics_editor_write on devotional_topics for all
  using (has_platform_role('{platform_admin,content_editor}'))
  with check (has_platform_role('{platform_admin,content_editor}'));

-- ---------------------------------------------------------------------------
-- Tighten school membership policies
-- ---------------------------------------------------------------------------
-- 0001 let any admin do anything to any membership. Replace it.
drop policy memberships_manage_admin on school_memberships;

-- Direct inserts are not allowed for clients; see create_school / accept_invitation.
revoke insert on schools from anon, authenticated;
revoke insert on school_memberships from anon, authenticated;

create policy schools_delete_owner on schools for delete
  using (has_school_role(id, '{owner}'));

-- Owners manage every membership in their school, including promoting owners.
create policy memberships_update_owner on school_memberships for update
  using (has_school_role(school_id, '{owner}'))
  with check (has_school_role(school_id, '{owner}'));

-- Admins manage only faculty and staff, and cannot promote anyone above that.
create policy memberships_update_admin on school_memberships for update
  using (has_school_role(school_id, '{admin}') and role in ('faculty', 'staff'))
  with check (has_school_role(school_id, '{admin}') and role in ('faculty', 'staff'));

create policy memberships_delete_owner on school_memberships for delete
  using (has_school_role(school_id, '{owner}'));
create policy memberships_delete_admin on school_memberships for delete
  using (has_school_role(school_id, '{admin}') and role in ('faculty', 'staff'));
create policy memberships_delete_self on school_memberships for delete
  using (user_id = auth.uid());

-- A school must always keep at least one owner.
create function protect_last_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- When the school itself is being deleted the school row is already gone.
     and exists (select 1 from schools where id = old.school_id)
     and not exists (
       select 1 from school_memberships
       where school_id = old.school_id and role = 'owner' and status = 'active'
         and user_id <> old.user_id)
  then
    raise exception 'a school must keep at least one owner' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger school_memberships_protect_owner
  before update or delete on school_memberships
  for each row execute function protect_last_owner();

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------
create table school_invitations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references schools on delete cascade,
  email text not null check (email = lower(email) and char_length(email) <= 254),
  role school_role not null default 'faculty' check (role in ('admin', 'faculty', 'staff')),
  -- sha256 of the secret token. The token itself is never stored.
  token_hash text not null unique,
  invited_by uuid references profiles on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index school_invitations_school_idx on school_invitations (school_id);
alter table school_invitations enable row level security;
revoke update on school_invitations from anon, authenticated;

create policy invitations_select_admin on school_invitations for select
  using (has_school_role(school_id, '{owner,admin}'));
create policy invitations_delete_admin on school_invitations for delete
  using (has_school_role(school_id, '{owner,admin}'));
-- Admins invite faculty and staff; only owners invite other admins.
create policy invitations_insert_admin on school_invitations for insert
  with check (
    invited_by = auth.uid()
    and accepted_at is null
    and (
      (role in ('faculty', 'staff') and has_school_role(school_id, '{owner,admin}'))
      or (role = 'admin' and has_school_role(school_id, '{owner}'))
    )
  );

-- ---------------------------------------------------------------------------
-- Functions that perform privileged writes on behalf of a verified caller
-- ---------------------------------------------------------------------------
create function caller_verified_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users
  where id = auth.uid() and email_confirmed_at is not null
$$;

create function create_school(school_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(school_name, ''));
  base text;
  sid uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if caller_verified_email() is null then
    raise exception 'verify your email first' using errcode = '42501';
  end if;
  if char_length(clean) not between 2 and 120 then
    raise exception 'school name must be 2 to 120 characters' using errcode = '22023';
  end if;
  base := trim(both '-' from regexp_replace(lower(clean), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'school'; end if;
  insert into schools (name, slug)
  values (clean, left(base, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  returning id into sid;
  insert into school_memberships (school_id, user_id, role) values (sid, uid, 'owner');
  return sid;
end $$;

create function accept_invitation(invite_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := caller_verified_email();
  inv school_invitations;
begin
  if uid is null or mail is null then
    raise exception 'verify your email first' using errcode = '42501';
  end if;
  select * into inv from school_invitations
  where token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex')
  for update;
  -- One generic message so the response never reveals which check failed.
  if not found or inv.accepted_at is not null or inv.expires_at < now() or inv.email <> mail then
    raise exception 'this invitation is invalid or has expired' using errcode = 'P0001';
  end if;
  insert into school_memberships (school_id, user_id, role)
  values (inv.school_id, uid, inv.role)
  on conflict (school_id, user_id) do nothing;
  update school_invitations set accepted_at = now() where id = inv.id;
  return inv.school_id;
end $$;

-- Lets an invitee see which school invited them, without reading the table.
create function preview_invitation(invite_token text)
returns table (school_name text, role school_role)
language sql stable security definer set search_path = public as $$
  select s.name, i.role
  from school_invitations i
  join schools s on s.id = i.school_id
  where i.token_hash = encode(sha256(convert_to(coalesce(invite_token, ''), 'UTF8')), 'hex')
    and i.accepted_at is null
    and i.expires_at >= now()
    and i.email = caller_verified_email()
$$;

-- Names and roles of the people in a school, visible to its members only.
-- Profiles themselves stay private to each user.
create function school_roster(sid uuid)
returns table (user_id uuid, first_name text, last_name text, role school_role, status text, joined_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.first_name, p.last_name, m.role, m.status, m.created_at
  from school_memberships m
  join profiles p on p.id = m.user_id
  where m.school_id = sid and is_school_member(sid)
  order by p.last_name, p.first_name
$$;

-- Schools that would be left without an owner if the caller deleted their account.
create function account_deletion_blockers() returns setof text
language sql stable security definer set search_path = public as $$
  select s.name
  from school_memberships m
  join schools s on s.id = m.school_id
  where m.user_id = auth.uid() and m.role = 'owner'
    and not exists (
      select 1 from school_memberships o
      where o.school_id = m.school_id and o.role = 'owner' and o.status = 'active'
        and o.user_id <> m.user_id)
$$;

-- Only signed-in users may call these.
revoke execute on function
  create_school(text), accept_invitation(text), preview_invitation(text),
  school_roster(uuid), account_deletion_blockers(),
  grant_platform_role(text, platform_role), revoke_platform_role(uuid, platform_role),
  caller_verified_email()
from public, anon;
grant execute on function
  create_school(text), accept_invitation(text), preview_invitation(text),
  school_roster(uuid), account_deletion_blockers(),
  grant_platform_role(text, platform_role), revoke_platform_role(uuid, platform_role)
to authenticated;
