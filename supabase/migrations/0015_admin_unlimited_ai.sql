-- Platform administrators: unlimited AI requests.
--
--   * platform_admin: unlimited (no daily limit).
--   * content_editor: 50 a day, or their plan's limit if higher.
--   * Educator Plus and School License: their plan's limit (10 a day).
--   * Everyone else: none.
-- Self-contained: it can run whether or not 0014 has been run.

create or replace function ai_daily_limit(uid uuid) returns int
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from platform_roles r where r.user_id = uid and r.role = 'platform_admin') then 2147483647
    else greatest(
      plan_feature_value(uid, 'ai_tools'),
      case when exists (select 1 from platform_roles r where r.user_id = uid and r.role = 'content_editor') then 50 else 0 end
    )
  end
$$;
revoke all on function ai_daily_limit(uuid) from public, anon, authenticated;

create or replace function ai_consume() returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  lim int;
  used int;
begin
  if uid is null then raise exception 'Sign in to use the AI tools.' using errcode = '42501'; end if;
  lim := ai_daily_limit(uid);
  if lim <= 0 then raise exception 'The AI tools are part of Educator Plus and school licences.' using errcode = 'P0001'; end if;
  insert into ai_usage (user_id, day, uses) values (uid, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set uses = ai_usage.uses + 1
  returning uses into used;
  if used > lim then
    raise exception 'You have used today''s % AI requests. They reset at midnight UTC.', lim using errcode = 'P0001';
  end if;
  return lim - used;
end $$;

create or replace function ai_remaining() returns table (remaining int, daily_limit int)
language sql stable security definer set search_path = public as $$
  with l as (select ai_daily_limit(auth.uid()) as lim)
  select
    greatest(0, l.lim - coalesce((select u.uses from ai_usage u
                                  where u.user_id = auth.uid() and u.day = (now() at time zone 'utc')::date), 0)),
    l.lim
  from l
  where auth.uid() is not null
$$;
