-- 0008: Security hardening found by the pre-launch audit (docs/QA-AUDIT.md).
--
--   H-01  Content screening (contact details, links, named students) ran only in server actions, so a
--         client calling the database API directly could skip it. It is now enforced by triggers.
--   H-02  The community is for adults, but nothing asked. Accepting the covenant now also records an explicit
--         adult (18+) confirmation, enforced in the database.
--
-- Functions created here are locked down at the end, as in earlier migrations.

create temp table _pre_0008_fns as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ---------------------------------------------------------------------------
-- H-01: screening in the database. Mirrors src/lib/community/screening.ts (kept in step by a parity test).
-- Heuristics, not a guarantee: they catch careless disclosure. Reporting, moderation and the covenant do the rest.
-- ---------------------------------------------------------------------------
create function screening_names_student(t text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  m text[];
  nm text;
  not_names text[] := array['council','body','government','ministry','life','union','leader','leaders','athlete','athletes',
    'teacher','teachers','who','that','which','in','at','from','with','and','or','but','the','this','these','those','of','to',
    'has','had','was','is','are','will','would','can','could','did','does','so','i'];
begin
  for m in
    select regexp_matches(
      t,
      '\y(my|our|a|the|one of my|one of our)\s+([[:alnum:]_-]+\s+){0,3}(student|pupil|child|kid|son|daughter|boy|girl)s?(\s+named|\s+called|,)?\s+([A-Za-z][a-z]+)\y',
      'gi')
  loop
    nm := m[5];
    if nm ~ '^[A-Z]' and not (lower(nm) = any (not_names)) then return true; end if;
  end loop;
  return false;
end $$;

create function screen_text(t text, is_public boolean) returns void
language plpgsql immutable set search_path = public as $$
begin
  if t is null or t = '' then return; end if;
  if is_public then
    if t ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}' then
      raise exception 'Please remove the email address. Public discussion should not include contact details.' using errcode = '22023';
    end if;
    if t ~ '(\+?[0-9][[:space:]().-]?){7,}' then
      raise exception 'Please remove the phone number. Public discussion should not include contact details.' using errcode = '22023';
    end if;
    if t ~* '(\y(https?://|www\.)[^[:space:]]+)|(\y[a-z0-9-]+\.(com|org|net|edu|io|co|info|ly|me)\y)' then
      raise exception 'Links are not allowed in public discussion. Describe the resource and its title instead.' using errcode = '22023';
    end if;
  end if;
  if screening_names_student(t) then
    raise exception 'This seems to name a student. Please describe the situation without a name, or anything else that could identify them.' using errcode = '22023';
  end if;
end $$;

create function screen_public_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform screen_text(coalesce(new.title, '') || ' ' || coalesce(new.body, ''), true);
  return new;
end $$;

create function screen_public_reply_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform screen_text(new.body, true);
  return new;
end $$;

create function screen_group_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform screen_text(coalesce(new.title, '') || ' ' || coalesce(new.body, ''), false);
  return new;
end $$;

create function screen_group_comment_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform screen_text(new.body, false);
  return new;
end $$;

create trigger contributions_screen before insert or update of title, body on community_contributions
  for each row execute function screen_public_row();
create trigger replies_screen before insert or update of body on contribution_replies
  for each row execute function screen_public_reply_row();
create trigger group_posts_screen before insert or update of title, body on group_posts
  for each row execute function screen_group_row();
create trigger group_comments_screen before insert or update of body on group_comments
  for each row execute function screen_group_comment_row();

-- ---------------------------------------------------------------------------
-- H-02: adult confirmation, recorded with the covenant acceptance.
-- ---------------------------------------------------------------------------
alter table covenant_acceptances add column adult_confirmed_at timestamptz;

create or replace function covenant_accepted() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    not governance_flag('covenant_required', true)
    or exists (select 1 from covenant_acceptances a
               where a.user_id = auth.uid()
                 and a.version = governance_int('covenant_version', 1)
                 and a.adult_confirmed_at is not null), false)
$$;

