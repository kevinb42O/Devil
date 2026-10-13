begin;
create table if not exists public.abyss_scores (
  player_id uuid not null references auth.users(id) on delete cascade,
  rules integer not null check (rules >= 6),
  player_name text not null check (char_length(player_name) between 1 and 24 and player_name = btrim(player_name)),
  survival_ms integer not null check (survival_ms between 1 and 86400000),
  kills integer not null check (kills between 0 and 10000000),
  gems integer not null check (gems between 0 and 10000000),
  achieved_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  primary key (player_id, rules)
);
alter table public.abyss_scores enable row level security;
revoke all on public.abyss_scores from anon, authenticated;
create index if not exists abyss_scores_ranking on public.abyss_scores (rules, survival_ms desc, achieved_at, player_id);
-- Expose only display data, never the anonymous account identifiers.
create or replace function public.abyss_leaderboard(p_rules integer)
returns table(player_name text, survival_ms integer, kills integer, gems integer, achieved_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.player_name, s.survival_ms, s.kills, s.gems, s.achieved_at
  from public.abyss_scores s where s.rules = p_rules
  order by s.survival_ms desc, s.achieved_at, s.player_id limit 100;
$$;
create or replace function public.abyss_submit_score(p_name text, p_time_ms integer, p_kills integer, p_gems integer, p_rules integer)
returns void language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := auth.uid(); last_submit timestamptz;
begin
  if owner_id is null then raise exception 'Sign in to publish a score'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 24 or p_name ~ '[[:cntrl:]]' then raise exception 'Enter a name of 1–24 characters'; end if;
  if p_rules is distinct from 6 or p_time_ms is null or p_time_ms not between 1 and 86400000
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
revoke all on function public.abyss_leaderboard(integer) from public;
revoke all on function public.abyss_submit_score(text, integer, integer, integer, integer) from public;
grant execute on function public.abyss_leaderboard(integer) to anon, authenticated;
grant execute on function public.abyss_submit_score(text, integer, integer, integer, integer) to authenticated;
commit;
