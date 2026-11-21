-- Who may use the AI tools: anyone with a daily AI allowance.
--
-- 0015 gave platform administrators (and 0014 content editors) an AI allowance,
-- but saving a version still required the Plus or School plan feature, so an
-- administrator without a plan could not keep what the AI wrote. One rule now:
-- you may use and save AI work when your daily limit is above zero.
-- Self-contained: safe to run once 0012–0015 have been run.

create or replace function can_use_ai() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and ai_daily_limit(auth.uid()) > 0
$$;
revoke all on function can_use_ai() from public, anon;
grant execute on function can_use_ai() to authenticated;

drop policy if exists presentation_versions_insert on presentation_versions;
drop policy if exists presentation_versions_update on presentation_versions;
create policy presentation_versions_insert on presentation_versions for insert to authenticated
  with check (user_id = auth.uid() and can_use_ai());
create policy presentation_versions_update on presentation_versions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and can_use_ai());
