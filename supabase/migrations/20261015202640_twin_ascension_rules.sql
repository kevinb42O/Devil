-- Twin Ascension: solo rules 7 / crew combat 20. Keep old results and RPCs.
-- Versioned crew RPCs prevent a new client from accidentally publishing into
-- revision 19 when connected to an older backend, and preserve old clients.
begin;
alter table public.abyss_replays drop constraint abyss_replays_rules_check;
alter table public.abyss_replays add constraint abyss_replays_rules_check check(rules in (4,5,6,7));
alter table public.abyss_crew_runs drop constraint abyss_crew_runs_rules_check;
alter table public.abyss_crew_runs add constraint abyss_crew_runs_rules_check check(rules in (18,19,20));
-- Legacy three-argument registration remains revision 19; v20 inserts explicitly.
create or replace function public.abyss_submit_score(p_name text, p_time_ms integer, p_kills integer, p_gems integer, p_rules integer)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); last_submit timestamptz;
begin
  if owner_id is null then raise exception 'Sign in to publish a score'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]' then raise exception 'Enter a name of 1–24 characters'; end if;
  if (p_rules is null or p_rules not in (6,7)) or p_time_ms is null or p_time_ms not between 1 and 86400000
    or p_kills is null or p_kills not between 0 and 10000000 or p_gems is null or p_gems not between 0 and 10000000
  then raise exception 'Invalid Survival result'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select submitted_at into last_submit from public.abyss_scores where player_id = owner_id and rules = p_rules;
  if last_submit > now() - interval '10 seconds' then raise exception 'Please wait before publishing again'; end if;
  insert into public.abyss_scores as s (player_id, rules, player_name, survival_ms, kills, gems)
  values (owner_id, p_rules, btrim(p_name), p_time_ms, p_kills, p_gems)
  on conflict (player_id, rules) do update set
    player_name = case when excluded.survival_ms >= s.survival_ms then excluded.player_name else s.player_name end,
    survival_ms = greatest(s.survival_ms, excluded.survival_ms),
    kills = case when excluded.survival_ms > s.survival_ms then excluded.kills else s.kills end,
    gems = case when excluded.survival_ms > s.survival_ms then excluded.gems else s.gems end,
    achieved_at = case when excluded.survival_ms > s.survival_ms then now() else s.achieved_at end,
    submitted_at = now();
end;
$$;

create or replace function abyss_private.abyss_reserve_replay(p_slot integer,p_run_id text,p_name text,p_rules integer,p_time_ms integer,p_kills integer,p_gems integer,p_practice boolean,p_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result uuid; last_upload timestamptz;
begin
 if owner_id is null then raise exception 'Sign in to share a replay'; end if;
 if p_slot is null or p_slot not between 0 and 3 or p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]'
  or p_run_id is null or p_run_id !~ '^[a-zA-Z0-9_-]{1,80}$' or p_rules is null or p_rules not in (4,5,6,7)
  or p_time_ms is null or p_time_ms not between 1 and 3000000 or p_kills is null or p_kills not between 0 and 10000000
  or p_gems is null or p_gems not between 0 and 10000000 or p_practice is null or p_bytes is null or p_bytes not between 1 and 2097152
 then raise exception 'Invalid replay metadata'; end if;
 -- Serialize capacity reservations; the budget includes unfinished uploads.
 perform pg_advisory_xact_lock(hashtextextended('abyss-replay-budget',0));
 if p_slot=0 and (p_practice or not exists(select 1 from public.abyss_scores s where s.player_id=owner_id and s.rules=p_rules and s.survival_ms=p_time_ms and s.kills=p_kills and s.gems=p_gems)) then
  raise exception 'Replay must match your own registered best'; end if;
 if exists(select 1 from public.abyss_replays where player_id=owner_id and slot=p_slot) then raise exception 'Remove the replay in this slot before replacing it'; end if;
 select reserved_at into last_upload from abyss_private.replay_limits where player_id=owner_id;
 if last_upload>now()-interval '30 seconds' then raise exception 'Please wait 30 seconds between replay uploads'; end if;
 if (select coalesce(sum(case when ready then bytes else 2097152 end),0) from public.abyss_replays)+(select coalesce(sum(case when ready then bytes else 8388608 end),0) from public.abyss_crew_replays)+2097152>536870912 then raise exception 'Replay storage is full. File export still works'; end if;
 insert into public.abyss_replays(player_id,slot,run_id,player_name,rules,survival_ms,kills,gems,practice,bytes)
 values(owner_id,p_slot,p_run_id,btrim(p_name),p_rules,p_time_ms,p_kills,p_gems,p_practice,p_bytes) returning id into result;
 insert into abyss_private.replay_limits values(owner_id,now()) on conflict(player_id) do update set reserved_at=now();
 return result;
end;
$$;

