begin;
-- Immediate publication: disable the replay inbox/worker path introduced during containment.
revoke execute on function public.abyss_queue_solo(text,text,integer,text) from authenticated,anon,public;
revoke execute on function public.abyss_verification_jobs(),public.abyss_decide_solo(uuid,boolean,integer,integer,integer,text) from service_role,authenticated,anon,public;
create table abyss_private.solo_tickets (
 id uuid primary key default gen_random_uuid(),player_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null default clock_timestamp(),
 player_name text,time_ms integer,kills integer,gems integer
);
create index solo_tickets_owner on abyss_private.solo_tickets(player_id,started_at);
alter table abyss_private.solo_tickets enable row level security;
revoke all on abyss_private.solo_tickets from public,anon,authenticated;
create function public.abyss_begin_solo() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();ticket uuid;begin
 if actor is null then raise exception 'Sign in to register a run';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if (select count(*) from abyss_private.solo_tickets where player_id=actor and started_at>clock_timestamp()-interval '1 hour')>=600 then raise exception 'Too many run starts. Try again later';end if;
 -- Reuse expired ticket slots, bounding storage without affecting score records.
 select id into ticket from abyss_private.solo_tickets where started_at<clock_timestamp()-interval '7 days' order by started_at for update skip locked limit 1;
 if found then
  update abyss_private.solo_tickets set id=gen_random_uuid(),player_id=actor,started_at=clock_timestamp(),player_name=null,time_ms=null,kills=null,gems=null where id=ticket returning id into ticket;
 else
  perform pg_advisory_xact_lock(hashtextextended('abyss-ticket-capacity',0));
  if (select count(*) from abyss_private.solo_tickets)>=64000 then raise exception 'Run registration is busy. Try again later';end if;
  insert into abyss_private.solo_tickets(player_id) values(actor) returning id into ticket;
 end if;
 return ticket;
end;$$;
create function public.abyss_submit_solo(p_ticket uuid,p_name text,p_time_ms integer,p_kills integer,p_gems integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();run abyss_private.solo_tickets;elapsed_ms numeric;begin
 if actor is null then raise exception 'Sign in to publish a score';end if;
 if p_ticket is null or p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]'
 or p_time_ms is null or p_time_ms not between 1 and 86400000
 or p_kills is null or p_kills not between 0 and 10000000 or p_gems is null or p_gems not between 0 and 10000000
 then raise exception 'Invalid Survival result';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 select * into run from abyss_private.solo_tickets where id=p_ticket and player_id=actor for update;
 if not found then raise exception 'A registered run is required';end if;
 -- Network retries can repeat the exact result; the ticket can never be edited or reused.
 if run.time_ms is not null then
  if run.time_ms=p_time_ms and run.kills=p_kills and run.gems=p_gems and run.player_name=btrim(p_name) then return;end if;
  raise exception 'This run ticket has already been used';
 end if;
 elapsed_ms:=extract(epoch from clock_timestamp()-run.started_at)*1000;
 if elapsed_ms>86400000 or p_time_ms>elapsed_ms+2000 then raise exception 'Score exceeds the registered run duration';end if;
 -- Conservative abuse filters, not proof of honest play. Allow short zero-kill runs.
 if (p_time_ms>600000 and p_kills=0 and p_gems=0)
 or p_kills::bigint>500+500*(p_time_ms::bigint/1000)
 or p_gems::bigint>500+500*(p_time_ms::bigint/1000)
 then raise exception 'Score failed the Survival sanity checks';end if;
 update abyss_private.solo_tickets set player_name=btrim(p_name),time_ms=p_time_ms,kills=p_kills,gems=p_gems where id=p_ticket;
 insert into public.abyss_scores as s(player_id,rules,player_name,survival_ms,kills,gems)
 values(actor,7,btrim(p_name),p_time_ms,p_kills,p_gems)
 on conflict(player_id,rules) do update set
 player_name=case when s.quarantined or excluded.survival_ms>=s.survival_ms then excluded.player_name else s.player_name end,
 survival_ms=case when s.quarantined then excluded.survival_ms else greatest(s.survival_ms,excluded.survival_ms) end,
 kills=case when s.quarantined or excluded.survival_ms>s.survival_ms then excluded.kills else s.kills end,
 gems=case when s.quarantined or excluded.survival_ms>s.survival_ms then excluded.gems else s.gems end,
 achieved_at=case when s.quarantined or excluded.survival_ms>s.survival_ms then now() else s.achieved_at end,
 submitted_at=now(),quarantined=false;
end;$$;
revoke all on function public.abyss_begin_solo(),public.abyss_submit_solo(uuid,text,integer,integer,integer) from public,anon;
grant execute on function public.abyss_begin_solo(),public.abyss_submit_solo(uuid,text,integer,integer,integer) to authenticated;
create or replace function public.abyss_submit_score(p_name text,p_time_ms integer,p_kills integer,p_gems integer,p_rules integer)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'A registered run is required. Refresh the game and start a new Survival run.';end;$$;
commit;
