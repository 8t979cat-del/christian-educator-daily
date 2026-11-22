-- Reading levels written by AI, shared by everyone who presents the devotional.
--
--   * When a teacher chooses a reading level that has no version written by an editor, the
--     server asks the AI to adapt the devotional for that age once, and keeps it here so every
--     teacher after that sees it at once (and no one's AI requests are used).
--   * Editors' own versions (devotionals.levels) always come first; these fill the gaps.
--   * source_hash records the devotional text it was adapted from. When an editor changes the
--     devotional, the hash no longer matches and the level is adapted again.
--   * Read: anyone who can read the devotional. Write: the server only (service role), never a
--     user directly, so nobody can put their own text in front of other teachers.

create table if not exists devotional_ai_levels (
  devotional_id uuid not null references devotionals on delete cascade,
  band text not null check (band in ('k2', 'g35', 'g68', 'g912')),
  content jsonb not null check (devotional_levels_valid(jsonb_build_object('k2', content))),
  source_hash text not null check (length(source_hash) <= 128),
  created_at timestamptz not null default now(),
  primary key (devotional_id, band)
);

alter table devotional_ai_levels enable row level security;
revoke all on devotional_ai_levels from anon, authenticated;
grant select on devotional_ai_levels to authenticated;
drop policy if exists devotional_ai_levels_read on devotional_ai_levels;
-- Row-level security on devotionals applies inside the subquery: readers see levels of devotionals they can read.
create policy devotional_ai_levels_read on devotional_ai_levels for select to authenticated
  using (exists (select 1 from devotionals d where d.id = devotional_id));