create or replace function abyss_private.crew_register_v20(p_session text,p_epoch integer,p_roster jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.abyss_crew_runs; host_slot integer;
begin
 if actor is null then raise exception 'Sign in to register your party';end if;
 if p_session is null or p_session !~ '^[A-Za-z0-9_-]{1,80}$' or p_epoch is null or p_epoch not between 1 and 1000000000
  or not abyss_private.valid_crew_roster(p_roster) or jsonb_array_length(p_roster)<2 then raise exception 'Invalid party';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into r from public.abyss_crew_runs where owner_id=actor and source_session=p_session and source_epoch=p_epoch;
 if found then if r.rules<>20 then raise exception 'Party uses different gameplay rules';end if;if r.roster<>p_roster then raise exception 'Party already registered with different members';end if;
 else
  if (select count(*) from public.abyss_crew_runs where owner_id=actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Please wait before registering more runs';end if;
  insert into public.abyss_crew_runs(owner_id,source_session,source_epoch,roster,rules) values(actor,p_session,p_epoch,p_roster,20) returning * into r;
 end if;
 select ordinality-1 into host_slot from jsonb_array_elements(p_roster) with ordinality where (value->>'host')::boolean;
 insert into public.abyss_crew_members values(r.id,host_slot,actor) on conflict do nothing;
 return jsonb_build_object('id',r.id,'key',r.join_key,'state',r.state);
end;$$;

create or replace function abyss_private.crew_board_v20(p_size integer,p_search text default '',p_offset integer default 0) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=20 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where coalesce(p_search,'')='' or exists(select 1 from jsonb_array_elements(r.roster) m where strpos(lower(m->>'name'),lower(left(p_search,24)))>0)
 order by b.rank limit 100 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;

create or replace function abyss_private.crew_my_bests_v20(p_size integer) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=20 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where auth.uid() is not null and exists(select 1 from public.abyss_crew_members m where m.run_id=r.id and m.player_id=auth.uid()) order by b.rank limit 100;
$$;

create or replace function abyss_private.podium_skin_rank(p_player uuid) returns integer
language sql stable security definer set search_path='' as $$
 select ranked.place::integer from (
  select s.player_id,row_number() over(order by s.survival_ms desc,s.achieved_at,s.player_id) place
  from public.abyss_scores s where s.rules=7
 ) ranked where ranked.player_id=p_player and ranked.place<=3;
$$;

create function abyss_private.crew_submit_v20(p_id uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.abyss_crew_runs where id=p_id and owner_id=auth.uid() and rules=20) then raise exception 'Party uses different gameplay rules';end if;
 return abyss_private.crew_submit(p_id,p_client_run,p_roster,p_ticks,p_time_ms,p_kills,p_gems);
end;$$;
revoke all on function abyss_private.crew_register_v20(text,integer,jsonb),abyss_private.crew_submit_v20(uuid,text,jsonb,integer,integer,integer,integer),abyss_private.crew_board_v20(integer,text,integer),abyss_private.crew_my_bests_v20(integer) from public,anon,authenticated;
grant execute on function abyss_private.crew_register_v20(text,integer,jsonb),abyss_private.crew_submit_v20(uuid,text,jsonb,integer,integer,integer,integer),abyss_private.crew_my_bests_v20(integer) to authenticated;
grant execute on function abyss_private.crew_board_v20(integer,text,integer) to anon,authenticated;
create function public.abyss_crew_register_v20(p_session text,p_epoch integer,p_roster jsonb) returns jsonb language sql security invoker set search_path='' as $$select abyss_private.crew_register_v20(p_session,p_epoch,p_roster);$$;
create function public.abyss_crew_submit_v20(p_id uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer) returns jsonb language sql security invoker set search_path='' as $$select abyss_private.crew_submit_v20(p_id,p_client_run,p_roster,p_ticks,p_time_ms,p_kills,p_gems);$$;
create function public.abyss_crew_board_v20(p_size integer,p_search text default '',p_offset integer default 0) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid) language sql stable security invoker set search_path='' as $$select * from abyss_private.crew_board_v20(p_size,p_search,p_offset);$$;
create function public.abyss_crew_my_bests_v20(p_size integer) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid) language sql stable security invoker set search_path='' as $$select * from abyss_private.crew_my_bests_v20(p_size);$$;
revoke all on function public.abyss_crew_register_v20(text,integer,jsonb),public.abyss_crew_submit_v20(uuid,text,jsonb,integer,integer,integer,integer),public.abyss_crew_board_v20(integer,text,integer),public.abyss_crew_my_bests_v20(integer) from public,anon,authenticated;
grant execute on function public.abyss_crew_register_v20(text,integer,jsonb),public.abyss_crew_submit_v20(uuid,text,jsonb,integer,integer,integer,integer),public.abyss_crew_my_bests_v20(integer) to authenticated;
grant execute on function public.abyss_crew_board_v20(integer,text,integer) to anon,authenticated;
commit;
