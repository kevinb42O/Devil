-- Shotgun revision 19 has different combat balance. Preserve existing scores
-- and public replay links, but rank new runs only against the same rules.
begin;
alter table public.abyss_crew_runs drop constraint abyss_crew_runs_rules_check;
alter table public.abyss_crew_runs add constraint abyss_crew_runs_rules_check check(rules in (18,19));
alter table public.abyss_crew_runs alter column rules set default 19;

create or replace function abyss_private.crew_board(p_size integer,p_search text default '',p_offset integer default 0) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=19 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where coalesce(p_search,'')='' or exists(select 1 from jsonb_array_elements(r.roster) m where strpos(lower(m->>'name'),lower(left(p_search,24)))>0)
 order by b.rank limit 100 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
create or replace function abyss_private.crew_my_bests(p_size integer) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=19 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where auth.uid() is not null and exists(select 1 from public.abyss_crew_members m where m.run_id=r.id and m.player_id=auth.uid()) order by b.rank limit 100;
$$;
commit;
