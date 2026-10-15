begin;
-- Read-only archive. Keep historical rules separate from current submissions.
create function abyss_private.crew_board_history(p_rules integer,p_size integer,p_search text default '',p_offset integer default 0)
returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as (
  select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.*
  from public.abyss_crew_bests b where b.rules=p_rules and p_rules in (18,19) and b.party_size=p_size
 )
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id
 from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where coalesce(p_search,'')='' or exists(select 1 from jsonb_array_elements(r.roster) m where strpos(lower(m->>'name'),lower(left(p_search,24)))>0)
 order by b.rank limit 100 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
revoke all on function abyss_private.crew_board_history(integer,integer,text,integer) from public,anon,authenticated;
grant execute on function abyss_private.crew_board_history(integer,integer,text,integer) to anon,authenticated;
create function public.abyss_crew_board_history(p_rules integer,p_size integer,p_search text default '',p_offset integer default 0)
returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security invoker set search_path='' as $$select * from abyss_private.crew_board_history(p_rules,p_size,p_search,p_offset);$$;
revoke all on function public.abyss_crew_board_history(integer,integer,text,integer) from public,anon,authenticated;
grant execute on function public.abyss_crew_board_history(integer,integer,text,integer) to anon,authenticated;
commit;
