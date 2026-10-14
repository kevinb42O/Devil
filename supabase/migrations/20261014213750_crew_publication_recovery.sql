begin;
-- Sharing before publication keeps the exact recording reusable for a later party best.
create or replace function abyss_private.crew_submit(p_id uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.abyss_crew_runs; winning uuid;
begin
 select * into r from public.abyss_crew_runs where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Only the registered host can publish this run';end if;
 if p_client_run is null or p_client_run !~ '^[A-Za-z0-9_-]{1,80}$' or p_roster is distinct from r.roster or p_ticks is null or p_ticks not between 1 and 216000
  or p_time_ms is null or abs(p_time_ms-round(p_ticks*1000.0/120))>1 or p_kills is null or p_kills not between 0 and 10000000
  or p_gems is null or p_gems not between 0 and 10000000 then raise exception 'Invalid completed party run';end if;
 if r.state='complete' then
  if r.client_run_id<>p_client_run or r.ticks<>p_ticks or r.survival_ms<>p_time_ms or r.kills<>p_kills or r.gems<>p_gems then raise exception 'Completed run is immutable';end if;
 elsif r.state in ('locked','shared') then
  if r.state='shared' and (r.client_run_id<>p_client_run or r.ticks<>p_ticks or r.survival_ms<>p_time_ms or r.kills<>p_kills or r.gems<>p_gems) then raise exception 'Shared recording must match the published score';end if;
  update public.abyss_crew_runs set state='complete',client_run_id=p_client_run,ticks=p_ticks,survival_ms=p_time_ms,kills=p_kills,gems=p_gems,achieved_at=now() where id=p_id returning * into r;
 else raise exception 'The party must be confirmed before publishing';end if;
 insert into public.abyss_crew_bests values(r.party_key,r.rules,jsonb_array_length(r.roster),r.id,r.survival_ms,r.achieved_at)
 on conflict(party_key,rules,party_size) do update set run_id=excluded.run_id,survival_ms=excluded.survival_ms,achieved_at=excluded.achieved_at
 where excluded.survival_ms>abyss_crew_bests.survival_ms;
 select run_id into winning from public.abyss_crew_bests where party_key=r.party_key and rules=r.rules and party_size=jsonb_array_length(r.roster);
 return jsonb_build_object('id',r.id,'best',winning=r.id,'timeMs',r.survival_ms);
end;$$;

create or replace function abyss_private.crew_reserve(p_run uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer,p_bytes integer,p_digest text,p_manual boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.abyss_crew_runs; rep public.abyss_crew_replays; target integer; last_upload timestamptz; crew_bytes bigint; result uuid;
begin
 if actor is null then raise exception 'Sign in to share a team replay';end if;
 if p_bytes is null or p_bytes not between 1 and 8388608 or p_digest is null or p_digest !~ '^[a-f0-9]{64}$' or not abyss_private.valid_crew_roster(p_roster)
  or p_client_run is null or p_client_run !~ '^[A-Za-z0-9_-]{1,80}$' or p_ticks is null or p_ticks not between 1 and 216000
  or p_time_ms is null or abs(p_time_ms-round(p_ticks*1000.0/120))>1 or p_kills is null or p_kills not between 0 and 10000000 or p_gems is null or p_gems not between 0 and 10000000 then raise exception 'Invalid replay metadata';end if;
 perform pg_advisory_xact_lock(hashtextextended('abyss-replay-budget',0));
 if p_run is not null then select * into r from public.abyss_crew_runs where id=p_run and owner_id=actor;
 else select * into r from public.abyss_crew_runs where owner_id=actor and client_run_id=p_client_run;end if;
 if r.id is null then raise exception 'Public replay sharing requires a confirmed party';end if;
 if coalesce(p_manual,false) and r.state='locked' and r.roster=p_roster then
  update public.abyss_crew_runs set state='shared',client_run_id=p_client_run,ticks=p_ticks,survival_ms=p_time_ms,kills=p_kills,gems=p_gems,achieved_at=now() where id=r.id returning * into r;
 end if;
 if r.state not in ('complete','shared') or r.client_run_id<>p_client_run or r.roster<>p_roster or r.ticks<>p_ticks or r.survival_ms<>p_time_ms or r.kills<>p_kills or r.gems<>p_gems then raise exception 'Replay must match its exact completed run';end if;
 select * into rep from public.abyss_crew_replays where run_id=r.id;
 if found then if rep.bytes<>p_bytes or rep.digest<>p_digest then raise exception 'Recording differs from its reservation';end if;return rep.id;end if;
 if not coalesce(p_manual,false) and not exists(select 1 from public.abyss_crew_bests where run_id=r.id) then raise exception 'This recording is no longer the party best';end if;
 if exists(select 1 from public.abyss_crew_replays where owner_id=actor and not ready) then raise exception 'Finish or remove your pending upload first';end if;
 select reserved_at into last_upload from abyss_private.crew_limits where owner_id=actor;
 if last_upload>now()-interval '30 seconds' then raise exception 'Please wait 30 seconds between uploads';end if;
 if coalesce(p_manual,false) then select n into target from generate_series(1,3)n where not exists(select 1 from public.abyss_crew_replays where owner_id=actor and manual_slot=n) limit 1;if target is null then raise exception 'Your three shared team replay slots are full';end if;
 elsif (select count(*) from public.abyss_crew_replays where owner_id=actor and manual_slot is null and exists(select 1 from public.abyss_crew_bests b where b.run_id=abyss_crew_replays.run_id))>=10 then raise exception 'Your ten party replay slots are full. Remove an older hosted replay';end if;
 select coalesce(sum(case when ready then bytes else 8388608 end),0) into crew_bytes from public.abyss_crew_replays;
 if crew_bytes+8388608>268435456 or crew_bytes+8388608+(select coalesce(sum(case when ready then bytes else 2097152 end),0) from public.abyss_replays)>536870912 then raise exception 'Replay storage is full. Export still works';end if;
 insert into public.abyss_crew_replays(run_id,owner_id,manual_slot,bytes,digest) values(r.id,actor,target,p_bytes,p_digest) returning id into result;
 insert into abyss_private.crew_limits values(actor,now()) on conflict(owner_id) do update set reserved_at=now();
 return result;
end;$$;


-- A participant can withdraw publication permission before combat/publication.
create function abyss_private.crew_revoke(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.abyss_crew_runs;
begin
 select * into r from public.abyss_crew_runs where id=p_id for update;
 if not found or auth.uid() is null or r.state not in ('registering','locked') then return false;end if;
 delete from public.abyss_crew_members where run_id=p_id and player_id=auth.uid();
 if not found then return false;end if;
 update public.abyss_crew_runs set state='registering',party_key=null,locked_at=null where id=p_id;return true;
end;$$;
revoke all on function abyss_private.crew_revoke(uuid) from public,anon,authenticated;
grant execute on function abyss_private.crew_revoke(uuid) to authenticated;
create function public.abyss_crew_revoke(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select abyss_private.crew_revoke(p_id); $$;
revoke all on function public.abyss_crew_revoke(uuid) from public,anon,authenticated;
grant execute on function public.abyss_crew_revoke(uuid) to authenticated;
commit;
