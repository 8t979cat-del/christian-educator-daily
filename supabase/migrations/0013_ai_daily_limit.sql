-- AI teaching tools: a lower daily limit, and a counter teachers can see.
--
--   * Plus and School go from 40 to 10 AI requests per teacher per day.
--     Administrators can still change the number in the plan matrix.
--   * ai_remaining(): how many of today's requests the signed-in teacher has
--     left, and their daily limit. Read-only; spends nothing.

update plan_features set limit_value = 10
where feature_key = 'ai_tools' and plan_key in ('plus', 'school') and enabled;

create function ai_remaining() returns table (remaining int, daily_limit int)
language sql stable security definer set search_path = public as $$
  with l as (select plan_feature_value(auth.uid(), 'ai_tools') as lim)
  select
    greatest(0, l.lim - coalesce((select u.uses from ai_usage u
                                  where u.user_id = auth.uid() and u.day = (now() at time zone 'utc')::date), 0)),
    l.lim
  from l
  where auth.uid() is not null
$$;

revoke all on function ai_remaining() from public, anon;
grant execute on function ai_remaining() to authenticated;
