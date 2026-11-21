-- Teachers submit a devotional they wrote (on the Write tab) for publishing.
--
--   * A submission is a snapshot of the saved devotional at the moment it was sent,
--     so later edits to the teacher's copy do not change what editors review.
--   * The teacher sees their own submissions; content editors and administrators see all.
--   * Nothing is written to the table directly: submit, withdraw and review go through
--     the functions below, which check who is asking and what state the row is in.
--   * Accepting never publishes. The editor starts an ordinary draft devotional from the
--     submission, and it goes through the usual review, scheduling and publishing.
-- Self-contained: safe to run once 0012 has been run.

create table if not exists devotional_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- The teacher's display name when they submitted, for the byline (editors cannot read other profiles).
  author_name text not null default '' check (length(author_name) <= 120),
  version_id uuid references presentation_versions on delete set null,
  title text not null check (length(title) between 1 and 140),
  topic text not null default '' check (length(topic) <= 140),
  topics text[] not null default '{}',
  scripture jsonb not null default '{}',
  content jsonb not null,
  note text not null default '' check (length(note) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  editor_note text not null default '' check (length(editor_note) <= 1000),
  reviewed_by uuid references auth.users on delete set null,
  reviewed_at timestamptz,
  devotional_id uuid references devotionals on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists devotional_submissions_user_idx on devotional_submissions (user_id, created_at desc);
create index if not exists devotional_submissions_version_idx on devotional_submissions (version_id);
create index if not exists devotional_submissions_status_idx on devotional_submissions (status, created_at);
create index if not exists devotional_submissions_reviewer_idx on devotional_submissions (reviewed_by);
create index if not exists devotional_submissions_devotional_idx on devotional_submissions (devotional_id);
-- One submission waiting for review per saved devotional.
create unique index if not exists devotional_submissions_one_pending on devotional_submissions (version_id) where status = 'pending';

drop trigger if exists devotional_submissions_updated on devotional_submissions;
create trigger devotional_submissions_updated before update on devotional_submissions
  for each row execute function set_updated_at();

alter table devotional_submissions enable row level security;
revoke all on devotional_submissions from anon, authenticated;
grant select on devotional_submissions to authenticated;
drop policy if exists devotional_submissions_read on devotional_submissions;
create policy devotional_submissions_read on devotional_submissions for select to authenticated
  using (user_id = auth.uid() or has_platform_role('{content_editor,platform_admin}'));

-- Sends one of the caller's saved devotionals for review. Returns the submission id.
create or replace function submit_devotional(p_version uuid, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v presentation_versions%rowtype;
  new_id uuid;
begin
  if uid is null then raise exception 'Sign in to submit a devotional.' using errcode = '42501'; end if;
  select * into v from presentation_versions where id = p_version and user_id = uid and source = 'ai_generated';
  if not found then raise exception 'That devotional could not be found.' using errcode = 'P0001'; end if;
  if exists (select 1 from devotional_submissions where version_id = p_version and status = 'pending') then
    raise exception 'This devotional is already waiting for review.' using errcode = 'P0001';
  end if;
  if coalesce(trim(v.title), '') = '' then raise exception 'Give the devotional a title before submitting it.' using errcode = 'P0001'; end if;
  insert into devotional_submissions (user_id, author_name, version_id, title, topic, topics, scripture, content, note)
  values (uid, left(coalesce((select trim(display_name) from profiles where id = uid), ''), 120), v.id, v.title, coalesce(v.topic, ''), coalesce(v.topics, '{}'), coalesce(v.scripture, '{}'), v.content, left(coalesce(trim(p_note), ''), 1000))
  returning id into new_id;
  return new_id;
end $$;

-- The teacher takes back a submission that has not been reviewed yet.
create or replace function withdraw_submission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update devotional_submissions set status = 'withdrawn'
  where id = p_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'That submission can no longer be withdrawn.' using errcode = 'P0001'; end if;
end $$;

-- Editors: accept (with the draft devotional started from it) or decline, with an optional note to the teacher.
create or replace function review_submission(p_id uuid, p_decision text, p_note text default '', p_devotional uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_platform_role('{content_editor,platform_admin}') then
    raise exception 'Only editors can review submissions.' using errcode = '42501';
  end if;
  if p_decision not in ('accepted', 'declined') then raise exception 'Choose accept or decline.' using errcode = 'P0001'; end if;
  if p_decision = 'accepted' and (p_devotional is null or not exists (select 1 from devotionals where id = p_devotional)) then
    raise exception 'Start a draft devotional from the submission to accept it.' using errcode = 'P0001';
  end if;
  update devotional_submissions
  set status = p_decision, editor_note = left(coalesce(trim(p_note), ''), 1000), reviewed_by = auth.uid(), reviewed_at = now(),
      devotional_id = case when p_decision = 'accepted' then p_devotional else null end
  where id = p_id and status = 'pending';
  if not found then raise exception 'That submission has already been reviewed or withdrawn.' using errcode = 'P0001'; end if;
end $$;

revoke all on function submit_devotional(uuid, text) from public, anon;
revoke all on function withdraw_submission(uuid) from public, anon;
revoke all on function review_submission(uuid, text, text, uuid) from public, anon;
grant execute on function submit_devotional(uuid, text) to authenticated;
grant execute on function withdraw_submission(uuid) to authenticated;
grant execute on function review_submission(uuid, text, text, uuid) to authenticated;
