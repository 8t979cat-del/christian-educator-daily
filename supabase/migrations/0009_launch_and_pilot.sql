-- 0009: Controlled launch and founding-school pilot.
--
--   A. Feature flags for every interactive feature, ALL CLOSED by default, enforced by the database.
--   B. A safety gate: interactive community features cannot be switched on until a human moderator exists,
--      the covenant is required, and a platform administrator has recorded each safety sign-off.
--   C. Launch readiness reports for community safety and for content.
--   D. The founding-school pilot: programs, prospect schools, controlled enrollment by access code,
--      pilot start and end dates (a pilot grants a time-boxed school license, never a fake subscription),
--      subscription interest and conversion, and aggregate-only pilot metrics.
--   E. Feedback: a short survey, bug reports and feature requests, with a triage workflow.
--
-- Nothing here invites anyone, charges anyone, or assumes any school has agreed.

create temp table _pre_0009_fns as select oid from pg_proc where pronamespace = 'public'::regnamespace;

-- ===========================================================================
-- A. Feature flags (all closed until deliberately opened)
-- ===========================================================================
insert into community_settings (key, value) values
  ('prayer_contributions_enabled', 'false'),
  ('prayer_acknowledgements_enabled', 'false'),
  ('group_creation_enabled', 'false'),
  ('group_posting_enabled', 'false'),
  ('group_invitations_enabled', 'false'),
  ('school_administration_enabled', 'false'),
  -- Starting a NEW paid checkout. Existing subscriptions, webhooks and complimentary access are never affected.
  ('paid_subscriptions_enabled', 'false');
update community_settings set value = 'false' where key in ('public_discussions_enabled', 'groups_enabled');

