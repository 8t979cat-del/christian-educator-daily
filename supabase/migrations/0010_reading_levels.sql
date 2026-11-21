-- Reading levels: one devotional, written at several K-12 reading levels.
--
-- Every day shares one Scripture passage and theme. The existing text columns
-- (reflection, discussion question, practical application, prayer) are the
-- standard version. `levels` holds a version written for an age band, keyed
-- by band, for any band an editor has written one for:
--
--   { "k2": { "reflection": doc, "discussion_question": doc,
--             "practical_application": doc, "prayer": doc }, ... }
--
-- A band without its own version, or a field left empty in it, uses the
-- standard text. Teachers choose their band when presenting.

-- Each band's version must be an object of the four text fields, each a rich-text document.
create function devotional_levels_valid(l jsonb) returns boolean
language sql immutable set search_path = public as $$
  -- CASE, not AND: SQL does not promise to stop early, and jsonb_each fails on a non-object.
  select case
    when jsonb_typeof(l) <> 'object' then false
    when (l - array['k2', 'g35', 'g68', 'g912']) <> '{}'::jsonb then false
    when octet_length(l::text) > 200000 then false
    else coalesce((
      select bool_and(case
        when jsonb_typeof(e.value) <> 'object' then false
        when (e.value - array['reflection', 'discussion_question', 'practical_application', 'prayer']) <> '{}'::jsonb then false
        else not exists (
          select 1 from jsonb_each(e.value) f
          where jsonb_typeof(f.value) <> 'object' or f.value->>'type' is distinct from 'doc'
        )
      end)
      from jsonb_each(l) e
    ), true)
  end
$$;

alter table devotionals add column levels jsonb not null default '{}'
  constraint levels_valid check (devotional_levels_valid(levels));

grant insert (levels) on devotionals to authenticated;
grant update (levels) on devotionals to authenticated;

-- All the text of every band's version, for search.
create function devotional_levels_plain(l jsonb) returns text
language sql immutable set search_path = public as $$
  -- Runs in the write trigger, before the check constraint, so it must not fail on a bad shape.
  select case when jsonb_typeof(l) <> 'object' then '' else coalesce((
    select string_agg(rich_text_plain(f.value), ' ')
    from jsonb_each(l) as e(k, v),
         jsonb_each(case when jsonb_typeof(e.v) = 'object' then e.v else '{}'::jsonb end) as f
  ), '') end
$$;

create or replace function devotionals_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ws date;
  cat_name text;
  content_changed boolean;
begin
  new.title := btrim(new.title);
  new.daily_topic := btrim(new.daily_topic);
  new.scripture_reference := btrim(new.scripture_reference);
  new.author_name := btrim(new.author_name);
  new.scripture_text := nullif(btrim(coalesce(new.scripture_text, '')), '');
  new.updated_by := uid;

  if tg_op = 'INSERT' then
    new.created_by := uid;
    new.author_id := uid;
    if new.author_name = '' and uid is not null then
      select coalesce(nullif(btrim(first_name || ' ' || last_name), ''), '') into new.author_name
      from profiles where id = uid;
      new.author_name := coalesce(new.author_name, '');
    end if;
  else
    content_changed :=
      (new.title, new.devotional_date, new.theme_id, new.daily_topic, new.category_slug,
       new.scripture_reference, new.translation_code, new.reflection, new.prayer,
       new.discussion_question, new.practical_application, new.audience, new.grade_levels,
       new.educational_category, new.author_name, new.levels)
      is distinct from
      (old.title, old.devotional_date, old.theme_id, old.daily_topic, old.category_slug,
       old.scripture_reference, old.translation_code, old.reflection, old.prayer,
       old.discussion_question, old.practical_application, old.audience, old.grade_levels,
       old.educational_category, old.author_name, old.levels)
      or (new.scripture_text is not null and new.scripture_text is distinct from old.scripture_text);

    if content_changed and old.status = 'archived' and new.status = 'archived' then
      raise exception 'archived devotionals are read-only; restore to draft to edit' using errcode = 'P0001';
    end if;

    -- Content approved for release must be re-approved after any change.
    if content_changed and old.status in ('approved', 'scheduled') and new.status = old.status then
      new.status := 'draft';
      new.approved_by := null;
      new.approved_at := null;
      new.publish_at := null;
      insert into devotional_events (devotional_id, actor_id, from_status, to_status, note)
      values (old.id, uid, old.status, 'draft', 'Edited after approval; returned to draft for re-approval.');
    end if;
  end if;

  -- Scripture text only for translations whose licence allows it.
  if new.scripture_text is not null then
    if new.translation_code is null
       or not exists (select 1 from bible_translations t where t.code = new.translation_code and t.text_allowed) then
      raise exception 'the licence for this translation does not allow its text to be stored or shown; use a reference only'
        using errcode = 'P0001';
    end if;
  end if;

  -- A theme's devotionals fall on its Monday to Friday.
  if new.theme_id is not null then
    select week_start into ws from weekly_themes where id = new.theme_id;
    if new.devotional_date < ws or new.devotional_date > ws + 4 then
      raise exception 'a devotional in a weekly theme must be dated Monday to Friday of that week' using errcode = 'P0001';
    end if;
  end if;

  select name into cat_name from devotional_categories where slug = new.category_slug;
  new.search :=
    setweight(to_tsvector('english', new.title || ' ' || new.daily_topic), 'A')
    || setweight(to_tsvector('english', new.scripture_reference || ' ' || coalesce(cat_name, '')), 'B')
    || setweight(to_tsvector('english',
         rich_text_plain(new.reflection) || ' ' || rich_text_plain(new.prayer) || ' '
         || rich_text_plain(new.discussion_question) || ' ' || rich_text_plain(new.practical_application)), 'C')
    || setweight(to_tsvector('english', devotional_levels_plain(new.levels)), 'D')
    || setweight(to_tsvector('english', coalesce(new.scripture_text, '')), 'D');

  return new;
end $$;


create or replace function devotionals_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (old.title, old.daily_topic, old.scripture_reference, old.scripture_text, old.reflection, old.prayer,
      old.discussion_question, old.practical_application, old.devotional_date, old.category_slug,
      old.translation_code, old.audience, old.grade_levels, old.educational_category, old.author_name, old.theme_id, old.levels)
     is distinct from
     (new.title, new.daily_topic, new.scripture_reference, new.scripture_text, new.reflection, new.prayer,
      new.discussion_question, new.practical_application, new.devotional_date, new.category_slug,
      new.translation_code, new.audience, new.grade_levels, new.educational_category, new.author_name, new.theme_id, new.levels) then
    insert into devotional_revisions (devotional_id, editor_id, snapshot)
    values (old.id, auth.uid(), to_jsonb(old) - 'search');
  end if;
  return null;
end $$;


-- Same lockdown as 0008: nothing new is callable by anonymous visitors. The check
-- constraint runs as the writer, so signed-in editors may call the validator.
revoke all on function devotional_levels_valid(jsonb) from public, anon;
grant execute on function devotional_levels_valid(jsonb) to authenticated;
revoke all on function devotional_levels_plain(jsonb) from public, anon, authenticated;
