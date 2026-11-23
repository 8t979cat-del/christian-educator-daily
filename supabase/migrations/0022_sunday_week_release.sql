-- Release a whole week on the Sunday before it, so teachers can read, edit and prepare all five
-- days ahead. The Today page still shows each day's devotional on its own date.
--
--   * release_weekly_theme_sunday(theme, time zone): the same checks as publish_weekly_theme
--     (five approved devotionals, Monday to Friday), but every day is scheduled for midnight at
--     the start of the Sunday before the week. If that Sunday has already begun, they go live now.
--   * The site shows readers live devotionals dated up to the Saturday that ends the current week,
--     so a week released on Sunday is readable from then on, and later weeks never show early.
-- Self-contained: safe to run once 0003 has been run.

create or replace function release_weekly_theme_sunday(p_theme uuid, p_timezone text default 'America/Los_Angeles') returns int
language plpgsql security definer set search_path = public as $$
declare
  ws date;
  dev record;
  at_time timestamptz;
  n int := 0;
  total int;
  approved int;
begin
  if not is_content_editor() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select week_start into ws from weekly_themes where id = p_theme for update;
  if not found then
    raise exception 'theme not found' using errcode = 'P0002';
  end if;
  perform now() at time zone p_timezone; -- fails on an unknown zone

  select count(*), count(*) filter (where status = 'approved') into total, approved
  from devotionals where theme_id = p_theme and devotional_date between ws and ws + 4;
  if total <> 5 then
    raise exception 'a weekly theme needs exactly five devotionals (Monday to Friday); this one has %', total using errcode = 'P0001';
  end if;
  if approved <> 5 then
    raise exception 'all five devotionals must be approved first; % of 5 are approved', approved using errcode = 'P0001';
  end if;

  -- Midnight at the start of the Sunday before the week (week_start is a Monday).
  at_time := (ws - 1)::timestamp at time zone p_timezone;
  for dev in select id from devotionals where theme_id = p_theme order by devotional_date loop
    if at_time <= now() then
      perform _transition_devotional(dev.id, 'published', null, 'Released with its week', auth.uid());
    else
      perform _transition_devotional(dev.id, 'scheduled', at_time, 'Scheduled with its week for the Sunday before', auth.uid());
    end if;
    n := n + 1;
  end loop;
  update weekly_themes set published_at = now() where id = p_theme;
  return n;
end $$;
revoke all on function release_weekly_theme_sunday(uuid, text) from public, anon;
grant execute on function release_weekly_theme_sunday(uuid, text) to authenticated;
