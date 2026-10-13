begin;
-- Browser identities remain private. Publish one best per case-insensitive nickname.
-- Keep underlying personal records so this display change is reversible.
create or replace function public.abyss_leaderboard(p_rules integer)
returns table(player_name text, survival_ms integer, kills integer, gems integer, achieved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with winners as (
    select distinct on (lower(btrim(s.player_name))) s.*
    from public.abyss_scores s where s.rules = p_rules
    order by lower(btrim(s.player_name)), s.survival_ms desc, s.achieved_at, s.player_id
  )
  select w.player_name, w.survival_ms, w.kills, w.gems, w.achieved_at
  from winners w
  order by w.survival_ms desc, w.achieved_at, w.player_id limit 100;
$$;

-- The caller sees the same nickname best and rank as the public board,
-- including when the nickname was used from another browser profile.
create or replace function public.abyss_my_score(p_rules integer)
returns table(player_name text, survival_ms integer, kills integer, gems integer, achieved_at timestamptz, rank bigint)
language sql stable security definer set search_path = '' as $$
  with winners as (
    select distinct on (lower(btrim(s.player_name))) s.*
    from public.abyss_scores s where s.rules = p_rules
    order by lower(btrim(s.player_name)), s.survival_ms desc, s.achieved_at, s.player_id
  ), ranked as (
    select w.*, row_number() over (order by w.survival_ms desc, w.achieved_at, w.player_id) as position
    from winners w
  )
  select r.player_name, r.survival_ms, r.kills, r.gems, r.achieved_at, r.position
  from ranked r
  join public.abyss_scores own on own.player_id = auth.uid() and own.rules = p_rules
    and lower(btrim(own.player_name)) = lower(btrim(r.player_name));
$$;
revoke all on function public.abyss_leaderboard(integer) from public;
grant execute on function public.abyss_leaderboard(integer) to anon, authenticated;
revoke all on function public.abyss_my_score(integer) from public, anon, authenticated;
grant execute on function public.abyss_my_score(integer) to authenticated;
commit;
