begin;
-- Incident containment is reversible: retain the original record for inspection.
alter table public.abyss_scores add column quarantined boolean not null default false;
update public.abyss_scores set quarantined=true
 where player_id='2a3b73ad-a1fd-418b-a6f5-20b311bc2562' and rules=7
 and player_name='fuck your vibecoded game' and survival_ms=5020208;
create view abyss_private.visible_scores as select * from public.abyss_scores where not quarantined;
revoke all on abyss_private.visible_scores from public,anon,authenticated;
-- Update every solo ranking consumer, including historical boards and honours.
do $$declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('abyss_leaderboard','abyss_my_score'))
 or (n.nspname='abyss_private' and p.proname in ('abyss_leaderboard_replays','podium_skin_rank'))
 loop execute replace(pg_get_functiondef(f.oid),'public.abyss_scores','abyss_private.visible_scores');end loop;
end;$$;

-- Old clients must fail closed. A public key and anonymous login are not proof of play.
create or replace function public.abyss_submit_score(p_name text,p_time_ms integer,p_kills integer,p_gems integer,p_rules integer)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'Replay verification required. Update the game to submit a recording.';end;$$;
revoke all on function public.abyss_submit_score(text,integer,integer,integer,integer) from public,anon;

create table abyss_private.solo_submissions (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references auth.users(id) on delete cascade,
 run_id text not null,player_name text not null,rules integer not null check(rules=7),
 time_ms integer not null check(time_ms between 1 and 1800000),
 replay text check(octet_length(replay) between 4 and 2796204),
 replay_digest text not null,
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 reason text not null default '',submitted_at timestamptz not null default now(),
 unique(player_id,rules)
);
alter table abyss_private.solo_submissions enable row level security;
revoke all on abyss_private.solo_submissions from public,anon,authenticated;

create function public.abyss_queue_solo(p_run_id text,p_name text,p_time_ms integer,p_replay text)
returns text language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();previous abyss_private.solo_submissions;begin
 if actor is null then raise exception 'Sign in to publish a score';end if;
 if p_run_id is null or p_run_id !~ '^[a-zA-Z0-9_-]{1,80}$'
 or p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]'
 or p_time_ms is null or p_time_ms not between 1 and 1800000
 or p_replay is null or octet_length(p_replay) not between 4 and 2796204
 or p_replay !~ '^[A-Za-z0-9+/]+={0,2}$' or length(p_replay)%4<>0
 then raise exception 'Invalid recording submission';end if;
 -- One global budget lock also serializes identity quotas and replacement.
 perform pg_advisory_xact_lock(hashtextextended('abyss-solo-verification',0));
 select * into previous from abyss_private.solo_submissions where player_id=actor and rules=7;
 if found and previous.run_id=p_run_id then
  if previous.replay_digest<>encode(sha256(convert_to(p_replay,'UTF8')),'hex') or previous.time_ms<>p_time_ms then raise exception 'Recording is immutable';end if;
  return previous.status;
 end if;
 if previous.submitted_at>now()-interval '30 seconds' then raise exception 'Please wait before submitting another recording';end if;
 if previous.status='pending' and previous.time_ms>p_time_ms then return 'pending';end if;
 if (select coalesce(sum(octet_length(replay)),0) from abyss_private.solo_submissions where status='pending' and player_id<>actor)+octet_length(p_replay)>67108864 then raise exception 'Verification queue is full. Keep your recording and retry later';end if;
 insert into abyss_private.solo_submissions(player_id,run_id,player_name,rules,time_ms,replay,replay_digest)
 values(actor,p_run_id,btrim(p_name),7,p_time_ms,p_replay,encode(sha256(convert_to(p_replay,'UTF8')),'hex'))
 on conflict(player_id,rules) do update set id=gen_random_uuid(),run_id=excluded.run_id,player_name=excluded.player_name,time_ms=excluded.time_ms,replay=excluded.replay,replay_digest=excluded.replay_digest,status='pending',reason='',submitted_at=now();
 return 'pending';
end;$$;
revoke all on function public.abyss_queue_solo(text,text,integer,text) from public,anon;
grant execute on function public.abyss_queue_solo(text,text,integer,text) to authenticated;

-- Only a trusted worker can read inputs or approve a score. Never grant these to a browser.
create function public.abyss_verification_jobs()
returns table(id uuid,run_id text,time_ms integer,replay text)
language sql security definer set search_path='' as $$
 select s.id,s.run_id,s.time_ms,s.replay from abyss_private.solo_submissions s
 where s.status='pending' order by s.submitted_at limit 4;
$$;
create function public.abyss_decide_solo(p_id uuid,p_accepted boolean,p_time_ms integer,p_kills integer,p_gems integer,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare job abyss_private.solo_submissions;begin
 select * into job from abyss_private.solo_submissions where id=p_id and status='pending' for update;
 if not found then return false;end if;
 if p_accepted is null then raise exception 'Missing decision';end if;
 if p_accepted then
  if p_time_ms is distinct from job.time_ms or p_kills is null or p_kills not between 0 and 10000000 or p_gems is null or p_gems not between 0 and 10000000 then raise exception 'Verified result does not match submission';end if;
  insert into public.abyss_scores as s(player_id,rules,player_name,survival_ms,kills,gems)
  values(job.player_id,job.rules,job.player_name,p_time_ms,p_kills,p_gems)
  on conflict(player_id,rules) do update set player_name=excluded.player_name,survival_ms=excluded.survival_ms,kills=excluded.kills,gems=excluded.gems,achieved_at=now(),submitted_at=now(),quarantined=false
   where s.quarantined or excluded.survival_ms>s.survival_ms;
 end if;
 update abyss_private.solo_submissions set status=case when p_accepted then 'accepted' else 'rejected' end,reason=left(coalesce(p_reason,''),240),replay=null
 where id=p_id;
 return true;
end;$$;
revoke all on function public.abyss_verification_jobs(),public.abyss_decide_solo(uuid,boolean,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.abyss_verification_jobs(),public.abyss_decide_solo(uuid,boolean,integer,integer,integer,text) to service_role;
commit;