-- Each gate is a trigger on the table that holds the thing, so the application, the API and direct SQL all meet it.
-- Contexts with no signed-in person (migrations, seeds, the service role) are not gated.
create function flag_gate(p_flag text, p_message text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not community_flag(p_flag) then
    raise exception '%', p_message using errcode = 'P0001';
  end if;
end $$;

create function gate_prayer_contribution() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'prayer' then perform flag_gate('prayer_contributions_enabled', 'Sharing prayers is paused right now.'); end if;
  return new;
end $$;
create trigger contributions_gate_prayer before insert on community_contributions
  for each row execute function gate_prayer_contribution();

create function gate_group_prayer_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'prayer' then perform flag_gate('prayer_contributions_enabled', 'Sharing prayers is paused right now.'); end if;
  perform flag_gate('group_posting_enabled', 'Posting in groups is paused right now.');
  return new;
end $$;
create trigger group_posts_gate before insert or update of title, body on group_posts
  for each row execute function gate_group_prayer_post();

create function gate_group_comment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform flag_gate('group_posting_enabled', 'Commenting in groups is paused right now.');
  return new;
end $$;
create trigger group_comments_gate before insert or update of body on group_comments
  for each row execute function gate_group_comment();

create function gate_prayer_ack() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform flag_gate('prayer_acknowledgements_enabled', 'Praying with others is paused right now.');
  return new;
end $$;
create trigger prayer_ack_gate before insert on prayer_acknowledgements
  for each row execute function gate_prayer_ack();

create function gate_group_creation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform flag_gate('group_creation_enabled', 'Creating groups is paused right now.');
  return new;
end $$;
create trigger community_groups_gate before insert on community_groups
  for each row execute function gate_group_creation();

create function gate_group_invitation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform flag_gate('group_invitations_enabled', 'Group invitations are paused right now.');
  return new;
end $$;
create trigger group_invitations_gate before insert on group_invitations
  for each row execute function gate_group_invitation();

-- School administration: creating schools, inviting people, assigning seats. Platform administrators (who run
-- the pilot) and the pilot's own enrollment are not blocked, so a pilot can be run with self-service closed.
create function gate_school_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('app.pilot_enrollment', true) = 'on' then return new; end if;
  if has_platform_role('{platform_admin}') then return new; end if;
  if not community_flag('school_administration_enabled') then
    raise exception 'School administration is paused right now.' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger schools_gate before insert on schools for each row execute function gate_school_admin();
create trigger school_invitations_gate before insert on school_invitations for each row execute function gate_school_admin();
create trigger school_seats_gate before insert on school_seats for each row execute function gate_school_admin();

-- ===========================================================================
-- B/C. Launch sign-offs, the safety gate, and readiness reports
-- ===========================================================================
create table launch_attestations (
  key text primary key check (key in (
    'covenant_reviewed', 'moderation_tested', 'escalation_procedure', 'response_expectations',
    'privacy_guidance', 'suspension_procedure', 'legal_documents', 'prayer_prompts_reviewed')),
  attested_by uuid references auth.users on delete set null,
  attested_at timestamptz not null default now(),
  note text not null check (length(btrim(note)) between 10 and 600)
);
alter table launch_attestations enable row level security;
revoke all on launch_attestations from anon, authenticated;

create function attest_launch(p_key text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'Say what was done, who did it and when (at least a sentence).' using errcode = '22023';
  end if;
  insert into launch_attestations (key, attested_by, note) values (p_key, auth.uid(), btrim(p_note))
  on conflict (key) do update set attested_by = auth.uid(), attested_at = now(), note = btrim(p_note);
  perform audit_record('launch.attest', 'launch_attestation', p_key, jsonb_build_object('key', p_key));
exception when check_violation then
  raise exception 'Unknown sign-off.' using errcode = '22023';
end $$;

create function retract_launch_attestation(p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  delete from launch_attestations where key = p_key;
  perform audit_record('launch.retract', 'launch_attestation', p_key, '{}');
end $$;

-- What must be true before interactive features may open. Automatic checks are read from the database;
-- sign-offs are human statements, recorded with who and when.
create function community_readiness_rows() returns table (key text, label text, kind text, ok boolean, detail text)
language sql stable security definer set search_path = public as $$
  select * from (
    select 'human_moderator'::text, 'At least one designated human moderator'::text, 'automatic'::text,
           (select count(*) from platform_roles where role = 'moderator') >= 1,
           (select count(*)::text from platform_roles where role = 'moderator') || ' designated moderator(s). Two or more is better, so there is cover for absence.'
    union all
    select 'covenant_required', 'The community covenant must be accepted before a first contribution', 'automatic',
           governance_flag('covenant_required', true), case when governance_flag('covenant_required', true) then 'On.' else 'Off: turn it on in governance settings.' end
    union all
    select 'group_review', 'New groups wait for review before they open', 'advisory',
           community_flag('group_requires_approval'), case when community_flag('group_requires_approval') then 'On.' else 'Off. Recommended for a pilot.' end
    union all
    select a.key, a.label, 'signoff',
           exists (select 1 from launch_attestations l where l.key = a.key),
           coalesce((select to_char(l.attested_at, 'YYYY-MM-DD') || ': ' || l.note from launch_attestations l where l.key = a.key), 'Not signed off yet.')
    from (values
      ('covenant_reviewed', 'The community covenant has been read and approved by the people responsible for the ministry'),
      ('moderation_tested', 'Moderation tools were tested in a rehearsal (hide, restore, restrict, escalate, appeal)'),
      ('escalation_procedure', 'A written safety-escalation procedure exists and the people named in it have read it'),
      ('response_expectations', 'Moderation response expectations are defined and published'),
      ('privacy_guidance', 'Privacy guidance for educators is published'),
      ('suspension_procedure', 'The account suspension and appeal procedure has been reviewed'),
      ('legal_documents', 'Terms of Service and Privacy Notice are published after review by counsel')
    ) as a(key, label)
  ) r(key, label, kind, ok, detail)
$$;

-- Internal: may interactive features open?
create function community_ready() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_and(ok), false) from community_readiness_rows() where kind in ('automatic', 'signoff')
$$;

create function community_readiness() returns table (key text, label text, kind text, ok boolean, detail text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin,moderator}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  return query select * from community_readiness_rows();
end $$;

-- Opening an interactive feature needs the gate. Closing one is always allowed, so a problem can be paused at once.
create or replace function set_community_setting(k text, v jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  interactive text[] := array['public_discussions_enabled', 'prayer_contributions_enabled', 'prayer_acknowledgements_enabled',
    'groups_enabled', 'group_creation_enabled', 'group_posting_enabled', 'group_invitations_enabled'];
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
  if k = any (interactive) and v is not distinct from 'true'::jsonb and not community_ready() then
    raise exception 'Community safety readiness is incomplete. Complete every item on the launch page first.' using errcode = 'P0001';
  end if;
  update community_settings set value = v, updated_by = auth.uid(), updated_at = now() where key = k;
  perform audit_record('setting.' || k, 'community_setting', k, jsonb_build_object('value', v));
end $$;

create function content_readiness() returns table (key text, label text, blocking boolean, ok boolean, detail text)
language plpgsql stable security definer set search_path = public as $$
declare horizon int := 14;
begin
  if not has_platform_role('{platform_admin,content_editor}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
  return query
  with upcoming as (
    select d.* from devotionals d
    where d.status in ('published', 'scheduled') and d.devotional_date between current_date and current_date + (horizon - 1)),
  live as (select d.* from devotionals d where d.status in ('published', 'scheduled'))
  select 'upcoming_scheduled'::text, ('Devotionals approved and scheduled for each of the next ' || horizon || ' days')::text, true,
         (select count(distinct devotional_date) from upcoming) >= horizon,
         (select count(distinct devotional_date) from upcoming)::text || ' of ' || horizon || ' days covered. Only reviewed, approved devotionals count.'
  union all
  select 'in_review_queue', 'Devotionals still waiting for review or approval', false, true,
         (select count(*) from devotionals where status in ('draft', 'in_review', 'approved'))::text || ' not yet scheduled.'
  union all
  select 'authors_credited', 'Every scheduled or published devotional credits its author', true,
         not exists (select 1 from live where btrim(author_name) = ''),
         (select count(*) from live where btrim(author_name) = '')::text || ' without an author credit.'
  union all
  select 'grade_levels', 'Every scheduled or published devotional is labelled with grade levels', false,
         not exists (select 1 from live where cardinality(grade_levels) = 0),
         (select count(*) from live where cardinality(grade_levels) = 0)::text || ' without a grade-level label.'
  union all
  select 'translations_verified', 'Every Bible translation used has a licence a person has verified', true,
         not exists (select 1 from bible_translations t where t.code in (select translation_code from live) and t.text_allowed and t.license_verified_at is null),
         coalesce((select string_agg(t.code, ', ') from bible_translations t
                   where t.code in (select translation_code from live) and t.text_allowed and t.license_verified_at is null) || ' used but not verified.',
                  'All translations in use have a recorded licence check.')
  union all
  select 'discussion_only_approved', 'Discussions attach only to live, approved devotionals', true, true,
         'Enforced by the database: a contribution to anything else is refused.'
  union all
  select 'prayer_prompts_reviewed', 'Prayer prompts and closing prayers have been reviewed for appropriateness', true,
         exists (select 1 from launch_attestations where launch_attestations.key = 'prayer_prompts_reviewed'),
         coalesce((select to_char(l.attested_at, 'YYYY-MM-DD') || ': ' || l.note from launch_attestations l where l.key = 'prayer_prompts_reviewed'), 'Not signed off yet.');
end $$;

-- ===========================================================================
-- D. Founding-school pilot
-- ===========================================================================
create table pilot_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 2 and 120),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'closed')),
  default_seat_limit int not null default 30 check (default_seat_limit between 1 and 500),
  conversion_note text not null default '' check (length(conversion_note) <= 1000),
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on > starts_on and ends_on <= starts_on + 366)
);

