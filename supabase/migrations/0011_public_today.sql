-- Today's devotional for everyone, without signing in.
--
-- A teacher can open the home page and present the day's devotional to a class
-- without an account. This function is the only thing signed-out visitors may
-- read, and it returns only:
--   * the most recent live, FREE devotional dated today or up to a week before
--     (so a Monday-morning visit still finds Friday's if today's is not up yet);
--   * its standard text: never the reading-level versions (`levels`), which are
--     for signed-in teachers;
--   * its Scripture text only when the translation's licence allows the text to
--     be shown (the same rule as scriptureDisplay() in the application);
--   * the week's theme title and summary.
-- Plus content, drafts, scheduled-but-not-yet-live content, notes and every
-- other table stay closed to signed-out visitors.

create function public_today_devotional(p_today date) returns jsonb
language sql stable security definer set search_path = public as $$
  with day as (
    -- The caller's "today" (from the site time zone) may not run ahead of the server's clock by more than a day.
    select least(p_today, (now() at time zone 'utc')::date + 1) as d
  )
  select jsonb_build_object(
    'id', v.id,
    'title', v.title,
    'devotional_date', v.devotional_date,
    'daily_topic', v.daily_topic,
    'scripture_reference', v.scripture_reference,
    'translation_code', v.translation_code,
    'translation_name', t.name,
    'scripture_text', case
      when t.text_allowed and (t.license_type <> 'licensed' or nullif(btrim(coalesce(t.attribution, '')), '') is not null)
      then v.scripture_text end,
    'attribution', case when t.text_allowed then nullif(btrim(coalesce(t.attribution, '')), '') end,
    'reflection', v.reflection,
    'discussion_question', v.discussion_question,
    'practical_application', v.practical_application,
    'prayer', v.prayer,
    'theme_title', w.title,
    'theme_summary', w.summary,
    'theme_day', case when w.week_start is not null and v.devotional_date - w.week_start between 0 and 4
                      then v.devotional_date - w.week_start + 1 end
  )
  from day, devotionals v
  left join bible_translations t on t.code = v.translation_code
  left join weekly_themes w on w.id = v.theme_id
  where v.access_level = 'free'
    and (v.status = 'published' or (v.status = 'scheduled' and v.publish_at <= now()))
    and v.devotional_date <= day.d
    and v.devotional_date > day.d - 7
  order by v.devotional_date desc
  limit 1
$$;

revoke all on function public_today_devotional(date) from public;
grant execute on function public_today_devotional(date) to anon, authenticated;
