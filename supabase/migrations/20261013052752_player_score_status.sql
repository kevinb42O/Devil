begin;
-- The caller's score only; IDs and other account details stay private.
create or replace function public.abyss_my_score(p_rules integer)
returns table(player_name text, survival_ms integer, kills integer, gems integer, achieved_at timestamptz, rank bigint)
language sql stable security definer set search_path = '' as $$
 select s.player_name, s.survival_ms, s.kills, s.gems, s.achieved_at,
  1 + (select count(*) from public.abyss_scores ahead where ahead.rules=s.rules and
   (ahead.survival_ms > s.survival_ms or
    (ahead.survival_ms=s.survival_ms and (ahead.achieved_at,ahead.player_id)<(s.achieved_at,s.player_id))))
 from public.abyss_scores s where s.player_id=auth.uid() and s.rules=p_rules;
$$;
revoke all on function public.abyss_my_score(integer) from public, anon, authenticated;
grant execute on function public.abyss_my_score(integer) to authenticated;
revoke all on function public.abyss_submit_score(text, integer, integer, integer, integer) from public, anon;
commit;
