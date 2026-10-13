# Public leaderboard

The main menu and death screen offer **Public leaderboard**. Everyone can read the top 100 published solo Survival times. After a standard solo run, enter a public name and press **Publish this run**. Practice, weapon testing, development previews, multiplayer, and replay playback are excluded by the game.

Supabase project: [devildaggers](https://supabase.com/dashboard/project/kfxycrnatgvvdxubpsmy), in LanternNetwork. The game remains a static Vite build; Supabase supplies shared storage and anonymous player sessions. No separate game backend server is required.

Each browser gets an anonymous Supabase identity on its first publication. Its best time is retained per gameplay rules version; slower submissions cannot replace it. Names are display labels, not unique accounts. Clearing browser storage or using another device creates a new identity. Publishing sends the chosen name, survival time, kills and gems; it does not upload replay inputs.

## Deployment and database

`.env.production` contains the project's public URL and publishable browser key so production builds connect to the same board. These are public connection details, not administrative credentials. A `.env.local` override can configure development or another project. Never put a Supabase secret or service-role key in a `VITE_` variable.

The migration in `supabase/migrations/202610130001_leaderboard.sql` has been applied through the project's SQL Editor. On a different project, run that SQL and enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Rebuild after changing connection values.

`abyss_scores` uses row-level security and denies direct table access to both public and authenticated clients. Public access goes through `abyss_leaderboard`, returning only display fields. `abyss_submit_score` requires an authenticated identity, derives ownership from `auth.uid()`, validates values, serializes concurrent submissions, and limits publication to once per ten seconds per identity. The browser never supplies an owner ID. Rankings sort by time descending, then achievement time, then player ID for stable ties.

## Limits

This is a casual community leaderboard. The browser reports scores; the database does not replay or independently verify the run. A modified client can bypass game-side eligibility and invent a score. Anonymous identities and display names do not establish a person's identity or stop someone making additional accounts. Supabase's anonymous-signup rate limits also apply. Strong anti-cheat and account recovery need separate work.

## Checks

`npm test` includes eligibility checks. `npm run build` checks types and creates the production game. Integration checks cover public reading, blocked direct table access and unauthenticated publication, anonymous publication, best-time retention, and visibility from another browser.
