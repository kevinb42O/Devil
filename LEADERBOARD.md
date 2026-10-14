# Public leaderboard

The main menu and death screen offer **Public leaderboard**. Everyone can read the top 100 published solo Survival times. Before the first standard run, choose a nickname and whether new Survival bests publish automatically. You can also play without publishing. Edit the player profile from the menu or leaderboard. After every death, a score card explains whether the run was published, did not beat the public best, is waiting for a connection, or is unranked. With automatic publication off, the card offers **Publish this run**. Practice, weapon testing, development previews, multiplayer, and replay playback are excluded by the game.

Supabase project: [devildaggers](https://supabase.com/dashboard/project/kfxycrnatgvvdxubpsmy), in LanternNetwork. The game remains a static Vite build; Supabase supplies shared storage and anonymous player sessions. No separate game backend server is required.

Each browser gets an anonymous Supabase identity on its first publication. The saved nickname and publication preference are remembered locally. Its best time is retained per gameplay rules version; slower submissions cannot replace it. The public board keeps only the best time for each nickname (ignoring letter case and surrounding spaces), even across browser identities. Names are display labels, not verified accounts; people sharing a nickname share one public ranking. Underlying per-browser records are retained privately so this display rule is reversible. Clearing browser storage or using another device creates a new identity. Publishing sends the chosen name, survival time, kills and gems; it does not upload replay inputs.

## Deployment and database

`.env.production` contains the project's public URL and publishable browser key so production builds connect to the same board. These are public connection details, not administrative credentials. A `.env.local` override can configure development or another project. Never put a Supabase secret or service-role key in a `VITE_` variable.

All migrations in `supabase/migrations/` have been applied through the project's SQL Editor. On a different project, run those migrations and enable **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Rebuild after changing connection values.

`abyss_scores` uses row-level security and denies direct table access to both public and authenticated clients. Public access goes through `abyss_leaderboard`, returning only display fields. `abyss_submit_score` requires an authenticated identity, derives ownership from `auth.uid()`, validates values, serializes concurrent submissions, and limits publication to once per ten seconds per identity. The browser never supplies an owner ID. `abyss_my_score` uses the authenticated caller’s saved nickname to return its best public score and rank across browser profiles. Anonymous visitors cannot call that lookup or the submission function. The public board highlights your own row, shows your public best separately even outside the top 100, and supports nickname search. Rankings select the best score per normalized nickname before limiting to the top 100, then sort by time descending, achievement time, and player ID for stable ties.

## Reliable saving

Publication uses a durable best-score outbox (`abyss-pending-score` in localStorage). The best pending eligible run is retained with its chosen nickname before networking starts. A better run replaces a lower pending score; completing an older request cannot clear a newer higher run. Failed saves are retried on reconnect and every 15 seconds when automatic publication is enabled. Manual **Retry save** is available on the death screen and leaderboard. Starting another run does not cancel a pending save. A successful save is confirmed by reading the authenticated player’s own score from Supabase. Browser storage must be available for pending scores to survive reload.

## Limits

This is a casual community leaderboard. The browser reports scores; the database does not replay or independently verify the run. A modified client can bypass game-side eligibility and invent a score. Anonymous identities and display names do not establish a person's identity or stop someone making additional accounts. Supabase's anonymous-signup rate limits also apply. Strong anti-cheat and account recovery need separate work.

## Checks

`npm test` includes eligibility and score-queue regression checks: successive higher bests, saves overlapping later runs, duplicate saves, and recovery after network failure and reload. `npm run build` checks types and creates the production game. Integration checks cover public reading, blocked direct table access and unauthenticated publication, anonymous publication, best-time retention, and visibility from another browser.

## Replay sharing (14 October 2026)

New published solo bests retain an independent replay outbox in IndexedDB and upload their recording after the score is confirmed. A failed replay upload does not fail the score; the death screen offers **Retry replay upload**. Automatic publication retries replay uploads with a cooldown. The outbox preserves the best pending recording even when the ten-run history rotates.

The public board includes **Watch** only when a finalized recording belongs to the exact winning score's browser identity and matches its rules, time, kills and gems. Earlier scores cannot be reconstructed from score metadata. Open history and use **Attach to best** if that exact recording still exists locally; importing an old JSON export also makes attachment possible. Matching another browser's nickname does not grant permission to attach to its score.

History supports **Share**, **Copy link**, **Import replay**, and compressed **Export**. Shared links use `#replay=<UUID>` and display **Watch shared replay** on the menu. Sharing supports solo practice recordings as well as Survival. It does not record co-op. Public recordings contain gameplay inputs, seed, timestamps and run statistics; anonymous account identifiers are excluded from the file and public metadata. Anyone with a link can watch it. Removing a hosted link retains the local recording; previously downloaded copies cannot be revoked.

Recordings are losslessly packed into a versioned binary format with float64 aim/movement values, integer tick counts and button flags, then gzip-compressed. Existing JSON exports remain importable. Files are validated before simulation, with a 30-minute recording limit, bounded decompression (32 MiB), compatible rules/revision checks and input/tick validation. Cloud uploads are capped at 2 MiB; local exports can exceed that cloud cap. A synthetic ten-minute recording with continuously changing aim measured 9,945,885 JSON bytes, 2,664,504 binary bytes and approximately 1.13 MB after gzip. This is a reproducible synthetic benchmark, not a promise about real recordings.

Storage downloads occur only on Watch, never while listing scores. Up to ten downloaded recordings are cached in a separate local IndexedDB store. Seeking and repeated playback are local. Concurrent downloads of the same recording share one request. Immutable file paths use a one-year cache-control setting; the deployment's CDN behavior still determines cached versus uncached egress.

### Server limits and ownership

Migration `20261014173501_replay_sharing.sql` was applied through the authenticated game project's SQL Editor. It adds the public `abyss-replays` bucket and metadata RPCs while preserving the original score RPCs for older clients. The public API uses invoker wrappers around privileged implementations in the unexposed `abyss_private` schema. Raw replay metadata is inaccessible to browser roles; ownership derives from `auth.uid()` in authenticated RPCs. Storage upload policies require a fresh reservation belonging to the caller; overwriting objects is disallowed. Finalization checks the actual stored size and owner before exposing a replay. Storage deletion is owner-only.

Each browser identity has one leaderboard slot and three manually shared slots. A new leaderboard replay replaces its previous hosted replay, expiring that previous link. Manually shared recordings can be promoted to the best slot without another file upload. Reservations are limited to one per 30 seconds per identity. Unfinished uploads stay visible in history for removal and count against capacity.

The replay bucket has a conservative **512 MiB aggregate budget**: finalized files count their verified sizes; unfinished reservations count the full 2 MiB per-file maximum. The budget is serialized with a transaction lock. Other Supabase Storage buckets and all outbound traffic remain outside this feature's budget; this is not an account-wide bandwidth cap. Multiple anonymous identities can still be created, so these limits reduce quota exposure rather than proving identity or preventing all abuse. The server does not simulate recordings to verify scores.

Validation: `npm run test:replay-sharing`, `npx tsx tests/replay-sharing-live.ts` (requires game production connection settings), and `npm run build`. The live check creates temporary anonymous test profiles, tests upload/download and cross-owner access, then removes its replay file and reservation without modifying existing highscores.
