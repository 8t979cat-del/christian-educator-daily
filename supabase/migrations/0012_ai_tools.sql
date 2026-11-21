-- AI teaching tools (Educator Plus and School License).
--
--   * A plan feature, `ai_tools`, whose limit is the number of AI requests a
--     teacher may make per day (re-leveling or writing a devotional). Free has it
--     off; Plus and School get 40 a day. Administrators change it in the plan matrix.
--   * ai_consume(): the only way to spend a use. The application calls it before
--     every AI request, so the limit holds however the request is made.
--   * presentation_versions: a teacher's own saved versions of a devotional's text,
--     whether edited by hand, re-leveled by AI, or written by AI from chosen topics.
--     Private to the teacher. Saving needs the feature. Scripture is never stored
--     here as AI output: a generated devotional records a reference and the text of
--     a public-domain translation looked up by the application.

insert into features (key, label, description, kind, scope, sort) values
  ('ai_tools', 'AI teaching tools', 'Re-level a devotional for any age, edit and save presentations, and write a new devotional from chosen topics. The limit is AI requests per day.', 'limit', 'user', 12);
insert into plan_features (plan_key, feature_key, enabled, limit_value)
select p.key, 'ai_tools', p.key in ('plus', 'school'), case when p.key in ('plus', 'school') then 40 else null end
from plans p;

create table ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  uses int not null default 0 check (uses >= 0),
  primary key (user_id, day)
);
alter table ai_usage enable row level security;
revoke all on ai_usage from anon, authenticated;
grant select on ai_usage to authenticated;
create policy ai_usage_own on ai_usage for select to authenticated using (user_id = auth.uid());

-- Spends one AI use for today (UTC) and returns how many remain. Refuses without the feature or over the limit.
create function ai_consume() returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim int;
  used int;
begin
  if uid is null then raise exception 'Sign in to use the AI tools.' using errcode = '42501'; end if;
  lim := plan_feature_value(uid, 'ai_tools');
  if lim <= 0 then raise exception 'The AI tools are part of Educator Plus and school licences.' using errcode = 'P0001'; end if;
  insert into ai_usage (user_id, day, uses) values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set uses = ai_usage.uses + 1
  returning uses into used;
  if used > lim then
    raise exception 'You have used today''s % AI requests. They reset at midnight UTC.', lim using errcode = 'P0001';
  end if;
  return lim - used;
end $$;

create table presentation_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  -- Null for a devotional written by AI from topics (it belongs to no published devotional).
  devotional_id uuid references devotionals on delete cascade,
  -- Null means the standard text.
  band text check (band in ('k2', 'g35', 'g68', 'g912')),
  source text not null check (source in ('edited', 'ai_leveled', 'ai_generated')),
  title text not null default '' check (length(title) <= 140),
  topic text not null default '' check (length(topic) <= 140),
  -- The four text fields, as in devotionals.levels: reflection, discussion_question, practical_application, prayer.
  content jsonb not null check (devotional_levels_valid(jsonb_build_object('k2', content))),
  -- Generated devotionals only: { reference, translation_code } (text is looked up, never generated).
  scripture jsonb check (scripture is null or (jsonb_typeof(scripture) = 'object' and octet_length(scripture::text) <= 20000)),
  topics text[] not null default '{}' check (cardinality(topics) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generated_has_scripture check (source <> 'ai_generated' or (devotional_id is null and scripture is not null))
);
-- One saved version per teacher, devotional and reading level.
create unique index presentation_versions_one_per_band on presentation_versions (user_id, devotional_id, coalesce(band, 'standard'))
  where devotional_id is not null;
create index presentation_versions_by_user on presentation_versions (user_id, updated_at desc);
create trigger presentation_versions_updated before update on presentation_versions
  for each row execute function set_updated_at();

alter table presentation_versions enable row level security;
revoke all on presentation_versions from anon, authenticated;
grant select, delete on presentation_versions to authenticated;
grant insert (devotional_id, band, source, title, topic, content, scripture, topics) on presentation_versions to authenticated;
grant update (band, source, title, topic, content, scripture, topics) on presentation_versions to authenticated;
create policy presentation_versions_read on presentation_versions for select to authenticated using (user_id = auth.uid());
create policy presentation_versions_delete on presentation_versions for delete to authenticated using (user_id = auth.uid());
create policy presentation_versions_insert on presentation_versions for insert to authenticated
  with check (user_id = auth.uid() and has_feature('ai_tools'));
create policy presentation_versions_update on presentation_versions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and has_feature('ai_tools'));

revoke all on function ai_consume() from public, anon;
grant execute on function ai_consume() to authenticated;