drop function accept_covenant(int);
create function accept_covenant(p_version int, p_adult boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not community_entitled() then raise exception 'Verify your email to join the community.' using errcode = '42501'; end if;
  if p_version is distinct from governance_int('covenant_version', 1) then
    raise exception 'The covenant has been updated. Please read it again.' using errcode = 'P0001';
  end if;
  if p_adult is distinct from true then
    raise exception 'Please confirm that you are an adult (18 or older). This community is for educators and other adults.' using errcode = '22023';
  end if;
  insert into covenant_acceptances (user_id, version, adult_confirmed_at) values (auth.uid(), p_version, now())
  on conflict (user_id, version) do update set adult_confirmed_at = coalesce(covenant_acceptances.adult_confirmed_at, now());
end $$;

-- ---------------------------------------------------------------------------
-- H-03: people must always be able to see and delete their OWN words.
-- Until now the "select" policy hid a contribution as soon as its devotional stopped being live (unpublished,
-- archived, or locked behind a plan), and row-level security applies that policy to the WHERE clause of a
-- delete as well, so the author silently could not delete or edit it. A prayer could only be withdrawn by deleting
-- the whole account. Authors can now always see and delete their own rows; editing still needs a live devotional.
-- ---------------------------------------------------------------------------
create policy contributions_select_own on community_contributions for select to authenticated
  using (user_id = auth.uid());
create policy replies_select_own on contribution_replies for select to authenticated
  using (user_id = auth.uid());

drop policy contributions_update on community_contributions;
create policy contributions_update on community_contributions for update to authenticated
  using (user_id = auth.uid() and moderation = 'visible' and devotional_is_live(devotional_id))
  with check (user_id = auth.uid() and moderation = 'visible' and can_post_publicly());
drop policy replies_update on contribution_replies;
create policy replies_update on contribution_replies for update to authenticated
  using (user_id = auth.uid() and moderation = 'visible' and can_view_reply(contribution_replies))
  with check (user_id = auth.uid() and moderation = 'visible' and can_post_publicly());

-- ---------------------------------------------------------------------------
-- M-04: direct messaging cannot be switched on from the application in this release.
-- The data model exists and stays dormant; enabling it needs a deliberate later migration after safety design
-- (blocking, reporting, rate limits and moderation of one-to-one messages).
-- ---------------------------------------------------------------------------
create or replace function set_community_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from community_settings where key = k) then
    raise exception 'unknown setting' using errcode = 'P0002';
  end if;
  if k = 'direct_messages_enabled' and v is distinct from 'false'::jsonb then
    raise exception 'Direct messaging is not available in this release.' using errcode = 'P0001';
  end if;
  update community_settings set value = v, updated_by = auth.uid(), updated_at = now() where key = k;
end $$;
revoke all on function set_community_setting(text, jsonb) from public, anon;
grant execute on function set_community_setting(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- M-03: indexes for foreign keys on tables that grow with use. Without them, deleting a group, a devotional or an
-- account scans every child table, and several row-level-security lookups filter on these columns.
-- (Staff-attribution columns such as created_by or approved_by are on small tables and are deliberately left alone.)
-- ---------------------------------------------------------------------------
create index if not exists group_comments_by_group on group_comments (group_id);
create index if not exists group_comments_by_parent on group_comments (parent_id) where parent_id is not null;
create index if not exists group_posts_by_devotional on group_posts (devotional_id) where devotional_id is not null;
create index if not exists community_groups_by_school on community_groups (school_id) where school_id is not null;
create index if not exists community_groups_by_creator on community_groups (created_by);
create index if not exists group_join_requests_by_user on group_join_requests (user_id);
create index if not exists group_invitations_by_inviter on group_invitations (invited_by);
create index if not exists contribution_reports_by_target_author on contribution_reports (target_author_id) where target_author_id is not null;
create index if not exists moderation_actions_by_report on moderation_actions (report_id) where report_id is not null;
create index if not exists moderation_actions_by_actor on moderation_actions (actor_id);
create index if not exists moderation_actions_by_restriction on moderation_actions (restriction_id) where restriction_id is not null;
create index if not exists moderation_appeals_by_user on moderation_appeals (user_id);
create index if not exists devotional_user_state_by_devotional on devotional_user_state (devotional_id);
create index if not exists user_collection_items_by_devotional on user_collection_items (devotional_id);
create index if not exists school_assignments_by_devotional on school_assignments (devotional_id);
create index if not exists admin_audit_log_by_actor on admin_audit_log (actor_id);
create index if not exists direct_messages_by_sender on direct_messages (sender_id);
create index if not exists direct_conversations_by_user_b on direct_conversations (user_b);
create index if not exists school_invitations_by_inviter on school_invitations (invited_by);
create index if not exists devotional_events_by_actor on devotional_events (actor_id);
create index if not exists devotional_revisions_by_editor on devotional_revisions (editor_id);

-- ---------------------------------------------------------------------------
-- Lock down what this migration created: only accept_covenant is callable by signed-in people.
-- ---------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.oid not in (select oid from _pre_0008_fns)
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname = 'accept_covenant' then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
revoke all on function covenant_accepted() from public, anon;
grant execute on function covenant_accepted() to authenticated;

drop table _pre_0008_fns;
