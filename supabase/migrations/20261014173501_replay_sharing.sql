begin;
create schema if not exists abyss_private;
revoke all on schema abyss_private from public;
grant usage on schema abyss_private to authenticated;
create table public.abyss_replays (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references auth.users(id) on delete cascade,
 slot smallint not null check (slot between 0 and 3),
 run_id text not null check (run_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
 player_name text not null check (char_length(player_name) between 1 and 24),
 rules integer not null check (rules in (4,5,6)),
 survival_ms integer not null check (survival_ms between 1 and 3000000),
 kills integer not null check (kills between 0 and 10000000),
 gems integer not null check (gems between 0 and 10000000),
 practice boolean not null,
 bytes integer not null check (bytes between 1 and 2097152),
 ready boolean not null default false,
 created_at timestamptz not null default now(),
 unique(player_id,slot), unique(player_id,run_id)
);
alter table public.abyss_replays enable row level security;
revoke all on public.abyss_replays from anon, authenticated;
create table abyss_private.replay_limits (
 player_id uuid primary key references auth.users(id) on delete cascade,
 reserved_at timestamptz not null
);
alter table abyss_private.replay_limits enable row level security;
revoke all on abyss_private.replay_limits from public,anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('abyss-replays','abyss-replays',true,2097152,array['application/gzip']);

-- Only a bounded, authenticated reservation permits an immutable upload.
create function abyss_private.can_upload_replay(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.abyss_replays r where r.player_id=auth.uid()
   and p_name=r.id::text||'.gz' and not r.ready and r.created_at>now()-interval '15 minutes'
 );
$$;
revoke all on function abyss_private.can_upload_replay(text) from public,anon;
grant execute on function abyss_private.can_upload_replay(text) to authenticated;
create policy abyss_replay_upload on storage.objects for insert to authenticated
 with check (bucket_id='abyss-replays' and abyss_private.can_upload_replay(name));
create policy abyss_replay_owner_read on storage.objects for select to authenticated
 using (bucket_id='abyss-replays' and owner_id=auth.uid()::text);
create policy abyss_replay_owner_delete on storage.objects for delete to authenticated
 using (bucket_id='abyss-replays' and owner_id=auth.uid()::text);

create function public.abyss_reserve_replay(p_slot integer,p_run_id text,p_name text,p_rules integer,p_time_ms integer,p_kills integer,p_gems integer,p_practice boolean,p_bytes integer)
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
 if (select coalesce(sum(case when ready then bytes else 2097152 end),0) from public.abyss_replays)+2097152>536870912 then raise exception 'Replay storage is full. File export still works'; end if;
 insert into public.abyss_replays(player_id,slot,run_id,player_name,rules,survival_ms,kills,gems,practice,bytes)
 values(owner_id,p_slot,p_run_id,btrim(p_name),p_rules,p_time_ms,p_kills,p_gems,p_practice,p_bytes) returning id into result;
 insert into abyss_private.replay_limits values(owner_id,now()) on conflict(player_id) do update set reserved_at=now();
 return result;
end;
$$;
create function public.abyss_finish_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to share a replay'; end if;
 update public.abyss_replays r set ready=true where r.id=p_id and r.player_id=auth.uid()
  and exists(select 1 from storage.objects o where o.bucket_id='abyss-replays' and o.name=r.id::text||'.gz'
   and o.owner_id=auth.uid()::text and (o.metadata->>'size')::bigint=r.bytes);
 if not found then raise exception 'Replay upload could not be confirmed'; end if;
end;
$$;
create function public.abyss_forget_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to remove a replay'; end if;
 if exists(select 1 from storage.objects where bucket_id='abyss-replays' and name=p_id::text||'.gz') then raise exception 'Remove the replay file first'; end if;
 delete from public.abyss_replays where id=p_id and player_id=auth.uid();
end;
$$;
create function public.abyss_own_replays() returns table(id uuid,slot smallint,run_id text,survival_ms integer,ready boolean,bytes integer)
language sql stable security definer set search_path='' as $$
 select r.id,r.slot,r.run_id,r.survival_ms,r.ready,r.bytes from public.abyss_replays r where auth.uid() is not null and r.player_id=auth.uid() order by r.slot;
$$;
create function public.abyss_replay(p_id uuid) returns table(id uuid,player_name text,survival_ms integer,rules integer,practice boolean,bytes integer)
language sql stable security definer set search_path='' as $$
 select r.id,r.player_name,r.survival_ms,r.rules,r.practice,r.bytes from public.abyss_replays r where r.id=p_id and r.ready;
$$;
-- Leave the existing RPC intact for deployed older clients.
create function public.abyss_leaderboard_replays(p_rules integer)
returns table(player_name text,survival_ms integer,kills integer,gems integer,achieved_at timestamptz,replay_id uuid)
language sql stable security definer set search_path='' as $$
 with winners as (
 select distinct on (lower(btrim(s.player_name))) s.* from public.abyss_scores s where s.rules=p_rules
 order by lower(btrim(s.player_name)),s.survival_ms desc,s.achieved_at,s.player_id
 )
 select w.player_name,w.survival_ms,w.kills,w.gems,w.achieved_at,r.id
 from winners w left join public.abyss_replays r on r.player_id=w.player_id and r.slot=0 and r.ready
  and r.rules=w.rules and r.survival_ms=w.survival_ms and r.kills=w.kills and r.gems=w.gems and not r.practice
 order by w.survival_ms desc,w.achieved_at,w.player_id limit 100;
$$;
revoke all on function public.abyss_reserve_replay(integer,text,text,integer,integer,integer,integer,boolean,integer) from public,anon;
revoke all on function public.abyss_finish_replay(uuid) from public,anon;
revoke all on function public.abyss_forget_replay(uuid) from public,anon;
revoke all on function public.abyss_own_replays() from public,anon;
grant execute on function public.abyss_reserve_replay(integer,text,text,integer,integer,integer,integer,boolean,integer),public.abyss_finish_replay(uuid),public.abyss_forget_replay(uuid),public.abyss_own_replays() to authenticated;
revoke all on function public.abyss_replay(uuid),public.abyss_leaderboard_replays(integer) from public;
grant execute on function public.abyss_replay(uuid),public.abyss_leaderboard_replays(integer) to anon,authenticated;
create function public.abyss_promote_replay(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to attach a replay'; end if;
 update public.abyss_replays r set slot=0 where r.id=p_id and r.player_id=auth.uid() and r.ready and not r.practice
  and exists(select 1 from public.abyss_scores s where s.player_id=auth.uid() and s.rules=r.rules and s.survival_ms=r.survival_ms and s.kills=r.kills and s.gems=r.gems);
 if not found then raise exception 'Replay must match your own registered best'; end if;
end;
$$;
revoke all on function public.abyss_promote_replay(uuid) from public,anon;
grant execute on function public.abyss_promote_replay(uuid) to authenticated;
-- Keep privileged implementation outside the exposed API schema.
-- Public RPCs are invoker wrappers; private functions retain explicit owner checks.
grant usage on schema abyss_private to anon;
do $$
declare f record; definition text; arguments text;
begin
 for f in select p.oid,p.proname,p.proargnames,p.pronargs,p.provolatile,
  pg_get_function_identity_arguments(p.oid) as signature,pg_get_function_result(p.oid) as result
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('abyss_reserve_replay','abyss_finish_replay','abyss_forget_replay','abyss_own_replays','abyss_replay','abyss_leaderboard_replays','abyss_promote_replay')
 loop
  definition:=replace(pg_get_functiondef(f.oid),'FUNCTION public.'||f.proname,'FUNCTION abyss_private.'||f.proname);
  execute definition;
  execute format('revoke all on function abyss_private.%I(%s) from public,anon,authenticated',f.proname,f.signature);
  execute format('grant execute on function abyss_private.%I(%s) to authenticated',f.proname,f.signature);
  if f.proname in ('abyss_replay','abyss_leaderboard_replays') then
   execute format('grant execute on function abyss_private.%I(%s) to anon',f.proname,f.signature);
  end if;
  arguments:=coalesce(array_to_string(f.proargnames[1:f.pronargs],','),'');
  execute format('create or replace function public.%I(%s) returns %s language sql %s security invoker set search_path=%L as %L',
   f.proname,f.signature,f.result,case when f.provolatile='s' then 'stable' else 'volatile' end,'',
   format('select * from abyss_private.%I(%s)',f.proname,arguments));
 end loop;
end;$$;
commit;
