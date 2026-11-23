-- A small photo for each contributor, shown beside "Written by" on the reading page.
--
--   * Stored as a small data URL (the browser shrinks the picture to 96x96 before saving), so
--     no storage bucket is needed. JPEG or WebP only, at most about 45 KB.
--   * devotional_credits() returns it with each credit.
--   * contributor_photo_for(name) finds the photo of an active contributor whose name matches a
--     devotional's Author field, for devotionals that name an author without crediting one.
-- Self-contained: safe to run once 0007 has been run.

alter table contributors add column if not exists photo text;
alter table contributors drop constraint if exists contributors_photo_check;
alter table contributors add constraint contributors_photo_check
  check (photo is null or (photo ~ '^data:image/(jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(photo) <= 60000));

drop function if exists devotional_credits(uuid);
create function devotional_credits(p_devotional uuid) returns table (contributor_id uuid, name text, bio text, role text, photo text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.bio, dc.role, c.photo
  from devotional_contributors dc join contributors c on c.id = dc.contributor_id
  where dc.devotional_id = p_devotional and auth.uid() is not null
    and (devotional_is_live(p_devotional) or is_content_editor())
  order by case dc.role when 'author' then 0 when 'contributor' then 1 else 2 end, c.name
$$;
revoke all on function devotional_credits(uuid) from public, anon;
grant execute on function devotional_credits(uuid) to authenticated;

create or replace function contributor_photo_for(p_name text) returns text
language sql stable security definer set search_path = public as $$
  select c.photo from contributors c
  where auth.uid() is not null and c.active and c.photo is not null
    and lower(btrim(c.name)) = lower(btrim(p_name))
  order by c.updated_at desc limit 1
$$;
revoke all on function contributor_photo_for(text) from public, anon;
grant execute on function contributor_photo_for(text) to authenticated;
