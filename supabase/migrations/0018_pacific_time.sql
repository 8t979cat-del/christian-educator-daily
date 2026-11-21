-- The site runs on Pacific Time (America/Los_Angeles: PST in winter, PDT in summer).
--
--   * The database's own "today" (current_date: archive windows, usage counts, pilots,
--     launch checks) follows Pacific Time for every new connection.
--   * Daily AI request limits reset at midnight Pacific Time instead of midnight UTC.
--   * Scheduling already uses the site time zone the app passes in (NEXT_PUBLIC_SITE_TIMEZONE,
--     which now defaults to America/Los_Angeles).
-- Self-contained: safe to run once 0015 has been run.

do $$
begin
  execute format('alter database %I set timezone to %L', current_database(), 'America/Los_Angeles');
exception when insufficient_privilege then
  raise notice 'Could not set the database time zone (not permitted); AI limits below still use Pacific Time.';
end $$;

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
  insert into ai_usage (user_id, day, uses) values (uid, (now() at time zone 'America/Los_Angeles')::date, 1)
  on conflict (user_id, day) do update set uses = ai_usage.uses + 1
  returning uses into used;
  if used > lim then
    raise exception 'You have used today''s % AI requests. They reset at midnight Pacific Time.', lim using errcode = 'P0001';
  end if;
  return lim - used;
end $$;

create or replace function ai_remaining() returns table (remaining int, daily_limit int)
language sql stable security definer set search_path = public as $$
  with l as (select ai_daily_limit(auth.uid()) as lim)
  select
    greatest(0, l.lim - coalesce((select u.uses from ai_usage u
                                  where u.user_id = auth.uid() and u.day = (now() at time zone 'America/Los_Angeles')::date), 0)),
    l.lim
  from l
  where auth.uid() is not null
$$;
