-- Editorial administration, community moderation and platform governance.
-- Extends 0002 (roles), 0003 (editorial workflow), 0005 (community, moderation) and 0006 (billing).
--
-- What this migration adds, and where each rule is enforced (always in the database):
--   * An administrative audit log that clients can only READ (platform administrators), never write.
--   * A community covenant that must be accepted before a first public or group contribution.
--   * Per-devotional discussion controls: enable/disable, close, pinned editorial question, reply locks.
--     There is still no standalone posting: every public contribution belongs to a live devotional.
--   * Group creation review (pending / approved / rejected) and metadata-only group administration.
--     Platform staff and school administrators never gain access to private group CONTENT by role.
--   * Urgent-safety reporting and an escalation path to platform administrators.
--   * Account suspension and termination, built on the existing restriction + appeal machinery.
--   * Aggregate-only platform analytics (no per-person measures) and retention rules.
--   * Contributors (credits) for devotionals and an "unpublish" transition.

create temp table _pre_0007_fns as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- Governance settings (retention periods, covenant version)
-- ---------------------------------------------------------------------------
create table governance_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
alter table governance_settings enable row level security;
revoke all on governance_settings from anon, authenticated;

insert into governance_settings (key, value) values
  -- Increase to ask everyone to read and accept the covenant again.
  ('covenant_version', '1'),
  ('covenant_required', 'true'),
  -- Days after which the quoted text inside a closed report or a moderation record is cleared.
  -- The record itself (who, what kind, when, outcome) is kept so that proportionality can be reviewed.
  ('retention_report_snapshot_days', '365'),
  ('retention_moderation_snapshot_days', '730'),
  ('retention_audit_days', '730'),
  ('retention_stripe_events_days', '400'),
  ('retention_usage_days', '800');

create function governance_int(k text, fallback int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from governance_settings where key = k), fallback)
$$;

create function governance_flag(k text, fallback boolean) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::boolean from governance_settings where key = k), fallback)
$$;

-- ---------------------------------------------------------------------------
-- Administrative audit log
-- ---------------------------------------------------------------------------
create table admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid references auth.users on delete set null,
  -- The platform roles the actor held at the time.
  actor_roles text[] not null default '{}',
  action text not null,
  entity text not null,
  entity_id text,
  -- Deliberately not a foreign key: the log must outlive a deleted school.
  school_id uuid,
  detail jsonb not null default '{}'
);
create index admin_audit_log_at on admin_audit_log (at desc);
create index admin_audit_log_entity on admin_audit_log (entity, at desc);
create index admin_audit_log_school on admin_audit_log (school_id, at desc) where school_id is not null;
alter table admin_audit_log enable row level security;
revoke all on admin_audit_log from anon, authenticated;

create function audit_record(p_action text, p_entity text, p_entity_id text, p_detail jsonb default '{}', p_school uuid default null)
returns void
language sql security definer set search_path = public as $$
  insert into admin_audit_log (actor_id, actor_roles, action, entity, entity_id, school_id, detail)
  values (auth.uid(),
          coalesce((select array_agg(role::text order by role) from platform_roles where user_id = auth.uid()), '{}'),
          p_action, p_entity, p_entity_id, p_school, coalesce(p_detail, '{}'));
$$;

-- Records changes to sensitive configuration tables. Changes made by server jobs
-- (no signed-in person, such as the billing webhook) are not administrative actions and are skipped.
create function audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ent text := tg_argv[0];
  idcol text := tg_argv[1];
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  det jsonb;
  k text;
  v jsonb;
  act text;
  sid uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    act := 'create'; det := n;
  elsif tg_op = 'DELETE' then
    act := 'delete'; det := o;
  else
    act := 'update'; det := '{}';
    for k, v in select * from jsonb_each(n) loop
      if k not in ('updated_at', 'updated_by') and v is distinct from o -> k then
        det := det || jsonb_build_object(k, jsonb_build_object('from', o -> k, 'to', v));
      end if;
    end loop;
    if det = '{}' then return new; end if;
  end if;
  begin
    sid := (coalesce(n, o) ->> 'school_id')::uuid;
  exception when others then sid := null;
  end;
  perform audit_record(act, ent, coalesce(n, o) ->> idcol, det, case when ent = 'school_membership' then sid end);
  return coalesce(new, old);
end $$;

create trigger audit_platform_roles after insert or delete on platform_roles
  for each row execute function audit_row_change('platform_role', 'user_id');
create trigger audit_community_settings after insert or update or delete on community_settings
  for each row execute function audit_row_change('community_setting', 'key');
create trigger audit_governance_settings after insert or update or delete on governance_settings
  for each row execute function audit_row_change('governance_setting', 'key');
create trigger audit_billing_settings after insert or update or delete on billing_settings
  for each row execute function audit_row_change('billing_setting', 'key');
create trigger audit_plans after insert or update or delete on plans
  for each row execute function audit_row_change('plan', 'key');
create trigger audit_plan_features after insert or update or delete on plan_features
  for each row execute function audit_row_change('plan_feature', 'plan_key');
create trigger audit_plan_prices after insert or update or delete on plan_prices
  for each row execute function audit_row_change('plan_price', 'id');
create trigger audit_entitlement_grants after insert or update or delete on entitlement_grants
  for each row execute function audit_row_change('entitlement_grant', 'id');
create trigger audit_resources after insert or update or delete on resources
  for each row execute function audit_row_change('resource', 'id');
create trigger audit_school_memberships after insert or update or delete on school_memberships
  for each row execute function audit_row_change('school_membership', 'user_id');

