begin;
-- Ascendant skins are awarded only from the active solo rules board.
create or replace function abyss_private.podium_skin_rank(p_player uuid) returns integer
language sql stable security definer set search_path='' as $$
 select ranked.place::integer from (
  select s.player_id,row_number() over(order by s.survival_ms desc,s.achieved_at,s.player_id) place
  from public.abyss_scores s where s.rules=7
 ) ranked where ranked.player_id=p_player and ranked.place<=3;
$$;
revoke all on function abyss_private.podium_skin_rank(uuid) from public,anon,authenticated;
commit;