-- A school is a PROSPECT until a person records that it agreed, and how. Nothing assumes agreement.
create table pilot_schools (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilot_programs on delete cascade,
  school_id uuid references schools on delete set null,
  school_name text not null check (length(btrim(school_name)) between 2 and 120),
  contact_name text not null default '' check (length(contact_name) <= 120),
  stage text not null default 'prospect' check (stage in ('prospect', 'invited', 'agreed', 'declined', 'active', 'completed')),
  agreed_at timestamptz,
  agreed_note text,
  seat_limit int not null check (seat_limit between 1 and 500),
  conversion_stage text not null default 'none' check (conversion_stage in ('none', 'interested', 'proposal_sent', 'converted', 'declined')),
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (pilot_id, school_name),
  check (stage not in ('agreed', 'active', 'completed') or (agreed_at is not null and length(btrim(coalesce(agreed_note, ''))) >= 10))
);
create index pilot_schools_by_pilot on pilot_schools (pilot_id);
create index pilot_schools_by_school on pilot_schools (school_id) where school_id is not null;

create table pilot_access_codes (
  id uuid primary key default gen_random_uuid(),
  pilot_school_id uuid not null references pilot_schools on delete cascade,
  code_hash bytea not null unique,
  hint text not null,
  label text not null default '' check (length(label) <= 80),
  grants text not null default 'faculty' check (grants in ('faculty', 'owner')),
  max_uses int not null check (max_uses between 1 and 500),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check (grants <> 'owner' or max_uses = 1),
  check (uses <= max_uses)
);
create index pilot_access_codes_by_school on pilot_access_codes (pilot_school_id);

create table pilot_redemptions (
  code_id uuid not null references pilot_access_codes on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code_id, user_id)
);
create index pilot_redemptions_by_user on pilot_redemptions (user_id);

create table pilot_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  ok boolean not null,
  at timestamptz not null default now()
);
create index pilot_code_attempts_by_user on pilot_code_attempts (user_id, at desc);

create table pilot_interest (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references pilot_programs on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  school_id uuid references schools on delete set null,
  kind text not null check (kind in ('individual_plus', 'school_license', 'not_now', 'need_more_info')),
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, user_id)
);
create index pilot_interest_by_user on pilot_interest (user_id);
create index pilot_interest_by_school on pilot_interest (school_id) where school_id is not null;

-- Counts per school and day, only for schools in a pilot. Never per person.
create table usage_by_school (
  day date not null,
  school_id uuid not null references schools on delete cascade,
  metric text not null check (metric in ('devotional_view', 'presentation_open')),
  n bigint not null default 0,
  primary key (day, school_id, metric)
);
create index usage_by_school_by_school on usage_by_school (school_id);

alter table pilot_programs enable row level security;
alter table pilot_schools enable row level security;
alter table pilot_access_codes enable row level security;
alter table pilot_redemptions enable row level security;
alter table pilot_code_attempts enable row level security;
alter table pilot_interest enable row level security;
alter table usage_by_school enable row level security;
revoke all on pilot_programs, pilot_schools, pilot_access_codes, pilot_redemptions, pilot_code_attempts, pilot_interest, usage_by_school
  from anon, authenticated;
-- Everything is reached through functions that check who is asking.

create function pilot_admin_only() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not has_platform_role('{platform_admin}') then raise exception 'You cannot do that.' using errcode = '42501'; end if;
end $$;

create function pilot_create(p_name text, p_starts_on date, p_ends_on date, p_seat_limit int default 30) returns uuid
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  perform pilot_admin_only();
  insert into pilot_programs (name, starts_on, ends_on, default_seat_limit, created_by)
  values (btrim(p_name), p_starts_on, p_ends_on, coalesce(p_seat_limit, 30), auth.uid()) returning id into pid;
  perform audit_record('pilot.create', 'pilot', pid::text, jsonb_build_object('name', btrim(p_name)));
  return pid;
exception when check_violation then
  raise exception 'Check the name, the dates (it must end after it starts and run at most a year) and the seat limit.' using errcode = '22023';
end $$;

