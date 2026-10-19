begin;
-- Explicitly authorized fresh start: no archived scores or recordings are retained.
-- First empty abyss-replays and abyss-crew-replays through the Storage dashboard/API.
-- Do not delete storage.objects through SQL: that would orphan the actual files.
truncate table
 public.abyss_scores,
 public.abyss_replays,
 public.abyss_crew_bests,
 public.abyss_crew_replays,
 public.abyss_crew_members,
 public.abyss_crew_runs,
 abyss_private.solo_tickets,
 abyss_private.solo_submissions,
 abyss_private.replay_limits,
 abyss_private.crew_limits,
 abyss_private.podium_skin_grants;
-- Removing registrations also invalidates pending pre-reset score publications.
-- Keep current gameplay rules, identities, RPCs, RLS and empty replay buckets.
commit;
