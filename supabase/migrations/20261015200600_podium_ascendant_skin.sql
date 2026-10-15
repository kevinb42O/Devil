begin;
-- Only authenticated solo podium identities can mint a room-bound cosmetic proof.
-- Never expose account IDs, JWTs, or the proof table to game clients.
create schema if not exists abyss_private;
create table abyss_private.podium_skin_grants (
 player_id uuid primary key references auth.users(id) on delete cascade,
 token uuid not null unique default gen_random_uuid(),
 room text not null, peer_id text not null, expires_at timestamptz not null
);
alter table abyss_private.podium_skin_grants enable row level security;
revoke all on abyss_private.podium_skin_grants from public,anon,authenticated;

create function abyss_private.podium_skin_rank(p_player uuid) returns integer
language sql stable security definer set search_path='' as $$
 select ranked.place::integer from (
  select s.player_id,row_number() over(order by s.survival_ms desc,s.achieved_at,s.player_id) place
  from public.abyss_scores s where s.rules=6
 ) ranked where ranked.player_id=p_player and ranked.place<=3;
$$;
revoke all on function abyss_private.podium_skin_rank(uuid) from public,anon,authenticated;

create function abyss_private.claim_podium_skin(p_room text,p_peer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); place integer; proof abyss_private.podium_skin_grants;
begin
 if owner_id is null then raise exception 'Sign in with your leaderboard identity';end if;
 if p_room is null or p_room !~ '^[A-Z0-9_-]{1,64}$' or p_peer is null or p_peer !~ '^[A-Za-z0-9_-]{1,64}$' then raise exception 'Invalid lobby identity';end if;
 place:=abyss_private.podium_skin_rank(owner_id);
 if place is null then return null;end if;
 insert into abyss_private.podium_skin_grants as g(player_id,room,peer_id,expires_at)
 values(owner_id,p_room,p_peer,now()+interval '10 minutes')
 on conflict(player_id) do update set
  token=case when g.room=excluded.room and g.peer_id=excluded.peer_id and g.expires_at>now() then g.token else gen_random_uuid() end,
  room=excluded.room,peer_id=excluded.peer_id,expires_at=excluded.expires_at returning * into proof;
 return jsonb_build_object('token',proof.token,'rank',place);
end;$$;
revoke all on function abyss_private.claim_podium_skin(text,text) from public,anon,authenticated;
grant execute on function abyss_private.claim_podium_skin(text,text) to authenticated;

create function abyss_private.verify_podium_skin(p_token uuid,p_room text,p_peer text) returns integer
language sql stable security definer set search_path='' as $$
 select abyss_private.podium_skin_rank(g.player_id) from abyss_private.podium_skin_grants g
 where g.token=p_token and g.room=p_room and g.peer_id=p_peer and g.expires_at>now();
$$;
revoke all on function abyss_private.verify_podium_skin(uuid,text,text) from public,anon,authenticated;
grant execute on function abyss_private.verify_podium_skin(uuid,text,text) to anon,authenticated;

create function public.abyss_claim_podium_skin(p_room text,p_peer text) returns jsonb
language sql security invoker set search_path='' as $$select abyss_private.claim_podium_skin(p_room,p_peer);$$;
revoke all on function public.abyss_claim_podium_skin(text,text) from public,anon,authenticated;
grant execute on function public.abyss_claim_podium_skin(text,text) to authenticated;
create function public.abyss_verify_podium_skin(p_token uuid,p_room text,p_peer text) returns integer
language sql stable security invoker set search_path='' as $$select abyss_private.verify_podium_skin(p_token,p_room,p_peer);$$;
revoke all on function public.abyss_verify_podium_skin(uuid,text,text) from public,anon,authenticated;
grant execute on function public.abyss_verify_podium_skin(uuid,text,text) to anon,authenticated;
grant usage on schema abyss_private to anon,authenticated;
commit;
