-- A contributor's short profile (name, bio, photo) by the devotional's Author name, for the small
-- window that opens when a reader clicks the author's name or photo. Matches an active contributor
-- the same way as contributor_photo_for() (0020): case and surrounding spaces do not matter.
-- Self-contained: safe to run once 0020 has been run.

create or replace function contributor_profile_for(p_name text) returns table (name text, bio text, photo text)
language sql stable security definer set search_path = public as $$
  select c.name, c.bio, c.photo from contributors c
  where auth.uid() is not null and c.active
    and lower(btrim(c.name)) = lower(btrim(p_name))
  order by c.updated_at desc limit 1
$$;
revoke all on function contributor_profile_for(text) from public, anon;
grant execute on function contributor_profile_for(text) to authenticated;
