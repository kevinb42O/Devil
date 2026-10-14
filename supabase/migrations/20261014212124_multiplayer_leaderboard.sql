begin;
create table public.abyss_crew_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 join_key uuid not null default gen_random_uuid(), source_session text not null, source_epoch integer not null,
 roster jsonb not null, party_key text, rules integer not null default 18 check(rules=18),
 state text not null default 'registering' check(state in ('registering','locked','complete','shared')),
 client_run_id text, ticks integer, survival_ms integer, kills integer, gems integer,
 created_at timestamptz not null default now(), locked_at timestamptz, achieved_at timestamptz,
 unique(owner_id,source_session,source_epoch), unique(owner_id,client_run_id)
);
create table public.abyss_crew_members (
 run_id uuid not null references public.abyss_crew_runs(id) on delete cascade,
 slot smallint not null check(slot between 0 and 3), player_id uuid not null references auth.users(id),
 primary key(run_id,slot), unique(run_id,player_id)
);
create table public.abyss_crew_bests (
 party_key text not null, rules integer not null, party_size smallint not null check(party_size between 2 and 4),
 run_id uuid not null references public.abyss_crew_runs(id), survival_ms integer not null, achieved_at timestamptz not null,
 primary key(party_key,rules,party_size)
);
create index abyss_crew_ranking on public.abyss_crew_bests(rules,party_size,survival_ms desc,achieved_at,run_id);
create index abyss_crew_member_identity on public.abyss_crew_members(player_id,run_id);
create table public.abyss_crew_replays (
 id uuid primary key default gen_random_uuid(), run_id uuid not null unique references public.abyss_crew_runs(id),
 owner_id uuid not null references auth.users(id), manual_slot smallint check(manual_slot between 1 and 3),
 bytes integer not null check(bytes between 1 and 8388608), digest text not null check(digest ~ '^[a-f0-9]{64}$'),
 ready boolean not null default false, created_at timestamptz not null default now(),
 unique(owner_id,manual_slot)
);
create index abyss_crew_replay_owner on public.abyss_crew_replays(owner_id);
create table abyss_private.crew_limits(owner_id uuid primary key references auth.users(id),reserved_at timestamptz not null);
alter table public.abyss_crew_runs enable row level security;
alter table public.abyss_crew_members enable row level security;
alter table public.abyss_crew_bests enable row level security;
alter table public.abyss_crew_replays enable row level security;
alter table abyss_private.crew_limits enable row level security;
revoke all on public.abyss_crew_runs,public.abyss_crew_members,public.abyss_crew_bests,public.abyss_crew_replays,abyss_private.crew_limits from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('abyss-crew-replays','abyss-crew-replays',true,8388608,array['application/gzip']);

