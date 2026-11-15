-- The teacher's own relationship with devotionals: bookmarks, completion, private notes,
-- and daily reminder preferences.
--
-- Everything here is private to the signed-in user. Nobody else (not school
-- administrators, not platform staff) can read another person's notes or progress
-- through the application.

create table devotional_user_state (
  user_id uuid not null references auth.users on delete cascade,
  devotional_id uuid not null references devotionals on delete cascade,
  bookmarked boolean not null default false,
  completed_at timestamptz,
  note text not null default '' check (length(note) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, devotional_id)
);
create index devotional_user_state_bookmarks on devotional_user_state (user_id, updated_at desc) where bookmarked;
create index devotional_user_state_completed on devotional_user_state (user_id, completed_at desc) where completed_at is not null;
create trigger devotional_user_state_updated before update on devotional_user_state
  for each row execute function set_updated_at();

alter table devotional_user_state enable row level security;
revoke all on devotional_user_state from anon, authenticated;
grant select, delete on devotional_user_state to authenticated;
grant insert (user_id, devotional_id, bookmarked, completed_at, note) on devotional_user_state to authenticated;
grant update (bookmarked, completed_at, note) on devotional_user_state to authenticated;

create policy user_state_select_own on devotional_user_state for select to authenticated
  using (user_id = auth.uid());
-- A row can only be created for a devotional the person is allowed to see. The
-- subquery runs under the caller's own row-level security, so unpublished work is invisible here.
create policy user_state_insert_own on devotional_user_state for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (select 1 from devotionals d where d.id = devotional_id)
  );
create policy user_state_update_own on devotional_user_state for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_state_delete_own on devotional_user_state for delete to authenticated
  using (user_id = auth.uid());

-- Optional daily reminder. Delivered today through a downloadable calendar event
-- (see /api/reminders/calendar). The time is a wall-clock time in the teacher's own calendar.
alter table profiles
  add column reminder_enabled boolean not null default false,
  add column reminder_time time not null default '06:30',
  add column reminder_days text not null default 'weekdays' check (reminder_days in ('weekdays', 'daily'));