create function admin_audit_list(p_limit int default 50, p_offset int default 0, p_entity text default null)
returns table (id uuid, at timestamptz, actor_name text, actor_roles text[], action text, entity text, entity_id text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not has_platform_role('{platform_admin}') then return; end if;
  return query
  select a.id, a.at,
         (select nullif(btrim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = a.actor_id),
         a.actor_roles, a.action, a.entity, a.entity_id, a.detail
  from admin_audit_log a
  where p_entity is null or a.entity = p_entity
  order by a.at desc, a.id
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- A school's own administrators see membership changes inside their school, nothing else.
create function school_audit_list(p_school uuid, p_limit int default 50)
returns table (at timestamptz, actor_name text, action text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(has_school_role(p_school, '{owner,admin}'), false) then return; end if;
  return query
  select a.at, (select nullif(btrim(p.first_name || ' ' || p.last_name), '') from profiles p where p.id = a.actor_id),
         a.action, a.detail
  from admin_audit_log a where a.school_id = p_school
  order by a.at desc limit least(greatest(p_limit, 1), 100);
end $$;

create function get_governance_settings() returns table (key text, value jsonb)
language sql stable security definer set search_path = public as $$
  select s.key, s.value from governance_settings s where has_platform_role('{platform_admin}') order by s.key
$$;

create function set_governance_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from governance_settings where key = k) then
    raise exception 'unknown setting' using errcode = 'P0002';
  end if;
  if k = 'covenant_required' then
    if jsonb_typeof(v) <> 'boolean' then raise exception 'Expected true or false.' using errcode = '22023'; end if;
  elsif k = 'covenant_version' then
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric)
       or (v #>> '{}')::int < governance_int('covenant_version', 1) then
      raise exception 'The covenant version can only go up.' using errcode = '22023';
    end if;
  else
    if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 30 or (v #>> '{}')::numeric > 3650
       or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
      raise exception 'Retention must be a whole number of days between 30 and 3650.' using errcode = '22023';
    end if;
  end if;
  update governance_settings set value = v, updated_by = auth.uid(), updated_at = now() where key = k;
end $$;

-- ---------------------------------------------------------------------------
-- Community covenant acknowledgement
-- ---------------------------------------------------------------------------
create table covenant_acceptances (
  user_id uuid not null references auth.users on delete cascade,
  version int not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);
alter table covenant_acceptances enable row level security;
revoke all on covenant_acceptances from anon, authenticated;
grant select on covenant_acceptances to authenticated;
create policy covenant_select_own on covenant_acceptances for select to authenticated using (user_id = auth.uid());

create function covenant_accepted() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    not governance_flag('covenant_required', true)
    or exists (select 1 from covenant_acceptances a
               where a.user_id = auth.uid() and a.version = governance_int('covenant_version', 1)), false)
$$;

create function covenant_status() returns table (version int, required boolean, accepted boolean, accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select governance_int('covenant_version', 1), governance_flag('covenant_required', true), covenant_accepted(),
         (select a.accepted_at from covenant_acceptances a
          where a.user_id = auth.uid() and a.version = governance_int('covenant_version', 1))
  where auth.uid() is not null
$$;

create function accept_covenant(p_version int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not community_entitled() then raise exception 'Verify your email to join the community.' using errcode = '42501'; end if;
  if p_version is distinct from governance_int('covenant_version', 1) then
    raise exception 'The covenant has been updated. Please read it again.' using errcode = 'P0001';
  end if;
  insert into covenant_acceptances (user_id, version) values (auth.uid(), p_version) on conflict do nothing;
end $$;

-- Posting publicly, and writing in a group, both require the covenant.
create or replace function can_post_publicly() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(community_entitled()
     and community_flag('public_discussions_enabled')
     and not community_restricted(auth.uid())
     and covenant_accepted(), false)
$$;

create or replace function group_can_write(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    community_entitled()
    and community_flag('groups_enabled')
    and not community_restricted(auth.uid())
    and covenant_accepted()
    and group_is_active(gid)
    and group_member_state(gid) = 'active', false)
$$;

-- ---------------------------------------------------------------------------
-- Discussion controls (per devotional)
-- ---------------------------------------------------------------------------
-- No row means the default: discussion is on and open.
create table devotional_discussion (
  devotional_id uuid primary key references devotionals on delete cascade,
  enabled boolean not null default true,
  closed_at timestamptz,
  closed_by uuid references auth.users on delete set null,
  pinned_question text check (pinned_question is null or length(btrim(pinned_question)) between 1 and 400),
  pinned_by uuid references auth.users on delete set null,
  updated_at timestamptz not null default now()
);
alter table devotional_discussion enable row level security;
revoke all on devotional_discussion from anon, authenticated;

alter table community_contributions
  add column replies_locked boolean not null default false,
  add column acks_locked boolean not null default false;
alter table group_posts add column comments_locked boolean not null default false;

create function discussion_enabled(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select d.enabled from devotional_discussion d where d.devotional_id = did), true)
$$;

-- Open means people can add to it. A closed discussion stays readable.
create function discussion_open(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select d.enabled and d.closed_at is null from devotional_discussion d where d.devotional_id = did), true)
$$;

create function discussion_state(p_devotional uuid)
returns table (enabled boolean, closed boolean, pinned_question text)
language sql stable security definer set search_path = public as $$
  select discussion_enabled(p_devotional), not discussion_open(p_devotional) and discussion_enabled(p_devotional),
         (select d.pinned_question from devotional_discussion d where d.devotional_id = p_devotional)
  where auth.uid() is not null and (devotional_is_live(p_devotional) or is_content_editor())
$$;

create function set_discussion_controls(p_devotional uuid, p_enabled boolean, p_closed boolean, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (is_content_editor() or is_community_moderator()) then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  if not exists (select 1 from devotionals where id = p_devotional) then
    raise exception 'That devotional does not exist.' using errcode = 'P0002';
  end if;
  insert into devotional_discussion (devotional_id, enabled, closed_at, closed_by)
  values (p_devotional, p_enabled, case when p_closed then now() end, case when p_closed then auth.uid() end)
  on conflict (devotional_id) do update
    set enabled = excluded.enabled, closed_at = excluded.closed_at, closed_by = excluded.closed_by, updated_at = now();
  perform audit_record(
    case when not p_enabled then 'discussion.disable' when p_closed then 'discussion.close' else 'discussion.open' end,
    'devotional', p_devotional::text, jsonb_build_object('note', left(btrim(coalesce(p_note, '')), 500)));
end $$;

create function set_pinned_question(p_devotional uuid, p_question text) returns void
language plpgsql security definer set search_path = public as $$
declare q text := nullif(btrim(coalesce(p_question, '')), '');
begin
  if not is_content_editor() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if q is not null and length(q) > 400 then raise exception 'Keep the question under 400 characters.' using errcode = '22023'; end if;
  if not exists (select 1 from devotionals where id = p_devotional) then
    raise exception 'That devotional does not exist.' using errcode = 'P0002';
  end if;
  insert into devotional_discussion (devotional_id, pinned_question, pinned_by)
  values (p_devotional, q, case when q is not null then auth.uid() end)
  on conflict (devotional_id) do update
    set pinned_question = excluded.pinned_question, pinned_by = excluded.pinned_by, updated_at = now();
  perform audit_record(case when q is null then 'discussion.unpin_question' else 'discussion.pin_question' end,
    'devotional', p_devotional::text, jsonb_build_object('question', q));
end $$;

-- Lock replies on one thread, or stop new acknowledgements on one prayer. Moderators and editors.
create function set_thread_controls(p_contribution uuid, p_replies_locked boolean, p_acks_locked boolean, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare c community_contributions;
begin
  if not (is_community_moderator() or is_content_editor()) then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into c from community_contributions where id = p_contribution for update;
  if not found then raise exception 'That is no longer available.' using errcode = 'P0002'; end if;
  if p_acks_locked and c.kind <> 'prayer' then raise exception 'Only prayers have acknowledgements.' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason, '')) = '' and (p_replies_locked or p_acks_locked) then
    raise exception 'Please give a reason.' using errcode = '22023';
  end if;
  update community_contributions set replies_locked = p_replies_locked, acks_locked = p_acks_locked where id = c.id;
  perform audit_record('discussion.thread_controls', 'contribution', c.id::text,
    jsonb_build_object('replies_locked', p_replies_locked, 'acks_locked', p_acks_locked, 'reason', left(btrim(coalesce(p_reason, '')), 500)));
end $$;

create function thread_controls(p_devotional uuid)
returns table (contribution_id uuid, replies_locked boolean, acks_locked boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.replies_locked, c.acks_locked
  from community_contributions c
  where c.devotional_id = p_devotional and (c.replies_locked or c.acks_locked) and can_view_contribution(c)
$$;

create function set_group_post_locked(p_post uuid, p_locked boolean) returns void
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  select group_id into g from group_posts where id = p_post;
  if g is null or not is_group_manager(g) then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  update group_posts set comments_locked = p_locked where id = p_post;
end $$;

create function group_locked_posts(p_group uuid) returns table (post_id uuid)
language sql stable security definer set search_path = public as $$
  select p.id from group_posts p where p.group_id = p_group and p.comments_locked and group_can_read(p_group)
$$;

-- Hidden threads stay hidden; a disabled discussion hides everyone's public contributions from
-- ordinary readers (authors still see their own, moderators still see what was reported).
create or replace function can_view_contribution(c community_contributions) returns boolean
language sql stable security definer set search_path = public as $$
  select community_entitled()
    and community_flag('public_discussions_enabled')
    and devotional_is_live(c.devotional_id)
    and (
      c.user_id = auth.uid()
      or (
        c.visibility <> 'private'
        and (discussion_enabled(c.devotional_id) or is_community_moderator())
        and (c.moderation = 'visible' or is_community_moderator())
        and not viewer_blocks(c.user_id)
      )
    )
$$;

create or replace function can_reply_to_contribution(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_post_publicly()
    and exists (
      select 1 from community_contributions c
      where c.id = cid
        and c.visibility <> 'private'
        and c.moderation = 'visible'
        and not c.replies_locked
        and devotional_is_live(c.devotional_id)
        and discussion_open(c.devotional_id)
        and not viewer_blocks(c.user_id)
        and not user_blocks_viewer(c.user_id))
$$;

drop policy contributions_insert on community_contributions;
create policy contributions_insert on community_contributions for insert to authenticated
  with check (user_id = auth.uid() and can_post_publicly() and devotional_is_live(devotional_id)
              and discussion_open(devotional_id));

-- Acknowledging a prayer stays possible when a discussion is merely closed, but not when it is
-- disabled or when moderators have stopped acknowledgements on that prayer.
create or replace function can_acknowledge_contribution(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(can_post_publicly()
    and exists (
      select 1 from community_contributions c
      where c.id = cid and c.kind = 'prayer' and c.visibility <> 'private'
        and c.moderation = 'visible' and c.user_id <> auth.uid()
        and not c.acks_locked
        and devotional_is_live(c.devotional_id)
        and discussion_enabled(c.devotional_id)
        and not viewer_blocks(c.user_id)), false)
$$;

create or replace function can_comment_on_group_post(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_posts p
    where p.id = pid
      and group_can_write(p.group_id)
      and p.moderation = 'visible'
      and not p.comments_locked
      and not user_blocks_viewer(p.author_id))
$$;

-- ---------------------------------------------------------------------------
-- Group creation review
-- ---------------------------------------------------------------------------
alter table community_groups drop constraint community_groups_status_check;
alter table community_groups add constraint community_groups_status_check
  check (status in ('pending', 'active', 'suspended', 'rejected'));
-- For a pending or rejected group, suspended_reason holds the reviewer's note to the owner.

insert into community_settings (key, value) values ('group_requires_approval', 'true');

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
  st text;
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
  -- School-owned groups are created by an accountable school administrator, and groups made by
  -- platform staff are already trusted. Every other group waits for review while approval is required.
  st := case when p_school is not null or is_community_moderator() or not community_flag('group_requires_approval')
             then 'active' else 'pending' end;
  insert into community_groups (name, description, purpose, guidelines, category, privacy, school_id, created_by, status)
  values (btrim(p_name), coalesce(p_description, ''), coalesce(p_purpose, ''), coalesce(p_guidelines, ''),
          p_category, p_privacy, p_school, uid, st)
  returning id into gid;
  insert into group_memberships (group_id, user_id, role) values (gid, uid, 'owner');
  return gid;
end $$;

-- Deleting a whole group removes its owner's membership too; that is not "leaving".
create or replace function protect_last_group_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     and coalesce(current_setting('app.deleting_group', true), '') <> old.group_id::text
     and exists (select 1 from community_groups where id = old.group_id)
     and not exists (select 1 from group_memberships where group_id = old.group_id and role = 'owner' and user_id <> old.user_id)
     and exists (select 1 from group_memberships where group_id = old.group_id and user_id <> old.user_id)
  then
    raise exception 'Hand ownership to another member before leaving this group.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_group_owner(p_group) then raise exception 'Only the group owner can delete the group.' using errcode = '42501'; end if;
  perform set_config('app.deleting_group', p_group::text, true);
  delete from community_groups where id = p_group;
end $$;

-- Metadata only: never posts, comments, or member lists.
create function admin_group_overview(p_status text default null, p_q text default null)
returns table (
  id uuid, name text, status text, privacy group_privacy, category text, school_name text, owner_name text,
  member_count int, open_reports int, created_at timestamptz, note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare term text := nullif(btrim(coalesce(p_q, '')), '');
begin
  if not is_community_moderator() then return; end if;
  return query
  select g.id, g.name, g.status, g.privacy, g.category,
         (select s.name from schools s where s.id = g.school_id),
         (select moderator_full_name(m.user_id) from group_memberships m where m.group_id = g.id and m.role = 'owner' order by m.created_at limit 1),
         (select count(*)::int from group_memberships m where m.group_id = g.id and m.status = 'active'),
         (select count(*)::int from contribution_reports r where r.group_id = g.id and r.status = 'open'),
         g.created_at, g.suspended_reason
  from community_groups g
  where (p_status is null or g.status = p_status)
    and (term is null or g.name ilike '%' || term || '%')
  order by (g.status = 'pending') desc, g.created_at desc
  limit 100;
end $$;

create function decide_group_request(p_group uuid, p_approve boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = public as $$
declare g community_groups;
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into g from community_groups where id = p_group and status = 'pending' for update;
  if not found then raise exception 'That request has already been decided.' using errcode = 'P0001'; end if;
  if not p_approve and btrim(coalesce(p_reason, '')) = '' then
    raise exception 'Please tell the requester why, so they can try again.' using errcode = '22023';
  end if;
  update community_groups set
    status = case when p_approve then 'active' else 'rejected' end,
    suspended_reason = case when p_approve then null else btrim(p_reason) end,
    suspended_at = null, suspended_by = null
  where id = g.id;
  perform audit_record(case when p_approve then 'group.approve' else 'group.reject' end, 'group', g.id::text,
    jsonb_build_object('name', g.name, 'reason', left(btrim(coalesce(p_reason, '')), 500)));
end $$;

-- Platform administrators only. These change who runs a group; none of them reveals group content.
create function admin_transfer_group_ownership(p_group uuid, p_new_owner uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare g community_groups;
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into g from community_groups where id = p_group for update;
  if not found then raise exception 'That group does not exist.' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  if not exists (select 1 from group_memberships where group_id = p_group and user_id = p_new_owner and status = 'active') then
    raise exception 'Choose an active member of the group.' using errcode = 'P0001';
  end if;
  -- Promote first: a group may never be left without an owner, even for a moment.
  update group_memberships set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  update group_memberships set role = 'moderator' where group_id = p_group and role = 'owner' and user_id <> p_new_owner;
  perform audit_record('group.transfer_ownership', 'group', p_group::text,
    jsonb_build_object('name', g.name, 'new_owner', p_new_owner, 'reason', left(btrim(p_reason), 500)));
end $$;

-- Who is in a group, by name and role only, so ownership can be handed to the right person.
-- Each look is written to the audit log. No posts, comments or messages are ever returned.
create function admin_group_members(p_group uuid)
returns table (user_id uuid, name text, role group_role, status text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  perform audit_record('group.view_members', 'group', p_group::text);
  return query
  select m.user_id, moderator_full_name(m.user_id), m.role, m.status
  from group_memberships m where m.group_id = p_group
  order by (m.role = 'owner') desc, (m.role = 'moderator') desc, 2;
end $$;

create function admin_set_group_role(p_group uuid, p_user uuid, p_role group_role, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if p_role = 'owner' then raise exception 'Use ownership transfer to change the owner.' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  if exists (select 1 from group_memberships where group_id = p_group and user_id = p_user and role = 'owner') then
    raise exception 'Transfer ownership before changing the owner''s role.' using errcode = 'P0001';
  end if;
  update group_memberships set role = p_role where group_id = p_group and user_id = p_user and status = 'active';
  if not found then raise exception 'Choose an active member of the group.' using errcode = 'P0001'; end if;
  perform audit_record('group.set_role', 'group', p_group::text,
    jsonb_build_object('user', p_user, 'role', p_role, 'reason', left(btrim(p_reason), 500)));
end $$;

create function admin_delete_group(p_group uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare g community_groups;
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  select * into g from community_groups where id = p_group for update;
  if not found then raise exception 'That group does not exist.' using errcode = 'P0002'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  perform audit_record('group.delete', 'group', p_group::text,
    jsonb_build_object('name', g.name, 'status', g.status, 'reason', left(btrim(p_reason), 500)));
  perform set_config('app.deleting_group', p_group::text, true);
  delete from community_groups where id = p_group;
end $$;

-- School administrators: their own school's groups, by metadata only.
create function school_group_overview(p_school uuid)
returns table (id uuid, name text, status text, privacy group_privacy, owner_name text, member_count int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not coalesce(has_school_role(p_school, '{owner,admin}'), false) then return; end if;
  return query
  select g.id, g.name, g.status, g.privacy,
         (select nullif(btrim(p.first_name || ' ' || p.last_name), '')
            from group_memberships m join profiles p on p.id = m.user_id where m.group_id = g.id and m.role = 'owner' limit 1),
         (select count(*)::int from group_memberships m where m.group_id = g.id and m.status = 'active'),
         g.created_at
  from community_groups g where g.school_id = p_school order by g.name;
end $$;

create function school_transfer_group_ownership(p_group uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g community_groups;
begin
  select * into g from community_groups where id = p_group and school_id is not null for update;
  if not found or not coalesce(has_school_role(g.school_id, '{owner,admin}'), false) then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  if not exists (select 1 from school_memberships where school_id = g.school_id and user_id = p_new_owner and status = 'active')
     or not exists (select 1 from group_memberships where group_id = p_group and user_id = p_new_owner and status = 'active') then
    raise exception 'Choose an active member of both the school and the group.' using errcode = 'P0001';
  end if;
  -- Promote first: a group may never be left without an owner, even for a moment.
  update group_memberships set role = 'owner' where group_id = p_group and user_id = p_new_owner;
  update group_memberships set role = 'moderator' where group_id = p_group and role = 'owner' and user_id <> p_new_owner;
  perform audit_record('group.transfer_ownership', 'group', p_group::text,
    jsonb_build_object('name', g.name, 'new_owner', p_new_owner), g.school_id);
end $$;

create function school_delete_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g community_groups;
begin
  select * into g from community_groups where id = p_group and school_id is not null for update;
  if not found or not coalesce(has_school_role(g.school_id, '{owner,admin}'), false) then
    raise exception 'You cannot do that.' using errcode = '42501';
  end if;
  perform audit_record('group.delete', 'group', p_group::text, jsonb_build_object('name', g.name), g.school_id);
  perform set_config('app.deleting_group', p_group::text, true);
  delete from community_groups where id = p_group;
end $$;

-- ---------------------------------------------------------------------------
-- Urgent safety reports and escalation
-- ---------------------------------------------------------------------------
alter table contribution_reports
  add column urgent_at timestamptz,
  add column admin_escalated_at timestamptz,
  add column admin_escalation_note text check (admin_escalation_note is null or length(admin_escalation_note) <= 1000),
  add column admin_closed_at timestamptz,
  add column admin_closed_note text check (admin_closed_note is null or length(admin_closed_note) <= 1000);

drop function report_content(report_target, uuid, report_reason, text);
-- An urgent report goes straight to platform moderators, even from a private group.
create function report_content(
  p_type report_target, p_id uuid, p_reason report_reason, p_details text default null, p_urgent boolean default false
) returns uuid
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
  if f.grp is not null and exists (select 1 from group_memberships where group_id = f.grp and user_id = f.author and role = 'owner') then
    esc := now();
  end if;
  if p_urgent then esc := now(); end if;
  insert into contribution_reports (reporter_id, target_type, target_id, group_id, target_author_id, reason, details, snapshot, snapshot_title, escalated_at, urgent_at)
  values (uid, p_type, p_id, f.grp, f.author, p_reason, nullif(btrim(coalesce(p_details, '')), ''), f.body, f.title, esc,
          case when p_urgent then now() end)
  returning id into rid;
  return rid;
exception when unique_violation then
  raise exception 'You have already reported this.' using errcode = 'P0001';
end $$;

drop function list_platform_reports(text);
create function list_platform_reports(p_status text default 'open')
returns table (
  id uuid, target_type report_target, target_id uuid, group_name text, reason report_reason, details text,
  snapshot text, snapshot_title text, status text, created_at timestamptz, escalated boolean,
  author_name text, reporter_name text, author_violations int, content_hidden boolean, resolution_note text,
  group_id uuid, author_id uuid, urgent boolean, is_prayer boolean, admin_escalated boolean
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
         r.resolution_note, r.group_id, r.target_author_id,
         r.urgent_at is not null,
         coalesce(r.target_type = 'contribution' and exists (select 1 from community_contributions c where c.id = r.target_id and c.kind = 'prayer'), false),
         r.admin_escalated_at is not null and r.admin_closed_at is null
  from contribution_reports r
  where (r.group_id is null or r.escalated_at is not null)
    and (p_status = 'all' or r.status = p_status)
  order by (r.urgent_at is not null and r.status = 'open') desc, r.created_at desc
  limit 100;
end $$;

create function escalate_to_admin(p_report uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_community_moderator() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'Please say what needs a decision.' using errcode = '22023'; end if;
  update contribution_reports set admin_escalated_at = now(), admin_escalation_note = left(btrim(p_note), 1000),
         admin_closed_at = null, admin_closed_note = null
   where id = p_report and (group_id is null or escalated_at is not null) and admin_escalated_at is null;
  if not found then raise exception 'Not available.' using errcode = 'P0002'; end if;
  perform audit_record('report.escalate_to_admin', 'report', p_report::text, jsonb_build_object('note', left(btrim(p_note), 500)));
end $$;

create function list_admin_escalations(p_include_closed boolean default false)
returns table (
  id uuid, reason report_reason, urgent boolean, snapshot text, created_at timestamptz,
  escalated_at timestamptz, note text, author_name text, report_status text, closed_at timestamptz, closed_note text
)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not has_platform_role('{platform_admin}') then return; end if;
  return query
  select r.id, r.reason, r.urgent_at is not null, r.snapshot, r.created_at, r.admin_escalated_at, r.admin_escalation_note,
         moderator_full_name(r.target_author_id), r.status, r.admin_closed_at, r.admin_closed_note
  from contribution_reports r
  where r.admin_escalated_at is not null and (p_include_closed or r.admin_closed_at is null)
  order by (r.urgent_at is not null) desc, r.admin_escalated_at desc limit 100;
end $$;

create function close_admin_escalation(p_report uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if btrim(coalesce(p_note, '')) = '' then raise exception 'Please record what was done.' using errcode = '22023'; end if;
  update contribution_reports set admin_closed_at = now(), admin_closed_note = left(btrim(p_note), 1000)
   where id = p_report and admin_escalated_at is not null and admin_closed_at is null;
  if not found then raise exception 'Not available.' using errcode = 'P0002'; end if;
  perform audit_record('report.close_escalation', 'report', p_report::text, jsonb_build_object('note', left(btrim(p_note), 500)));
end $$;

-- ---------------------------------------------------------------------------
-- Moderation history (platform scope), for moderators
-- ---------------------------------------------------------------------------
create function list_moderation_history(p_limit int default 50, p_offset int default 0, p_user uuid default null)
returns table (id uuid, at timestamptz, action text, actor_name text, target_name text, reason text, group_name text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_community_moderator() then return; end if;
  return query
  select * from (
    select a.id, a.created_at as at, a.action::text as action, moderator_full_name(a.actor_id) as actor_name,
           moderator_full_name(a.target_user_id) as target_name, a.reason,
           (select g.name from community_groups g where g.id = a.group_id) as group_name
    from moderation_actions a where a.scope = 'platform' and (p_user is null or a.target_user_id = p_user)
    union all
    select l.id, l.at, l.action, moderator_full_name(l.actor_id), null::text,
           coalesce(l.detail ->> 'reason', l.detail ->> 'note', l.detail ->> 'question', ''), null::text
    from admin_audit_log l
    where p_user is null and (l.action like 'discussion.%' or l.action like 'group.%' or l.action like 'report.%' or l.action like 'account.%')
  ) h
  order by h.at desc limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Account suspension and termination
-- ---------------------------------------------------------------------------
create table account_status (
  user_id uuid primary key references auth.users on delete cascade,
  status text not null check (status in ('suspended', 'terminated')),
  reason text not null,
  set_by uuid references auth.users on delete set null,
  set_at timestamptz not null default now(),
  until timestamptz,
  check (status = 'terminated' or until is not null)
);
alter table account_status enable row level security;
revoke all on account_status from anon, authenticated;

-- What the signed-in person's own status is. Expired suspensions read as active.
create function my_account_status() returns table (status text, reason text, until timestamptz)
language sql stable security definer set search_path = public as $$
  select s.status, s.reason, s.until from account_status s
  where s.user_id = auth.uid() and (s.status = 'terminated' or s.until > now())
$$;

create function admin_set_account_status(p_user uuid, p_status text, p_reason text, p_days int default 14) returns void
language plpgsql security definer set search_path = public as $$
declare rid uuid; r record;
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own account.' using errcode = '42501'; end if;
  if exists (select 1 from platform_roles where user_id = p_user) then
    raise exception 'Remove staff roles first.' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'No such account.' using errcode = 'P0002'; end if;
  if p_status not in ('suspended', 'terminated', 'active') then raise exception 'unknown status' using errcode = '22023'; end if;
  if btrim(coalesce(p_reason, '')) = '' then raise exception 'Please give a reason.' using errcode = '22023'; end if;
  if p_status = 'active' then
    delete from account_status where user_id = p_user;
    for r in select id from community_restrictions where user_id = p_user and lifted_at is null loop
      perform lift_restriction(r.id, p_reason);
    end loop;
  else
    -- The restriction carries the community block, the notice the person reads, and the right to appeal.
    rid := restrict_user(p_user, case when p_status = 'terminated' then 'ban' else 'suspension' end::restriction_kind,
                         greatest(coalesce(p_days, 14), 1), p_reason);
    insert into account_status (user_id, status, reason, set_by, until)
    values (p_user, p_status, btrim(p_reason), auth.uid(),
            case when p_status = 'suspended' then now() + make_interval(days => greatest(coalesce(p_days, 14), 1)) end)
    on conflict (user_id) do update set status = excluded.status, reason = excluded.reason, set_by = excluded.set_by,
      set_at = now(), until = excluded.until;
  end if;
  perform audit_record('account.' || p_status, 'user', p_user::text,
    jsonb_build_object('reason', left(btrim(p_reason), 500), 'days', case when p_status = 'suspended' then p_days end));
end $$;

-- Overturning a restriction on appeal also restores the account.
create function account_status_follow_restriction() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.lifted_at is not null and old.lifted_at is null then
    delete from account_status s where s.user_id = new.user_id
      and not exists (select 1 from community_restrictions r
                      where r.user_id = new.user_id and r.lifted_at is null and r.id <> new.id
                        and (r.ends_at is null or r.ends_at > now()));
  end if;
  return new;
end $$;
create trigger community_restrictions_account_status after update on community_restrictions
  for each row execute function account_status_follow_restriction();

-- ---------------------------------------------------------------------------
-- Analytics: aggregate counters only
-- ---------------------------------------------------------------------------
create table usage_counters (
  day date not null,
  metric text not null check (metric in ('devotional_view', 'presentation_open')),
  n bigint not null default 0,
  primary key (day, metric)
);
alter table usage_counters enable row level security;
revoke all on usage_counters from anon, authenticated;

alter table profiles add column last_active_on date;

create function record_usage(p_metric text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_metric not in ('devotional_view', 'presentation_open') then return; end if;
  insert into usage_counters (day, metric, n) values (current_date, p_metric, 1)
  on conflict (day, metric) do update set n = usage_counters.n + 1;
end $$;

create function touch_active() returns void
language sql security definer set search_path = public as $$
  update profiles set last_active_on = current_date where id = auth.uid() and last_active_on is distinct from current_date
$$;

-- Counts only. Nothing here is per person, nothing ranks anyone, and private prayers are not counted.
create function platform_metrics(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  days int := least(greatest(coalesce(p_days, 30), 7), 365);
  since timestamptz;
  result jsonb;
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  since := now() - make_interval(days => days);
  select jsonb_build_object(
    'days', days,
    'active_educators', jsonb_build_object(
      'day', (select count(*) from profiles where last_active_on = current_date),
      'week', (select count(*) from profiles where last_active_on > current_date - 7),
      'month', (select count(*) from profiles where last_active_on > current_date - 30)),
    'readership', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(u.n, 0)) order by d)
        from generate_series(current_date - (days - 1), current_date, interval '1 day') d
        left join usage_counters u on u.day = d::date and u.metric = 'devotional_view'), '[]'),
    'presentations', coalesce((select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(u.n, 0)) order by d)
        from generate_series(current_date - (days - 1), current_date, interval '1 day') d
        left join usage_counters u on u.day = d::date and u.metric = 'presentation_open'), '[]'),
    'contributions', jsonb_build_object(
      'by_kind', coalesce((select jsonb_object_agg(kind, n) from (
          select c.kind::text as kind, count(*) as n from community_contributions c
          where c.created_at >= since and c.visibility <> 'private' group by c.kind) k), '{}'),
      'replies', (select count(*) from contribution_replies where created_at >= since)),
    'groups', jsonb_build_object(
      'active', (select count(*) from community_groups where status = 'active'),
      'pending', (select count(*) from community_groups where status = 'pending'),
      'with_activity', (select count(distinct gid) from (
          select group_id as gid from group_posts where created_at >= since
          union select group_id from group_comments where created_at >= since) a),
      'posts', (select count(*) from group_posts where created_at >= since),
      'comments', (select count(*) from group_comments where created_at >= since)),
    'prayer_acknowledgements', (select count(*) from prayer_acknowledgements where created_at >= since),
    'schools', jsonb_build_object(
      'by_status', coalesce((select jsonb_object_agg(status, n) from (
          select s.status::text as status, count(*) as n from subscriptions s where s.owner_type = 'school' group by s.status) x), '{}'),
      'licensed_seats', coalesce((select sum(s.seats) from subscriptions s where s.owner_type = 'school' and subscription_grants(s)), 0)),
    'subscriptions', jsonb_build_object(
      'active_by_plan', coalesce((select jsonb_object_agg(plan_key, n) from (
          select s.plan_key, count(*) as n from subscriptions s where subscription_grants(s) group by s.plan_key) x), '{}'),
      'started', (select count(*) from subscriptions s where s.created_at >= since and s.status not in ('incomplete', 'incomplete_expired')),
      'trials_ended', (select count(*) from subscriptions s where s.trial_end is not null and s.trial_end < now() and s.trial_end >= since),
      'trials_converted', (select count(*) from subscriptions s
          where s.trial_end is not null and s.trial_end < now() and s.trial_end >= since
            and (s.status in ('active', 'past_due') or (s.ended_at is not null and s.ended_at > s.trial_end + interval '1 day'))),
      'retention_cohort', (select count(*) from subscriptions s where s.created_at < now() - interval '30 days'
          and s.status not in ('incomplete', 'incomplete_expired')),
      'retention_kept', (select count(*) from subscriptions s where s.created_at < now() - interval '30 days'
          and s.status not in ('incomplete', 'incomplete_expired') and subscription_grants(s))),
    'moderation', jsonb_build_object(
      'reports_by_reason', coalesce((select jsonb_object_agg(reason, n) from (
          select r.reason::text as reason, count(*) as n from contribution_reports r where r.created_at >= since group by r.reason) x), '{}'),
      'reports_by_status', coalesce((select jsonb_object_agg(status, n) from (
          select r.status, count(*) as n from contribution_reports r where r.created_at >= since group by r.status) x), '{}'),
      'urgent', (select count(*) from contribution_reports where urgent_at >= since),
      'open_now', (select count(*) from contribution_reports where status = 'open'),
      'median_hours_to_resolve', (select round((percentile_cont(0.5) within group
          (order by extract(epoch from (r.resolved_at - r.created_at)) / 3600))::numeric, 1)
          from contribution_reports r where r.resolved_at is not null and r.created_at >= since),
      'appeals_open', (select count(*) from moderation_appeals where status = 'open'),
      'restrictions_active', (select count(*) from community_restrictions
          where lifted_at is null and (ends_at is null or ends_at > now())))
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Contributors (credits) for devotionals
-- ---------------------------------------------------------------------------
create table contributors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  bio text not null default '' check (length(bio) <= 500),
  active boolean not null default true,
  created_by uuid references auth.users on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger contributors_updated before update on contributors for each row execute function set_updated_at();
create trigger audit_contributors after insert or update or delete on contributors
  for each row execute function audit_row_change('contributor', 'id');
alter table contributors enable row level security;
revoke all on contributors from anon, authenticated;
grant select, insert, update, delete on contributors to authenticated;
create policy contributors_editors on contributors for all to authenticated
  using (is_content_editor()) with check (is_content_editor());

create table devotional_contributors (
  devotional_id uuid not null references devotionals on delete cascade,
  contributor_id uuid not null references contributors on delete restrict,
  role text not null check (role in ('author', 'contributor', 'reviewer')),
  primary key (devotional_id, contributor_id, role)
);
create index devotional_contributors_by_contributor on devotional_contributors (contributor_id);
alter table devotional_contributors enable row level security;
revoke all on devotional_contributors from anon, authenticated;
grant select on devotional_contributors to authenticated;
create policy devotional_contributors_editors on devotional_contributors for select to authenticated
  using (is_content_editor());

-- p_items: [{"contributor_id": "...", "role": "author"|"contributor"|"reviewer"}]
create function set_devotional_credits(p_devotional uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if not is_content_editor() then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 then
    raise exception 'Too many contributors.' using errcode = '22023';
  end if;
  if not exists (select 1 from devotionals where id = p_devotional) then
    raise exception 'That devotional does not exist.' using errcode = 'P0002';
  end if;
  delete from devotional_contributors where devotional_id = p_devotional;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into devotional_contributors (devotional_id, contributor_id, role)
    values (p_devotional, (it ->> 'contributor_id')::uuid, it ->> 'role') on conflict do nothing;
  end loop;
  perform audit_record('devotional.credits', 'devotional', p_devotional::text, jsonb_build_object('items', p_items));
end $$;

create function devotional_credits(p_devotional uuid) returns table (contributor_id uuid, name text, bio text, role text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.bio, dc.role
  from devotional_contributors dc join contributors c on c.id = dc.contributor_id
  where dc.devotional_id = p_devotional and auth.uid() is not null
    and (devotional_is_live(p_devotional) or is_content_editor())
  order by case dc.role when 'author' then 0 when 'contributor' then 1 else 2 end, c.name
$$;

-- ---------------------------------------------------------------------------
-- Unpublish: published -> approved, with a reason. Readers lose access at once; the editorial
-- record and the discussion are kept, and it can be published again or archived.
-- ---------------------------------------------------------------------------
create or replace function devotional_transition_allowed(f devotional_status, t devotional_status) returns boolean
language sql immutable as $$
  select (f::text, t::text) in (
    ('draft', 'in_review'),
    ('in_review', 'draft'), ('in_review', 'approved'),
    ('approved', 'draft'), ('approved', 'scheduled'), ('approved', 'published'),
    ('scheduled', 'approved'), ('scheduled', 'published'),
    ('published', 'approved'), ('published', 'archived'),
    ('archived', 'draft')
  )
$$;

create or replace function _transition_devotional(
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
  if d.status = 'published' and p_to = 'approved' and btrim(coalesce(p_note, '')) = '' then
    raise exception 'say why it is being unpublished' using errcode = 'P0001';
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
  elsif p_to = 'approved' then -- unscheduling, or unpublishing
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

-- ---------------------------------------------------------------------------
-- Retention
-- ---------------------------------------------------------------------------
-- Run by a scheduled job (service role) or a platform administrator. It never deletes the fact that
-- something was moderated; it clears the quoted words and removes operational data that has expired.
create function retention_run() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_reports int; n_actions int; n_audit int; n_stripe int; n_usage int; n_rate int; result jsonb;
begin
  if auth.uid() is not null and not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update contribution_reports set snapshot = '[cleared after retention period]', snapshot_title = null, details = null
   where status <> 'open' and resolved_at < now() - make_interval(days => governance_int('retention_report_snapshot_days', 365))
     and snapshot <> '[cleared after retention period]';
  get diagnostics n_reports = row_count;
  update moderation_actions set snapshot = null
   where snapshot is not null and created_at < now() - make_interval(days => governance_int('retention_moderation_snapshot_days', 730));
  get diagnostics n_actions = row_count;
  delete from admin_audit_log where at < now() - make_interval(days => governance_int('retention_audit_days', 730));
  get diagnostics n_audit = row_count;
  delete from stripe_events where received_at < now() - make_interval(days => governance_int('retention_stripe_events_days', 400));
  get diagnostics n_stripe = row_count;
  delete from usage_counters where day < current_date - governance_int('retention_usage_days', 800);
  get diagnostics n_usage = row_count;
  delete from community_rate_events where created_at < now() - interval '2 days';
  get diagnostics n_rate = row_count;
  result := jsonb_build_object('report_snapshots_cleared', n_reports, 'moderation_snapshots_cleared', n_actions,
    'audit_rows_deleted', n_audit, 'stripe_events_deleted', n_stripe, 'usage_rows_deleted', n_usage, 'rate_events_deleted', n_rate);
  insert into admin_audit_log (actor_id, actor_roles, action, entity, detail)
  values (auth.uid(), '{}', 'retention.run', 'system', result);
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Grants: every new function is callable by signed-in users (each checks its own permission),
-- except internals, triggers and server-only jobs.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.oid not in (select oid from _pre_0007_fns)
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname not in ('audit_record', 'audit_row_change', 'account_status_follow_restriction',
                         'governance_int', 'governance_flag', 'retention_run') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
-- Replaced functions keep their grants; make sure they are not public.
revoke all on function can_post_publicly() from public, anon;
revoke all on function group_can_write(uuid) from public, anon;
revoke all on function can_view_contribution(community_contributions) from public, anon;
revoke all on function can_reply_to_contribution(uuid) from public, anon;
revoke all on function can_acknowledge_contribution(uuid) from public, anon;
revoke all on function can_comment_on_group_post(uuid) from public, anon;
revoke all on function create_group(text, text, text, text, text, group_privacy, uuid) from public, anon;
revoke all on function delete_group(uuid) from public, anon;
revoke all on function protect_last_group_owner() from public, anon, authenticated;
grant execute on function can_post_publicly(), group_can_write(uuid), can_view_contribution(community_contributions),
  can_reply_to_contribution(uuid), can_acknowledge_contribution(uuid), can_comment_on_group_post(uuid),
  create_group(text, text, text, text, text, group_privacy, uuid), delete_group(uuid) to authenticated;

-- The retention job is run with the service role or by a platform administrator from the admin page.
grant execute on function retention_run() to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function retention_run() to service_role;
    grant execute on function governance_int(text, int), governance_flag(text, boolean) to service_role;
  end if;
end $$;

drop table _pre_0007_fns;