create function abyss_private.valid_crew_roster(p jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare member jsonb; ids text[]:=array[]::text[]; hosts integer:=0;
begin
 if p is null or jsonb_typeof(p)<>'array' or jsonb_array_length(p) not between 1 and 4 then return false;end if;
 for member in select value from jsonb_array_elements(p) loop
  if jsonb_typeof(member)<>'object' or coalesce(member->>'id','') !~ '^[A-Za-z0-9_-]{1,64}$'
   or coalesce(char_length(btrim(member->>'name')),0) not between 1 and 24 or (member->>'name') ~ '[[:cntrl:]]'
   or jsonb_typeof(member->'host') is distinct from 'boolean' or member->>'id'=any(ids)
   or (select count(*) from jsonb_object_keys(member))<>3 then return false;end if;
  ids:=array_append(ids,member->>'id');if (member->>'host')::boolean then hosts:=hosts+1;end if;
 end loop;return hosts=1;
end;$$;

create function abyss_private.crew_register(p_session text,p_epoch integer,p_roster jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); r public.abyss_crew_runs; host_slot integer;
begin
 if actor is null then raise exception 'Sign in to register your party';end if;
 if p_session is null or p_session !~ '^[A-Za-z0-9_-]{1,80}$' or p_epoch is null or p_epoch not between 1 and 1000000000
  or not abyss_private.valid_crew_roster(p_roster) or jsonb_array_length(p_roster)<2 then raise exception 'Invalid party';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into r from public.abyss_crew_runs where owner_id=actor and source_session=p_session and source_epoch=p_epoch;
 if found then if r.roster<>p_roster then raise exception 'Party already registered with different members';end if;
 else
  if (select count(*) from public.abyss_crew_runs where owner_id=actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Please wait before registering more runs';end if;
  insert into public.abyss_crew_runs(owner_id,source_session,source_epoch,roster) values(actor,p_session,p_epoch,p_roster) returning * into r;
 end if;
 select ordinality-1 into host_slot from jsonb_array_elements(p_roster) with ordinality where (value->>'host')::boolean;
 insert into public.abyss_crew_members values(r.id,host_slot,actor) on conflict do nothing;
 return jsonb_build_object('id',r.id,'key',r.join_key,'state',r.state);
end;$$;

create function abyss_private.crew_confirm(p_id uuid,p_key uuid,p_player text,p_name text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.abyss_crew_runs; target integer;
begin
 if auth.uid() is null then raise exception 'Sign in to confirm party membership';end if;
 select * into r from public.abyss_crew_runs where id=p_id for update;
 if not found or r.join_key<>p_key or r.created_at<now()-interval '30 minutes' then raise exception 'Party invitation expired';end if;
 select ordinality-1 into target from jsonb_array_elements(r.roster) with ordinality where value->>'id'=p_player and value->>'name'=p_name and not (value->>'host')::boolean;
 if target is null then raise exception 'Membership does not match the party';end if;
 if exists(select 1 from public.abyss_crew_members where run_id=p_id and slot=target and player_id=auth.uid()) then return true;end if;
 if r.state<>'registering' then raise exception 'Party already locked';end if;
 insert into public.abyss_crew_members values(p_id,target,auth.uid());return true;
end;$$;

create function abyss_private.crew_lock(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare r public.abyss_crew_runs; members integer; identity text;
begin
 select * into r from public.abyss_crew_runs where id=p_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Only the host can lock this party';end if;
 if r.state='locked' then return true;end if;
 if r.state<>'registering' or r.created_at<now()-interval '30 minutes' then raise exception 'Party registration expired';end if;
 select count(*),string_agg(player_id::text,',' order by player_id::text) into members,identity from public.abyss_crew_members where run_id=p_id;
 if members<>jsonb_array_length(r.roster) then return false;end if;
 update public.abyss_crew_runs set party_key=identity,state='locked',locked_at=now() where id=p_id;return true;
end;$$;

create function abyss_private.crew_submit(p_id uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer) returns jsonb
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
 elsif r.state='locked' then
  update public.abyss_crew_runs set state='complete',client_run_id=p_client_run,ticks=p_ticks,survival_ms=p_time_ms,kills=p_kills,gems=p_gems,achieved_at=now() where id=p_id returning * into r;
 else raise exception 'The party must be confirmed before publishing';end if;
 insert into public.abyss_crew_bests values(r.party_key,r.rules,jsonb_array_length(r.roster),r.id,r.survival_ms,r.achieved_at)
 on conflict(party_key,rules,party_size) do update set run_id=excluded.run_id,survival_ms=excluded.survival_ms,achieved_at=excluded.achieved_at
 where excluded.survival_ms>abyss_crew_bests.survival_ms;
 select run_id into winning from public.abyss_crew_bests where party_key=r.party_key and rules=r.rules and party_size=jsonb_array_length(r.roster);
 return jsonb_build_object('id',r.id,'best',winning=r.id,'timeMs',r.survival_ms);
end;$$;

create function abyss_private.crew_board(p_size integer,p_search text default '',p_offset integer default 0) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=18 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where coalesce(p_search,'')='' or exists(select 1 from jsonb_array_elements(r.roster) m where strpos(lower(m->>'name'),lower(left(p_search,24)))>0)
 order by b.rank limit 100 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
create function abyss_private.crew_my_bests(p_size integer) returns table(rank bigint,run_id uuid,roster jsonb,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with ranked as(select row_number() over(order by b.survival_ms desc,b.achieved_at,b.run_id) rank,b.* from public.abyss_crew_bests b where b.rules=18 and b.party_size=p_size)
 select b.rank,r.id,r.roster,r.survival_ms,r.kills,r.gems,r.achieved_at,rep.id from ranked b join public.abyss_crew_runs r on r.id=b.run_id
 left join public.abyss_crew_replays rep on rep.run_id=r.id and rep.ready
 where auth.uid() is not null and exists(select 1 from public.abyss_crew_members m where m.run_id=r.id and m.player_id=auth.uid()) order by b.rank limit 100;
$$;

create function abyss_private.crew_reserve(p_run uuid,p_client_run text,p_roster jsonb,p_ticks integer,p_time_ms integer,p_kills integer,p_gems integer,p_bytes integer,p_digest text,p_manual boolean default false) returns uuid
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
 elsif (select count(*) from public.abyss_crew_replays where owner_id=actor and manual_slot is null)>=10 then raise exception 'Your ten party replay slots are full. Remove an older hosted replay';end if;
 select coalesce(sum(case when ready then bytes else 8388608 end),0) into crew_bytes from public.abyss_crew_replays;
 if crew_bytes+8388608>268435456 or crew_bytes+8388608+(select coalesce(sum(case when ready then bytes else 2097152 end),0) from public.abyss_replays)>536870912 then raise exception 'Replay storage is full. Export still works';end if;
 insert into public.abyss_crew_replays(run_id,owner_id,manual_slot,bytes,digest) values(r.id,actor,target,p_bytes,p_digest) returning id into result;
 insert into abyss_private.crew_limits values(actor,now()) on conflict(owner_id) do update set reserved_at=now();
 return result;
end;$$;

create function abyss_private.crew_finish_replay(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.abyss_crew_replays r set ready=true where r.id=p_id and r.owner_id=auth.uid()
 and exists(select 1 from storage.objects o where o.bucket_id='abyss-crew-replays' and o.name=r.id::text||'.gz' and o.owner_id=auth.uid()::text and (o.metadata->>'size')::bigint=r.bytes);
 if not found then raise exception 'Replay upload could not be confirmed';end if;return true;
end;$$;
create function abyss_private.crew_forget_replay(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.abyss_crew_replays where id=p_id and owner_id=auth.uid()) then raise exception 'Replay does not belong to you';end if;
 if exists(select 1 from storage.objects where bucket_id='abyss-crew-replays' and name=p_id::text||'.gz') then raise exception 'Remove the file first';end if;
 delete from public.abyss_crew_replays where id=p_id and owner_id=auth.uid();return true;
end;$$;
create function abyss_private.crew_own_replays() returns table(id uuid,run_id uuid,client_run_id text,roster jsonb,ready boolean,bytes integer,manual_slot smallint,obsolete boolean,expired boolean)
language sql stable security definer set search_path='' as $$
 select rep.id,r.id,r.client_run_id,r.roster,rep.ready,rep.bytes,rep.manual_slot,
 rep.manual_slot is null and not exists(select 1 from public.abyss_crew_bests b where b.run_id=r.id),not rep.ready and rep.created_at<now()-interval '15 minutes'
 from public.abyss_crew_replays rep join public.abyss_crew_runs r on r.id=rep.run_id where rep.owner_id=auth.uid() order by rep.created_at desc;
$$;
create function abyss_private.crew_replay(p_id uuid) returns table(id uuid,client_run_id text,roster jsonb,survival_ms integer,ticks integer,kills integer,gems integer,bytes integer,digest text,rules integer)
language sql stable security definer set search_path='' as $$
 select rep.id,r.client_run_id,r.roster,r.survival_ms,r.ticks,r.kills,r.gems,rep.bytes,rep.digest,r.rules from public.abyss_crew_replays rep join public.abyss_crew_runs r on r.id=rep.run_id where rep.id=p_id and rep.ready;
$$;
create function abyss_private.can_upload_crew_replay(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.abyss_crew_replays r where r.owner_id=auth.uid() and not r.ready and r.created_at>now()-interval '15 minutes' and p_name=r.id::text||'.gz');
$$;
create policy abyss_crew_upload on storage.objects for insert to authenticated with check(bucket_id='abyss-crew-replays' and abyss_private.can_upload_crew_replay(name));
create policy abyss_crew_owner_read on storage.objects for select to authenticated using(bucket_id='abyss-crew-replays' and owner_id=auth.uid()::text);
create policy abyss_crew_owner_delete on storage.objects for delete to authenticated using(bucket_id='abyss-crew-replays' and owner_id=auth.uid()::text);

-- Exposed entry points invoke private implementations. Only two read APIs are public.
do $$
declare f record; args text; api text;
begin
 for f in select p.proname,p.proargnames,p.pronargs,p.provolatile,pg_get_function_identity_arguments(p.oid) signature,pg_get_function_result(p.oid) result
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='abyss_private' and p.proname in
 ('crew_register','crew_confirm','crew_lock','crew_submit','crew_board','crew_my_bests','crew_reserve','crew_finish_replay','crew_forget_replay','crew_own_replays','crew_replay') loop
  args:=coalesce(array_to_string(f.proargnames[1:f.pronargs],','),'');api:='abyss_'||f.proname;
  execute format('create function public.%I(%s) returns %s language sql %s security invoker set search_path=%L as %L',api,f.signature,f.result,case when f.provolatile='s' then 'stable' else 'volatile' end,'',format('select * from abyss_private.%I(%s)',f.proname,args));
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',api,f.signature);
  execute format('revoke all on function abyss_private.%I(%s) from public,anon,authenticated',f.proname,f.signature);
  execute format('grant execute on function public.%I(%s) to authenticated',api,f.signature);
  execute format('grant execute on function abyss_private.%I(%s) to authenticated',f.proname,f.signature);
  if f.proname in ('crew_board','crew_replay') then
   execute format('grant execute on function public.%I(%s) to anon',api,f.signature);
   execute format('grant execute on function abyss_private.%I(%s) to anon',f.proname,f.signature);
  end if;
 end loop;
end;$$;
revoke all on function abyss_private.valid_crew_roster(jsonb),abyss_private.can_upload_crew_replay(text) from public,anon,authenticated;
grant execute on function abyss_private.can_upload_crew_replay(text) to authenticated;

-- Both buckets use the same lock and account for both sets of reservations.
create or replace function abyss_private.abyss_reserve_replay(p_slot integer,p_run_id text,p_name text,p_rules integer,p_time_ms integer,p_kills integer,p_gems integer,p_practice boolean,p_bytes integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); result uuid; last_upload timestamptz;
begin
 if owner_id is null then raise exception 'Sign in to share a replay'; end if;
 if p_slot is null or p_slot not between 0 and 3 or p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]'
  or p_run_id is null or p_run_id !~ '^[a-zA-Z0-9_-]{1,80}$' or p_rules is null or p_rules not in (4,5,6)
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

commit;