create function pilot_set_status(p_pilot uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  if p_status not in ('planning', 'active', 'closed') then raise exception 'Unknown status.' using errcode = '22023'; end if;
  update pilot_programs set status = p_status where id = p_pilot;
  if not found then raise exception 'Pilot not found.' using errcode = 'P0002'; end if;
  if p_status = 'closed' then
    update pilot_schools set stage = 'completed' where pilot_id = p_pilot and stage in ('agreed', 'active');
  end if;
  perform audit_record('pilot.status', 'pilot', p_pilot::text, jsonb_build_object('status', p_status));
end $$;

create function pilot_add_school(p_pilot uuid, p_name text, p_contact text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid; seats int;
begin
  perform pilot_admin_only();
  select default_seat_limit into seats from pilot_programs where id = p_pilot;
  if not found then raise exception 'Pilot not found.' using errcode = 'P0002'; end if;
  insert into pilot_schools (pilot_id, school_name, contact_name, seat_limit)
  values (p_pilot, btrim(p_name), btrim(coalesce(p_contact, '')), seats) returning id into sid;
  perform audit_record('pilot.school_add', 'pilot_school', sid::text, '{}');
  return sid;
exception when unique_violation then
  raise exception 'That school is already in this pilot.' using errcode = '22023';
when check_violation then
  raise exception 'Check the school name.' using errcode = '22023';
end $$;

-- Moving a school forward is a recorded human decision. "Agreed" needs a note saying how it agreed.
create function pilot_set_school_stage(p_pilot_school uuid, p_stage text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare cur pilot_schools;
begin
  perform pilot_admin_only();
  select * into cur from pilot_schools where id = p_pilot_school;
  if not found then raise exception 'School not found.' using errcode = 'P0002'; end if;
  if p_stage not in ('prospect', 'invited', 'agreed', 'declined') then
    raise exception 'Choose prospect, invited, agreed or declined. Active and completed follow on their own.' using errcode = '22023';
  end if;
  if p_stage = 'agreed' then
    if length(btrim(coalesce(p_note, ''))) < 10 then
      raise exception 'Record how the school agreed (for example: signed pilot letter received on a date, from whom).' using errcode = '22023';
    end if;
    update pilot_schools set stage = case when cur.stage = 'active' then 'active' else 'agreed' end,
      agreed_at = coalesce(cur.agreed_at, now()), agreed_note = btrim(p_note) where id = p_pilot_school;
  else
    if cur.stage in ('agreed', 'active', 'completed') then
      update pilot_schools set stage = p_stage, agreed_at = null, agreed_note = null where id = p_pilot_school;
    else
      update pilot_schools set stage = p_stage where id = p_pilot_school;
    end if;
    update pilot_access_codes set revoked_at = coalesce(revoked_at, now()) where pilot_school_id = p_pilot_school and p_stage in ('declined', 'prospect');
  end if;
  perform audit_record('pilot.school_stage', 'pilot_school', p_pilot_school::text, jsonb_build_object('stage', p_stage));
end $$;

create function pilot_set_school_seats(p_pilot_school uuid, p_seats int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  update pilot_schools set seat_limit = p_seats where id = p_pilot_school;
  if not found then raise exception 'School not found.' using errcode = 'P0002'; end if;
exception when check_violation then
  raise exception 'Seats must be between 1 and 500.' using errcode = '22023';
end $$;

create function pilot_set_conversion(p_pilot_school uuid, p_stage text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  if p_stage not in ('none', 'interested', 'proposal_sent', 'converted', 'declined') then raise exception 'Unknown stage.' using errcode = '22023'; end if;
  update pilot_schools set conversion_stage = p_stage, notes = left(btrim(coalesce(p_note, notes)), 1000) where id = p_pilot_school;
  if not found then raise exception 'School not found.' using errcode = 'P0002'; end if;
  perform audit_record('pilot.conversion', 'pilot_school', p_pilot_school::text, jsonb_build_object('stage', p_stage));
end $$;

-- Create the school record for an AGREED prospect. It has no members until someone redeems an owner code.
create function pilot_create_school(p_pilot_school uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare cur pilot_schools; sid uuid; base text;
begin
  perform pilot_admin_only();
  select * into cur from pilot_schools where id = p_pilot_school;
  if not found then raise exception 'School not found.' using errcode = 'P0002'; end if;
  if cur.stage not in ('agreed', 'active') then
    raise exception 'Record the school''s agreement first. A school is never created on assumption.' using errcode = 'P0001';
  end if;
  if cur.school_id is not null then return cur.school_id; end if;
  base := trim(both '-' from regexp_replace(lower(cur.school_name), '[^a-z0-9]+', '-', 'g'));
  if base = '' then base := 'school'; end if;
  insert into schools (name, slug) values (cur.school_name, left(base, 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  returning id into sid;
  update pilot_schools set school_id = sid where id = p_pilot_school;
  perform audit_record('pilot.school_create', 'pilot_school', p_pilot_school::text, jsonb_build_object('school', sid), sid);
  return sid;
end $$;

-- Codes: 12 characters from an alphabet without look-alikes, stored only as a hash, shown once, with attempt limits.
create function pilot_new_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea := sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8'));
  out text := '';
  i int;
begin
  for i in 0..11 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 31) + 1, 1);
    if i in (3, 7) then out := out || '-'; end if;
  end loop;
  return out;
end $$;

create function pilot_code_hash(p_code text) returns bytea
language sql immutable set search_path = public as $$
  select sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8'))
$$;

create function pilot_create_code(p_pilot_school uuid, p_grants text, p_max_uses int, p_expires_at timestamptz, p_label text default '')
returns text
language plpgsql security definer set search_path = public as $$
declare cur pilot_schools; code text; pp pilot_programs;
begin
  perform pilot_admin_only();
  select * into cur from pilot_schools where id = p_pilot_school;
  if not found then raise exception 'School not found.' using errcode = 'P0002'; end if;
  if cur.stage not in ('agreed', 'active') or cur.school_id is null then
    raise exception 'Codes are made only for a school that has agreed and whose school record exists.' using errcode = 'P0001';
  end if;
  select * into pp from pilot_programs where id = cur.pilot_id;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > (pp.ends_on + 1)::timestamptz then
    raise exception 'A code must expire in the future and no later than the end of the pilot.' using errcode = '22023';
  end if;
  code := pilot_new_code();
  insert into pilot_access_codes (pilot_school_id, code_hash, hint, label, grants, max_uses, expires_at, created_by)
  values (p_pilot_school, pilot_code_hash(code), right(replace(code, '-', ''), 4), left(btrim(coalesce(p_label, '')), 80),
          p_grants, p_max_uses, p_expires_at, auth.uid());
  perform audit_record('pilot.code_create', 'pilot_school', p_pilot_school::text, jsonb_build_object('grants', p_grants, 'max_uses', p_max_uses), cur.school_id);
  return code;
exception when check_violation then
  raise exception 'Check the options: an owner code is single-use, and uses must be between 1 and 500.' using errcode = '22023';
end $$;

create function pilot_revoke_code(p_code uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  update pilot_access_codes set revoked_at = coalesce(revoked_at, now()) where id = p_code;
  if not found then raise exception 'Code not found.' using errcode = 'P0002'; end if;
  perform audit_record('pilot.code_revoke', 'pilot_code', p_code::text, '{}');
end $$;

create function pilot_list_codes(p_pilot_school uuid)
returns table (id uuid, hint text, label text, grants text, max_uses int, uses int, expires_at timestamptz, revoked_at timestamptz, usable boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  return query select c.id, c.hint, c.label, c.grants, c.max_uses, c.uses, c.expires_at, c.revoked_at,
                      (c.revoked_at is null and c.expires_at > now() and c.uses < c.max_uses)
                 from pilot_access_codes c where c.pilot_school_id = p_pilot_school order by c.created_at desc;
end $$;

-- The school's license while a pilot runs: a time-boxed School License with the pilot's seat limit.
-- It ends on the pilot's last day by date alone (no job), and a paying subscription wins a tie.
create or replace function school_license_raw(sid uuid)
returns table (plan_key text, seats int, status subscription_status, current_period_end timestamptz, cancel_at_period_end boolean)
language sql stable security definer set search_path = public as $$
  select x.plan_key, x.seats, x.status, x.current_period_end, x.cancel_at_period_end
  from (
    select s.plan_key, s.seats, s.status, s.current_period_end, s.cancel_at_period_end, 0 as src, s.created_at
    from subscriptions s
    where s.school_id = sid and subscription_grants(s)
    union all
    select 'school'::text, ps.seat_limit, 'active'::subscription_status, (pp.ends_on + 1)::timestamptz, true, 1, ps.created_at
    from pilot_schools ps join pilot_programs pp on pp.id = ps.pilot_id
    where ps.school_id = sid and ps.stage in ('agreed', 'active') and pp.status = 'active'
      and current_date between pp.starts_on and pp.ends_on
  ) x
  order by x.seats desc, x.src, x.created_at
  limit 1
$$;

create function redeem_pilot_code(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  c pilot_access_codes;
  ps pilot_schools;
  pp pilot_programs;
  failures int;
  new_role school_role;
  held int;
  gave_seat boolean := false;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if caller_verified_email() is null then raise exception 'Verify your email first.' using errcode = '42501'; end if;
  delete from pilot_code_attempts where at < now() - interval '1 day';
  select count(*) into failures from pilot_code_attempts where user_id = uid and not ok and at > now() - interval '1 hour';
  -- Failures RETURN a result instead of raising, because raising would roll back the attempt record and the limit would never count.
  if failures >= 8 then return jsonb_build_object('ok', false, 'reason', 'throttled'); end if;

  select * into c from pilot_access_codes where code_hash = pilot_code_hash(p_code);
  if found then
    select * into ps from pilot_schools where id = c.pilot_school_id;
    select * into pp from pilot_programs where id = ps.pilot_id;
  end if;
  if not found or c.revoked_at is not null or c.expires_at <= now()
     or ps.stage not in ('agreed', 'active') or ps.school_id is null
     or pp.status <> 'active' or current_date < pp.starts_on or current_date > pp.ends_on then
    insert into pilot_code_attempts (user_id, ok) values (uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  if exists (select 1 from pilot_redemptions where code_id = c.id and user_id = uid) then
    insert into pilot_code_attempts (user_id, ok) values (uid, true);
    return jsonb_build_object('ok', true, 'school_id', ps.school_id, 'school_name', ps.school_name, 'pilot_name', pp.name, 'ends_on', pp.ends_on, 'already', true);
  end if;
  if c.uses >= c.max_uses then
    insert into pilot_code_attempts (user_id, ok) values (uid, false);
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  perform set_config('app.pilot_enrollment', 'on', true);
  if c.grants = 'owner' and not exists (select 1 from school_memberships where school_id = ps.school_id and role = 'owner' and status = 'active') then
    new_role := 'owner';
  elsif c.grants = 'owner' then
    new_role := 'admin';
  else
    new_role := 'faculty';
  end if;
  insert into school_memberships (school_id, user_id, role) values (ps.school_id, uid, new_role)
  on conflict (school_id, user_id) do update set status = 'active';
  select count(*) into held from school_seats where school_id = ps.school_id;
  if held < ps.seat_limit then
    insert into school_seats (school_id, user_id, assigned_by) values (ps.school_id, uid, uid) on conflict do nothing;
    gave_seat := true;
  end if;
  insert into pilot_redemptions (code_id, user_id) values (c.id, uid);
  update pilot_access_codes set uses = uses + 1 where id = c.id;
  update pilot_schools set stage = 'active' where id = ps.id and stage = 'agreed';
  insert into pilot_code_attempts (user_id, ok) values (uid, true);
  perform set_config('app.pilot_enrollment', 'off', true);
  return jsonb_build_object('ok', true, 'school_id', ps.school_id, 'school_name', ps.school_name, 'pilot_name', pp.name,
                            'ends_on', pp.ends_on, 'role', new_role, 'seat', gave_seat, 'already', false);
end $$;

-- The caller's pilot, if any: what runs, until when, and what they have said about continuing.
create function my_pilot() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) from (
    select pp.id as pilot_id, pp.name as pilot_name, pp.starts_on, pp.ends_on, pp.status,
           (pp.ends_on - current_date) as days_left, ps.school_id, ps.school_name, m.role::text as role,
           (select i.kind from pilot_interest i where i.pilot_id = pp.id and i.user_id = auth.uid()) as interest,
           pp.conversion_note
    from school_memberships m
    join pilot_schools ps on ps.school_id = m.school_id and ps.stage in ('agreed', 'active', 'completed')
    join pilot_programs pp on pp.id = ps.pilot_id and pp.status in ('active', 'closed')
    where m.user_id = auth.uid() and m.status = 'active'
    order by pp.ends_on desc
    limit 1) r
$$;

create function express_pilot_interest(p_kind text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mine jsonb := my_pilot(); sid uuid; pid uuid;
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if mine is null then raise exception 'You are not part of a pilot.' using errcode = 'P0001'; end if;
  if p_kind not in ('individual_plus', 'school_license', 'not_now', 'need_more_info') then
    raise exception 'Unknown choice.' using errcode = '22023';
  end if;
  pid := (mine ->> 'pilot_id')::uuid;
  sid := (mine ->> 'school_id')::uuid;
  if p_kind = 'school_license' and not coalesce(has_school_role(sid, '{owner,admin}'), false) then
    raise exception 'A school license is chosen by a school owner or administrator.' using errcode = '42501';
  end if;
  perform screen_text(coalesce(p_note, ''), false);
  insert into pilot_interest (pilot_id, user_id, school_id, kind, note)
  values (pid, uid, sid, p_kind, left(btrim(coalesce(p_note, '')), 500))
  on conflict (pilot_id, user_id) do update set kind = excluded.kind, note = excluded.note, school_id = excluded.school_id, updated_at = now();
  if p_kind = 'school_license' then
    update pilot_schools set conversion_stage = 'interested' where school_id = sid and pilot_id = pid and conversion_stage = 'none';
  end if;
end $$;

create function school_pilot_info(p_school uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(r) from (
    select pp.name as pilot_name, pp.ends_on, (pp.ends_on - current_date) as days_left, ps.seat_limit, pp.status
    from pilot_schools ps join pilot_programs pp on pp.id = ps.pilot_id
    where ps.school_id = p_school and ps.stage in ('agreed', 'active', 'completed') and pp.status in ('active', 'closed')
      and is_school_member(p_school)
    order by pp.ends_on desc limit 1) r
$$;

-- Counts for pilot usage. Replaces record_usage so pilot schools also get per-school counts (still never per person).
create or replace function record_usage(p_metric text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_metric not in ('devotional_view', 'presentation_open') then return; end if;
  insert into usage_counters (day, metric, n) values (current_date, p_metric, 1)
  on conflict (day, metric) do update set n = usage_counters.n + 1;
  insert into usage_by_school (day, school_id, metric, n)
  select current_date, m.school_id, p_metric, 1
  from school_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
    and exists (select 1 from pilot_schools ps where ps.school_id = m.school_id and ps.stage in ('agreed', 'active'))
  on conflict (day, school_id, metric) do update set n = usage_by_school.n + 1;
end $$;

-- ---------------------------------------------------------------------------
-- Feedback: survey, bug report, feature request
-- ---------------------------------------------------------------------------
create table feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,
  pilot_id uuid references pilot_programs on delete set null,
  kind text not null check (kind in ('survey', 'bug', 'feature')),
  title text not null default '' check (length(title) <= 120),
  body text not null default '' check (length(body) <= 2000),
  ratings jsonb not null default '{}',
  willingness text check (willingness in ('yes', 'maybe', 'no', 'unsure')),
  page_path text check (page_path is null or length(page_path) <= 200),
  severity text check (severity in ('blocking', 'annoying', 'minor')),
  allow_follow_up boolean not null default false,
  status text not null default 'new' check (status in ('new', 'triaged', 'planned', 'done', 'declined')),
  priority text not null default 'unset' check (priority in ('unset', 'high', 'medium', 'low')),
  theme text not null default 'other' check (theme in ('ease_of_use', 'classroom_presentation', 'devotional_quality', 'time_saved',
    'community_usefulness', 'prayer_interactions', 'group_participation', 'willingness_to_pay', 'accessibility', 'bug', 'other')),
  admin_note text not null default '' check (length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index feedback_items_by_user on feedback_items (user_id) where user_id is not null;
create index feedback_items_by_pilot on feedback_items (pilot_id) where pilot_id is not null;
create index feedback_items_queue on feedback_items (status, created_at desc);
create trigger feedback_rate before insert on feedback_items
  for each row execute function enforce_rate_limit('feedback', 'user_id', 8, 30);
alter table feedback_items enable row level security;
revoke all on feedback_items from anon, authenticated;
grant select (id, kind, title, body, status, created_at) on feedback_items to authenticated;
create policy feedback_select_own on feedback_items for select to authenticated using (user_id = auth.uid());

create function submit_feedback(
  p_kind text, p_title text default '', p_body text default '', p_ratings jsonb default '{}',
  p_willingness text default null, p_page text default null, p_severity text default null, p_follow_up boolean default false
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  keys text[] := array['ease_of_use', 'classroom_presentation', 'devotional_quality', 'time_saved', 'community_usefulness', 'prayer_interactions', 'group_participation'];
  k text; v jsonb; clean jsonb := '{}';
  mine jsonb := my_pilot();
  fid uuid;
  theme text := 'other';
begin
  if uid is null then raise exception 'Sign in first.' using errcode = '28000'; end if;
  if p_kind not in ('survey', 'bug', 'feature') then raise exception 'Unknown kind of feedback.' using errcode = '22023'; end if;
  if p_kind in ('bug', 'feature') and length(btrim(coalesce(p_title, ''))) < 3 then
    raise exception 'Please add a short title.' using errcode = '22023';
  end if;
  if p_kind in ('bug', 'feature') and length(btrim(coalesce(p_body, ''))) < 10 then
    raise exception 'Please say a little more so we can understand.' using errcode = '22023';
  end if;
  if p_kind = 'survey' then
    for k, v in select * from jsonb_each(coalesce(p_ratings, '{}')) loop
      if k <> all (keys) or jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric not between 1 and 5 or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) then
        raise exception 'Ratings are whole numbers from 1 to 5.' using errcode = '22023';
      end if;
      clean := clean || jsonb_build_object(k, v);
    end loop;
    if clean = '{}' and length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'Please answer at least one question.' using errcode = '22023'; end if;
    theme := 'ease_of_use';
  elsif p_kind = 'bug' then theme := 'bug'; end if;
  perform screen_text(coalesce(p_title, '') || ' ' || coalesce(p_body, ''), false);
  insert into feedback_items (user_id, pilot_id, kind, title, body, ratings, willingness, page_path, severity, allow_follow_up, theme)
  values (uid, nullif(mine ->> 'pilot_id', '')::uuid, p_kind, left(btrim(coalesce(p_title, '')), 120), left(btrim(coalesce(p_body, '')), 2000), clean,
          case when p_kind = 'survey' then p_willingness end,
          case when p_page ~ '^/[A-Za-z0-9/_\-\[\]]*$' then left(p_page, 200) end,
          case when p_kind = 'bug' then coalesce(p_severity, 'annoying') end,
          coalesce(p_follow_up, false), theme)
  returning id into fid;
  return fid;
exception when check_violation then
  raise exception 'Please check what you entered.' using errcode = '22023';
end $$;

create function list_feedback(p_kind text default null, p_status text default null, p_limit int default 100)
returns table (id uuid, kind text, title text, body text, ratings jsonb, willingness text, page_path text, severity text,
               allow_follow_up boolean, status text, priority text, theme text, admin_note text, created_at timestamptz, pilot_name text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  return query
  select f.id, f.kind, f.title, f.body, f.ratings, f.willingness, f.page_path, f.severity, f.allow_follow_up, f.status, f.priority, f.theme,
         f.admin_note, f.created_at, (select p.name from pilot_programs p where p.id = f.pilot_id)
  from feedback_items f
  where (p_kind is null or f.kind = p_kind) and (p_status is null or f.status = p_status)
  order by (f.status = 'new') desc,
           case f.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end,
           case f.severity when 'blocking' then 0 when 'annoying' then 1 else 2 end nulls last,
           f.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;

create function triage_feedback(p_id uuid, p_status text, p_priority text, p_theme text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  update feedback_items set status = p_status, priority = p_priority, theme = p_theme, admin_note = left(btrim(coalesce(p_note, '')), 1000), updated_at = now()
   where id = p_id;
  if not found then raise exception 'Feedback not found.' using errcode = 'P0002'; end if;
  perform audit_record('feedback.triage', 'feedback', p_id::text, jsonb_build_object('status', p_status, 'priority', p_priority));
exception when check_violation then
  raise exception 'Check the status, priority and theme.' using errcode = '22023';
end $$;

-- ---------------------------------------------------------------------------
-- Pilot metrics: totals only. No person, no prayer, no private group message.
-- ---------------------------------------------------------------------------
create function pilot_overview()
returns table (id uuid, name text, starts_on date, ends_on date, status text, schools bigint, agreed bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  return query select p.id, p.name, p.starts_on, p.ends_on, p.status,
                      (select count(*) from pilot_schools s where s.pilot_id = p.id),
                      (select count(*) from pilot_schools s where s.pilot_id = p.id and s.stage in ('agreed', 'active', 'completed'))
               from pilot_programs p order by p.starts_on desc;
end $$;

create function pilot_school_rows(p_pilot uuid)
returns table (id uuid, school_id uuid, school_name text, contact_name text, stage text, agreed_at timestamptz, agreed_note text,
               seat_limit int, conversion_stage text, notes text, paid boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform pilot_admin_only();
  return query select s.id, s.school_id, s.school_name, s.contact_name, s.stage, s.agreed_at, s.agreed_note, s.seat_limit, s.conversion_stage, s.notes,
                      coalesce(exists (select 1 from subscriptions b where b.school_id = s.school_id and subscription_grants(b)), false)
               from pilot_schools s where s.pilot_id = p_pilot order by s.school_name;
end $$;

create function pilot_metrics(p_pilot uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  pp pilot_programs;
  min_group int := billing_setting_int('analytics_min_group', 5);
  d1 date; d2 date;
  members uuid[];
  n int;
  shown boolean;
  result jsonb;
begin
  perform pilot_admin_only();
  select * into pp from pilot_programs where id = p_pilot;
  if not found then raise exception 'Pilot not found.' using errcode = 'P0002'; end if;
  d1 := pp.starts_on; d2 := least(pp.ends_on, current_date);
  select coalesce(array_agg(distinct m.user_id), '{}') into members
    from school_memberships m join pilot_schools s on s.school_id = m.school_id and s.pilot_id = p_pilot
   where m.status = 'active';
  n := cardinality(members);
  shown := n >= min_group;

  result := jsonb_build_object(
    'pilot', jsonb_build_object('name', pp.name, 'starts_on', pp.starts_on, 'ends_on', pp.ends_on, 'status', pp.status),
    'minimum_group', min_group,
    'schools', jsonb_build_object(
      'by_stage', coalesce((select jsonb_object_agg(stage, c) from (select stage, count(*) c from pilot_schools where pilot_id = p_pilot group by stage) x), '{}'),
      'by_conversion', coalesce((select jsonb_object_agg(conversion_stage, c) from (select conversion_stage, count(*) c from pilot_schools where pilot_id = p_pilot group by conversion_stage) x), '{}')),
    'invited_by_email', (select count(*) from school_invitations i join pilot_schools s on s.school_id = i.school_id and s.pilot_id = p_pilot),
    'codes', jsonb_build_object(
      'issued', (select count(*) from pilot_access_codes c join pilot_schools s on s.id = c.pilot_school_id where s.pilot_id = p_pilot),
      'redemptions', (select count(*) from pilot_redemptions r join pilot_access_codes c on c.id = r.code_id join pilot_schools s on s.id = c.pilot_school_id where s.pilot_id = p_pilot)),
    'enrolled_educators', case when shown then to_jsonb(n) else to_jsonb('fewer than ' || min_group) end,
    'suppressed', not shown,
    'interest', coalesce((select jsonb_object_agg(kind, c) from (select kind, count(*) c from pilot_interest where pilot_id = p_pilot group by kind) x), '{}'),
    'paid', jsonb_build_object(
      'schools', (select count(*) from pilot_schools s where s.pilot_id = p_pilot
                    and exists (select 1 from subscriptions b where b.school_id = s.school_id and subscription_grants(b))),
      'educators_on_own_plan', case when shown then (select count(distinct b.user_id) from subscriptions b where b.user_id = any (members) and subscription_grants(b)) else null end),
    'feedback', jsonb_build_object(
      'by_kind', coalesce((select jsonb_object_agg(kind, c) from (select kind, count(*) c from feedback_items where pilot_id = p_pilot group by kind) x), '{}'),
      'open_bugs', (select count(*) from feedback_items where pilot_id = p_pilot and kind = 'bug' and status in ('new', 'triaged')),
      'survey_responses', (select count(*) from feedback_items where pilot_id = p_pilot and kind = 'survey'),
      'survey_averages', case when (select count(*) from feedback_items where pilot_id = p_pilot and kind = 'survey') >= min_group
        then coalesce((select jsonb_object_agg(k, round(a, 2)) from (
               select e.key as k, avg((e.value)::numeric) as a from feedback_items f, jsonb_each_text(f.ratings) e
               where f.pilot_id = p_pilot and f.kind = 'survey' group by e.key) q), '{}') else null end,
      'willingness', case when (select count(*) from feedback_items where pilot_id = p_pilot and kind = 'survey') >= min_group
        then coalesce((select jsonb_object_agg(willingness, c) from (
               select willingness, count(*) c from feedback_items where pilot_id = p_pilot and kind = 'survey' and willingness is not null group by willingness) x), '{}') else null end));

  if shown then
    result := result || jsonb_build_object(
      'activated_educators', (select count(*) from profiles where id = any (members) and onboarding_completed_at is not null),
      'weekly_active_educators', (select count(*) from profiles where id = any (members) and last_active_on > current_date - 7),
      'devotional_sessions', coalesce((select sum(u.n) from usage_by_school u join pilot_schools s on s.school_id = u.school_id and s.pilot_id = p_pilot
                                         where u.metric = 'devotional_view' and u.day between d1 and d2), 0),
      'presentation_opens', coalesce((select sum(u.n) from usage_by_school u join pilot_schools s on s.school_id = u.school_id and s.pilot_id = p_pilot
                                        where u.metric = 'presentation_open' and u.day between d1 and d2), 0),
      'contributions_by_kind', coalesce((select jsonb_object_agg(kind, c) from (
          select c.kind::text as kind, count(*) c from community_contributions c
          where c.user_id = any (members) and c.visibility <> 'private' and c.created_at::date between d1 and d2 group by c.kind) x), '{}'),
      'replies', (select count(*) from contribution_replies r where r.user_id = any (members) and r.created_at::date between d1 and d2),
      'prayer_acknowledgements_given', (select count(*) from prayer_acknowledgements a where a.user_id = any (members) and a.created_at::date between d1 and d2),
      'group_participation', jsonb_build_object(
        'educators_in_a_group', (select count(distinct g.user_id) from group_memberships g where g.user_id = any (members) and g.status = 'active'),
        'groups_with_activity', (select count(distinct gid) from (
            select group_id as gid from group_posts where author_id = any (members) and created_at::date between d1 and d2
            union select group_id from group_comments where author_id = any (members) and created_at::date between d1 and d2) a),
        'posts', (select count(*) from group_posts where author_id = any (members) and created_at::date between d1 and d2),
        'comments', (select count(*) from group_comments where author_id = any (members) and created_at::date between d1 and d2)),
      'moderation_reports', jsonb_build_object(
        'about_pilot_content', (select count(*) from contribution_reports r where r.target_author_id = any (members) and r.created_at::date between d1 and d2),
        'still_open', (select count(*) from contribution_reports r where r.target_author_id = any (members) and r.status = 'open')),
      'per_school', coalesce((select jsonb_agg(row) from (
          select jsonb_build_object('name', s.school_name, 'stage', s.stage,
                   'enrolled', case when e.c >= min_group then e.c end,
                   'weekly_active', case when e.c >= min_group then (select count(*) from profiles p join school_memberships m2 on m2.user_id = p.id
                                      where m2.school_id = s.school_id and m2.status = 'active' and p.last_active_on > current_date - 7) end,
                   'suppressed', e.c < min_group) as row
          from pilot_schools s
          left join lateral (select count(*) c from school_memberships m where m.school_id = s.school_id and m.status = 'active') e on true
          where s.pilot_id = p_pilot order by s.school_name) z), '[]'));
  end if;
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Retention: pilot counters, code attempts and settled feedback
-- ---------------------------------------------------------------------------
create or replace function retention_run() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  n_reports int; n_actions int; n_audit int; n_stripe int; n_usage int; n_rate int; n_school_usage int; n_attempts int; n_feedback int; result jsonb;
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
  delete from usage_by_school where day < current_date - governance_int('retention_usage_days', 800);
  get diagnostics n_school_usage = row_count;
  delete from community_rate_events where created_at < now() - interval '2 days';
  get diagnostics n_rate = row_count;
  delete from pilot_code_attempts where at < now() - interval '1 day';
  get diagnostics n_attempts = row_count;
  delete from feedback_items where status in ('done', 'declined')
     and updated_at < now() - make_interval(days => governance_int('retention_feedback_days', 730));
  get diagnostics n_feedback = row_count;
  result := jsonb_build_object('report_snapshots_cleared', n_reports, 'moderation_snapshots_cleared', n_actions,
    'audit_rows_deleted', n_audit, 'stripe_events_deleted', n_stripe, 'usage_rows_deleted', n_usage, 'rate_events_deleted', n_rate,
    'school_usage_rows_deleted', n_school_usage, 'code_attempts_deleted', n_attempts, 'feedback_deleted', n_feedback);
  insert into admin_audit_log (actor_id, actor_roles, action, entity, detail)
  values (auth.uid(), '{}', 'retention.run', 'system', result);
  return result;
end $$;

-- ===========================================================================
-- Lock down. Callable by signed-in people (each checks its own permission): the client functions only.
-- ===========================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.oid not in (select oid from _pre_0009_fns)
      and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in (
      'attest_launch', 'retract_launch_attestation', 'community_readiness', 'content_readiness',
      'pilot_create', 'pilot_set_status', 'pilot_add_school', 'pilot_set_school_stage', 'pilot_set_school_seats', 'pilot_set_conversion',
      'pilot_create_school', 'pilot_create_code', 'pilot_revoke_code', 'pilot_list_codes', 'redeem_pilot_code', 'my_pilot',
      'express_pilot_interest', 'school_pilot_info', 'submit_feedback', 'list_feedback', 'triage_feedback',
      'pilot_overview', 'pilot_school_rows', 'pilot_metrics') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;
-- Replaced functions (set_community_setting, school_license_raw, record_usage, retention_run) keep their existing grants.
-- flag_gate, the gate triggers, community_ready and the helpers stay internal.

drop table _pre_0009_fns;
