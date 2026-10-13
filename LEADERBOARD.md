# Public leaderboard

The main menu and death screen offer **Public leaderboard**. Everyone can read the top 100 published solo Survival times. Before the first standard run, choose a nickname and whether new Survival bests publish automatically. You can also play without publishing. Edit the player profile from the menu or leaderboard. After every death, a score card explains whether the run was published, did not beat the public best, is waiting for a connection, or is unranked. With automatic publication off, the card offers **Publish this run**. Practice, weapon testing, development previews, multiplayer, and replay playback are excluded by the game.

Supabase project: [devildaggers](https://supabase.com/dashboard/project/kfxycrnatgvvdxubpsmy), in LanternNetwork. The game remains a static Vite build; Supabase supplies shared storage and anonymous player sessions. No separate game backend server is required.

Each browser gets an anonymous Supabase identity on its first publication. The saved nickname and publication preference are remembered locally. Its best time is retained per gameplay rules version; slower submissions cannot replace it. Names are display labels, not unique accounts. Clearing browser storage or using another device creates a new identity. Publishing sends the chosen name, survival time, kills and gems; it does not upload replay inputs.

## Deployment and database

`.env.production` contains the project's public URL and publishable browser key so production builds connect to the same board. These are public connection details, not administrative credentials. A `.env.local` override can configure development or another project. Never put a Supabase secret or service-role key in a `VITE_` variable.

Both migrations in `supabase/migrations/` have been applied through the project's SQL Editor. On a different project, run those migrations and enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Rebuild after changing connection values.

`abyss_scores` uses row-level security and denies direct table access to both public and authenticated clients. Public access goes through `abyss_leaderboard`, returning only display fields. `abyss_submit_score` requires an authenticated identity, derives ownership from `auth.uid()`, validates values, serializes concurrent submissions, and limits publication to once per ten seconds per identity. The browser never supplies an owner ID. `abyss_my_score` returns only the authenticated caller’s own best and global rank. Anonymous visitors cannot call that lookup or the submission function. The public board highlights your own row, shows your public best separately even outside the top 100, and supports nickname search. Rankings sort by time descending, then achievement time, then player ID for stable ties.

## Reliable saving

Publication uses a durable best-score outbox (`abyss-pending-score` in localStorage). The best pending eligible run is retained with its chosen nickname before networking starts. A better run replaces a lower pending score; completing an older request cannot clear a newer higher run. Failed saves are retried on reconnect and every 15 seconds when automatic publication is enabled. Manual **Retry save** is available on the death screen and leaderboard. Starting another run does not cancel a pending save. A successful save is confirmed by reading the authenticated player’s own score from Supabase. Browser storage must be available for pending scores to survive reload.

## Limits

This is a casual community leaderboard. The browser reports scores; the database does not replay or independently verify the run. A modified client can bypass game-side eligibility and invent a score. Anonymous identities and display names do not establish a person's identity or stop someone making additional accounts. Supabase's anonymous-signup rate limits also apply. Strong anti-cheat and account recovery need separate work.

## Checks

`npm test` includes eligibility and score-queue regression checks: successive higher bests, saves overlapping later runs, duplicate saves, and recovery after network failure and reload. `npm run build` checks types and creates the production game. Integration checks cover public reading, blocked direct table access and unauthenticated publication, anonymous publication, best-time retention, and visibility from another browser.
