# Multiplayer leaderboard and stored party replays

Delivery status: implemented in the shared workspace and verified on 14 October 2026. Both database migrations are applied. See LEADERBOARD.md for delivered behavior, limits and validation; the original proposed design below is retained as planning context.
Prepared: 14 October 2026.

This request expands the scope of `MULTIPLAYER_REPLAY_PLAN.md`. That document's host recording, checkpoint, camera, and transfer work remains useful, but its exclusions of a public leaderboard, persistent history, and uploads no longer apply to this feature. This document governs those decisions. Existing session-only lifecycle rules must be adapted: returning to a lobby may cancel an incomplete peer transfer, but must not delete a completed local replay or its publication outbox.

## 1. Product decisions

Add a Multiplayer tab to the public leaderboard. Every entry represents a party's completed Survival run and displays every participant's recorded name. Provide separate rankings for 2, 3, and 4 players, with 2 players as the default. A one-person crew run remains locally replayable but is excluded from both the multiplayer board and the solo board.

Rank by team survival time, ending on the authoritative team wipe. Current rules allow a 15-second respawn with 1-second protection; individual deaths are part of the same run. Kills and gems are team totals and supplementary information, not ranking tie-breakers. Ties use server achievement time, then immutable run ID, for stable ordering.

Show each party's best run for the selected gameplay rules and party size. Party identity is the unordered set of authenticated browser identities, resolved on the backend; names and which player hosted do not determine identity. Freeze display names, slot/color order, and host marker at arena start. Changing a nickname does not rewrite an old result. Reversing host or joining order does not create another party best. A changed membership is a new party.

This extends today's browser identity model. Clearing browser data can create a new identity, and duplicate display names can exist. Do not deduplicate multiplayer parties by names or claim names prove identity. Public UI may disambiguate same-name teammates by player color/slot. Account recovery and cross-device identity are later work.

A score may be published even if replay upload fails. Show Watch only after a complete recording is finalized and attached to the exact ranked run. Retain the matching replay locally and offer retry. Users can also Keep, Export, Import, and manually Share multiplayer recordings without publishing a score.

## 2. Existing code and gaps

| Current foundation | Required change |
| --- | --- |
| `src/leaderboard.ts` rejects crew runs and returns one player name | Separate typed crew score API, roster results, size filters and party ownership |
| `src/replay.ts` records one stream and calls `World.step()` | Dedicated crew format and playback via `World.stepCrew()` |
| `src/main.ts` clears `lastRun` on crew death and refuses solo replay with a crew session | Separate crew recording/results/replay context and lifecycle |
| `FriendsSession.step()` resolves actual input, staleness and waiting | Record at this authoritative boundary, including external mutations |
| `LobbyMember.id` is a transport ID, with host literally `host` | Add a private backend membership binding; never treat transport IDs as authenticated identity |
| Guests consume sampled snapshots and predict their own movement | Do not use guest snapshots or prediction as the source recording |
| `ArenaSnapshot` covers presentation state | Explicit complete simulation checkpoints, including hidden state |
| `SpectatorCamera` and `renderer.topDown` already exist | Reuse camera movement, add independent replay camera controller |
| `updateCrewModels()` hides the selected world's player | Show all living bodies for external replay cameras |
| Solo replay files have a 2 MiB cloud cap and fixed solo metadata | Separate crew codec, limits and cloud metadata |
| Solo sharing has one best slot and three manual slots per identity | Multiplayer references must attach to a run/party, independent of solo slots |

The existing solo crown remains tied to the solo leaderboard. No multiplayer crown behavior is included in this release.

## 3. Leaderboard and results experience

Leaderboard row example:

| Rank | Party | Survival | Team kills | Team gems | Replay |
| --- | --- | --- | --- | --- | --- |
| 1 | Kevin · Mira · Jules | 08:42.317 | 1,842 | 693 | Watch |

Use colored name chips with the complete roster; an optional lobby name can be a subtitle but cannot replace names. On narrow screens wrap names across lines. Do not hide people behind an unexplained “+2”. Expanded details show recorded date, player count, rules revision, host marker, final result, and available replay actions. Search matches any recorded teammate name; apply filtering before the result limit, with cursor pagination for deeper results. Return a caller's party best separately if it is outside the top 100.

Team-wipe results show the full roster, survival time, team stats and two independent statuses: Score and Replay. Actions: Watch team replay, Watch final 10 seconds, Keep, Export, Publish party best, and Retry upload when needed. Automatic publication is a saved opt-in; choose it in the lobby before a ranked run. Each member agrees to public names/replay sharing through their own authenticated membership confirmation. Offline or unconfirmed crews can still play and save locally, with a clear unranked reason.

Start local recording automatically when combat starts. Save to IndexedDB before starting uploads or replacing history. The host owns recording and publication; guests receive the final result and can download the same replay after it is ready. For offline results the reliable peer transfer described in the earlier plan allows guests to keep the complete recording locally. Their playback controls remain independent.

Opening Watch from the board downloads on demand, displays progress and opens a standalone replay viewer. Back returns to the same tab, party-size filter, search and scroll position. Watching from team results returns to those results. Host lobby-return/new-epoch events stop an in-session viewer safely; standalone/history playback does not require a live room. Do not accidentally close a crew by reusing solo `home()` for Back to results.

## 4. Ranked eligibility and failure policy

Require a standard arena start at time zero, 2–4 confirmed distinct identities, the supported rules revision, no practice/debug intervention, and a completed authoritative team wipe. Record the reason when eligibility changes. Courtyard and countdown time do not contribute to survival.

Freeze party size at arena start. A final disconnect or voluntary departure after combat starts makes the run unranked for version one; this avoids competing in a larger-party category after losing members. Retain their original names and disconnect event in the recording. Brief connection interruptions handled by existing recovery logic do not disqualify until the host actually drops a participant. Mid-run joins are already blocked; any future membership replacement must invalidate the ranked result.

Host closure, reload or loss before finalization yields an interrupted recording, not a fabricated completed result. Completed host recordings survive lobby return and browser reload through local storage. Host migration and recovering a full match after sudden host failure are explicitly outside version one.

Scores remain community submissions. Backend membership validation prevents one browser from authorizing another identity's participation; replay hashes detect transfer corruption. Neither establishes honest gameplay on a modified host. Independent server simulation/anti-cheat is a separate future feature.

## 5. Authoritative recording and playback

Introduce `RecordedCrewRun`, `CrewRunRecorder`, and `CrewReplayPlayer`. Keep solo formats 4/5/6 compatible and dispatch file handling by format. A crew header includes format version, gameplay revision, seed, simulation options, 120 Hz step rate, public run ID, creation time, initial roster order/names/colors, terminal tick/time/stats, completion/eligibility status and reasons. Public files use run-local player IDs, never auth UUIDs, JWTs, room invite codes, IPs or signaling credentials.

At `FriendsSession.step()`, record immutable copies of the effective per-player inputs and exact waiting set after command resolution, immediately before `stepCrew()`. Preserve numeric precision and original crew iteration order. Record ordered external mutations such as disconnects at their actual tick boundary. Keep terminal mutations even if no further simulation step occurs. Finalize once on the first transition to team wipe and never append after finalization. Capture start seed/options at `FriendsSession.start()`, before the first combat tick.

Use lossless input run-length encoding only when the whole transaction repeats without an intervening event. Log deaths, life numbers, respawns, upgrades, disconnects and final wipe in deterministic order. Do not infer a disconnected player's name from the final `members` list, which currently removes them. Capture observational death attribution without changing RNG or collision ordering.

Add explicit complete checkpoint capture/restore to the simulation. Audit RNG streams, scheduler cursor, delayed spawns, entity counters, world options, internal enemy states, projectile state, every player's weapon channel/shot state, shared upgrades, rings, pending detonations, aliases and object-keyed collections. A network snapshot is insufficient. Begin with an initial checkpoint, one approximately every five simulation seconds, and a terminal checkpoint; tune density after profiling. Hash canonical simulation state at checkpoints and check reconstruction against it. Stop on divergence with a useful error.

Run reconstruction in a scratch world. Seeking restores the nearest earlier checkpoint and advances recorded transactions in bounded work batches or a worker. Cancel obsolete seeks with request tokens and publish the finished scene atomically. Suppress sound during seeks, reset interpolation, and rebuild persistent blood/gore/tower presentation using bounded cosmetic history. Repeated seeks must not accumulate effects. Live host/guest worlds, inputs, network prediction and host clock must remain isolated from playback.

Stored recordings need a durable gameplay compatibility policy: bump crew gameplay revision when behavior changes, retain supported replay factories/legacy options, and maintain fixtures. A build ID is diagnostic, not the sole compatibility gate; unrelated UI releases should not break replays. Unsupported older files remain exportable with a clear playback message. Ship explicit supported revisions rather than silently replaying old rules with new behavior.

## 6. Replay cameras and controls

Mandatory first-release cameras: Free flight, Top view, and First person for a selected teammate. Third-person Follow is a useful subsequent enhancement and does not gate this request.

Free flight starts above the arena with every living teammate visible. Reuse spectator movement: configured keyboard movement/look, jump/E up, descend through the existing scheme-specific control, Shift boost; controller left stick moves, right stick looks, A/Cross up, LB/L1 down, left-stick click boost. Show a touch move/look interface plus accessible up/down controls. Resolve shortcuts centrally so keyboard layouts remain consistent. Clamp to a tested arena-centered volume and finite values; camera movement never changes recorded inputs or simulation state.

Top view uses the existing arena-centered downward camera as its starting point. Frame the full active arena at supported aspect ratios, including portrait/rotated mobile, with constrained pan/zoom and Reset view. Show every living avatar, readable player names/colors and optional short trails. Reuse the perspective top camera for version one; an orthographic camera is unnecessary unless usability tests show a benefit. Hide first-person hands and player-camera hop/FOV effects in both external views.

First person offers each recorded name in a player selector and restores that player's yaw, pitch, weapon channels, hand level and reserve. Selected-player death freezes their viewpoint at the death position and labels the player dead; Free flight and Top view remain available. Do not silently select a different teammate. Seeking into a respawn restores their later life. The roster panel shows alive/dead/disconnected and respawn countdown at the current replay time.

Play/Pause, 0.25×/0.5×/1×/2× speed, timeline slider, seek ±3/±10 seconds, jump to start/end, single-step while paused and event markers are shared across camera modes. Camera controls work while paused and after the terminal tick. Camera yaw/pitch must not be overwritten each frame by recorded aim, as the current solo replay loop does. Remember free-camera position when switching modes and reset smoothing on seek/life change.

Use separate real-time camera motion and simulation-time visuals: pause freezes arena animation, lighting/descent, particles and sound while allowing camera inspection. Set the sound listener to the active camera, stop loops on pause/seek/exit, and prevent menu music during arena replay. Pointer-lock loss releases camera input; hidden tabs suspend playback without fast-forward on return. Controller/touch UI must support all mandatory modes.

## 7. Backend identity and data model

Use the existing Supabase anonymous session per browser, established before requesting ranked membership. Add backend run registration: authenticated host creates a pending run; backend returns a public run ID and short-lived join capability, distinct from the WebRTC room code. Each participant calls the join/confirm endpoint themselves, binding their caller identity and current name to one slot and declaring publication preference. Match that confirmation to their transport connection through a run-specific token exchange. Never trust an arbitrary auth ID delivered over a peer channel.

Host locks the roster before combat; backend derives party identity from sorted confirmed member identities and issues the locked manifest. Expired/incomplete registration makes the run unranked without blocking play. Names, slots and publication preference are immutable for that run. Members may consent to all public storage, leaderboard-only, or neither; public replay upload requires all members' public-replay consent. A ranked score can exist without a public replay. Local watching/export remains available.

Proposed tables, with ownership data kept private:

| Table | Purpose and key fields |
| --- | --- |
| `crew_runs` | Public run UUID, private owner auth ID, private party key, rules/format revision, size, immutable roster hash, status, terminal tick/time, team stats, eligibility reason, server finalized time |
| `crew_run_members` | Run/slot unique, caller auth ID privately bound, public run-local player ID, frozen display name/color, host marker, consent; unique run/auth identity |
| `crew_bests` | Unique party/rules/size, exact winning run ID and ranking fields; atomic replacement only by a strictly better time |
| `crew_replays` | Replay UUID, run ID, private owner, object path, bytes, compressed hash, codec revision, state reserved/uploaded/ready/failed/deleting, reservation expiry |
| Private limit/cleanup records | Per-caller cooldown, concurrent reservations, quota accounting, deletion/retry work |

Public RPCs expose only display fields and ready replay IDs. Proposed contracts: register run, confirm membership, lock roster, finalize score, load crew board with size/rules/search/cursor, load caller's crew bests, reserve replay, finalize replay, list own recordings, and remove shared replay. Mutations derive the actor from `auth.uid()` and validate ownership and legal state transitions. Idempotency is by public run ID and request/replay ID, never score alone.

Rank query indexes cover rules/size/time descending/finalized time/run ID and unique party best lookup. Member-name search can start with bounded indexed normalized lookup; measure before adding specialized search infrastructure. Page metadata queries never fetch replay blobs.

Use RLS on exposed tables, deny direct raw access, and follow the existing invoker-wrapper/private-implementation pattern with fixed search paths, explicit caller checks and restricted execute grants. Keep service credentials out of the browser. Reservation-based immutable Storage uploads need INSERT authorization tied to the caller/run; deletion is owner-authorized through the lifecycle. This follows Supabase's [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) and [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 8. Publication, storage and replacement

Persist one outbox job per completed run, containing the frozen manifest, score, exact local recording reference and progression state. Preserve it independently of rolling replay history. Model progression as local saved → score pending → score confirmed → replay reserved → uploading → ready. Score and replay failures/retries are separate. Use bounded exponential backoff and reconnect retry, with visible manual retry. Late success for an older run must not clear newer jobs.

The backend finalization transaction validates the locked roster, completion metadata and bounds, then updates party best atomically. When a new score wins, immediately reference its run and show its replay pending/unavailable. Never expose the previous best's replay as the new score. An older upload finishing later attaches only to its original run. Concurrent hosts for the same party/rules converge on the highest time; exact ties retain the earlier established best.

Use a dedicated multiplayer replay bucket/metadata path so solo 2 MiB limits and slot behavior stay intact. A reservation allocates immutable object UUID/path and expires after 15 minutes; validate stored owner and byte size at finish. Browser downloads also validate compressed digest, header, roster, rules, terminal tick/time and stats against metadata. A digest is an integrity check, not gameplay proof. Server-side content parsing, if introduced, must be bounded and independently tested.

Provisional crew limits: 30-minute full recording, 8 MiB compressed cloud file, 64 MiB decoded data, no more than 4 participants, 3 manual shared replay slots per host, and 1 pending upload per host. These are test hypotheses, not measured guarantees. Measure real 2/3/4-player changing-input runs and dense checkpoints before locking limits. Larger valid local files may be exported; cloud rejection never deletes the local recording or score.

Keep one automatic replay for each active party best, subject to a per-owner cap of 10 automatic party recordings. At that cap, offer selecting which old hosted replay to remove; scores remain, their Watch action disappears. Never consume solo slots. Use a serialized aggregate reservation budget shared with solo: 512 MiB total feature storage initially, including actual finalized sizes and reserved maxima, with a separate crew allowance to prevent crowding solo storage. This requires one common budget ledger/lock across both upload paths, not two buckets each assuming they own the full budget. Failed/expired reservations count until object cleanup is confirmed.

A replacement cannot delete the old file before the new upload is finalized. Atomically swap the ready reference, then queue old unpinned storage for idempotent cleanup; manually shared files may remain within their slots. Delete through the Storage API and remove metadata only after successful deletion. An explicit hosted replay removal leaves its score and local file intact. Run membership records are independent of the uploader's identity lifecycle; uploader deletion must not blindly cascade away other members' party bests. Define cleanup for expired reservations, orphan objects and old unreferenced recordings before launch.

Public replay links use the existing `#replay=<UUID>` shape with metadata/file dispatch by kind. Cache on Watch in IndexedDB, deduplicate concurrent downloads, and limit cache by total bytes (initial target 64 MiB) as well as count. Playback/seek/repeated Watch uses local data. Removing a public link cannot revoke previously downloaded copies. Actual bandwidth cost requires measurement; a database storage budget does not cap egress.

## 9. Local history, transfer and lifecycle

Extend history with Solo/Multiplayer filtering, complete name lists, party size and unranked/interrupted labels. Keep 10 recent crew recordings subject to a byte budget, plus explicit kept runs with a visible storage-usage indicator. Outbox references are protected from eviction. Handle storage denial/full quota visibly; avoid reporting Saved before the transaction completes.

Use a dedicated reliable ordered peer replay channel for finalized recordings, with bounded chunks, backpressure, progress, cancellation, manifest size/hash checks and explicit run/epoch matching. Start only on guest request; prioritize live control traffic. Reject malformed/unsolicited/stale payloads and decompression expansion. Complete guest recordings remain usable after host departure; incomplete copies stay clearly unavailable. Guests can save/export, while version-one cloud publication remains host-owned to avoid competing upload ownership.

Retain completed host recordings across lobby return. Protect uploads and callbacks with run IDs/request tokens, not the current `friends.epoch` alone. A new run or viewer entry cannot replace the old outbox payload accidentally. Opening history or public playback creates an isolated viewer; explicit Exit determines whether to return to results/history/board/menu.

## 10. Delivery order and concrete work

1. **Lock semantics and fixtures.** Implement shared crew types, eligibility, roster/identity distinction and fixtures for 2/3/4-player wipes, respawns and disconnects. Finalize party-size and publication UI copy.
2. **Complete checkpoint contract.** Add simulation capture/restore and deterministic digest helpers. Prove uninterrupted and checkpoint-restored crew simulation match before building uploads.
3. **Recorder and codec.** Add `src/crew-replay.ts` and `src/crew-replay-file.ts`; hook authoritative start/step/drop/finalize paths in `src/multiplayer.ts`, including background host-clock ticks. Validate versioned binary records and bounded decode.
4. **Local viewer and history.** Add a focused replay controller/camera module, results actions, save/import/export, and renderer external-body mode. Deliver Free flight and Top view with pause/seek inspection before backend integration.
5. **Identity and score backend.** Add registration/membership/locked manifest and new score schema/RPCs; add `src/crew-leaderboard.ts` and a separate durable crew outbox. Create migrations using the CLI workflow, validate policies and idempotent concurrent updates in an isolated environment.
6. **Hosted replay pipeline.** Add `src/crew-replay-sharing.ts`, quota ledger integration, reservation/finalization/cleanup, links, cache, and exact-run attachment/replacement.
7. **Leaderboard UI and peer delivery.** Add tabs, size filters, complete names, search, rank details and Watch; finish guest transfer and disconnected-result handling. Split feature controllers out of `src/main.ts` rather than concentrating all new state there.
8. **Release verification and rollout.** Deploy additive backend changes first, enable recorder/viewer then publishing/Watch, and preserve older solo RPC behavior. Gate cloud features if the migration is unavailable, while local crew playback continues. Update README and LEADERBOARD documentation after implementation is verified.

The checkpoint audit and identity binding are the main engineering uncertainties. Recording size and seek performance are the main profiling uncertainties. Resolve these in early phases before setting a completion estimate.

## 11. Acceptance and regression checks

| Area | Required evidence |
| --- | --- |
| Names/party | All original names visible on board/results/replay, even after rename/drop; same identity set under a different host/order has one best; changed roster has another |
| Ranking | Separate 2/3/4 boards, correct team-wipe time, stable ties, best outside top 100, search before pagination; practice/debug/drop/interrupted runs rejected |
| Identity | Host cannot forge another member's confirmation, reuse expired join capability or mutate locked roster; repeated confirmation is idempotent |
| Fidelity | Same initial state plus host transactions produces identical checkpoint/final digests, including waiting, stale inputs, simultaneous deaths, respawn boundary, disconnect mutation and hidden-tab host ticks |
| Checkpoints | Restore every meaningful hidden field; random seek equals uninterrupted state; deliberately corrupted/divergent replays fail clearly |
| Cameras | Free flight and top view show every living body/name; move while paused/end; switch without changing simulation; first-person player/life/weapon matches recording |
| Presentation | Seek resets blood/gore/towers without duplication; pause freezes lighting and effects; no held fire leaks into live gameplay; audio listener follows camera |
| Durability | Offline/reload/new run/lobby return retain jobs; older request cannot clear newer job; guest complete copy survives host leave |
| Upload race | New winning score never shows old replay; late old finish never reattaches to new best; upload failure preserves score/local replay; replacement preserves old file until new ready |
| Access/quota | Cross-owner upload/delete/attach blocked, raw identities private, bucket/rules/file bounds checked, concurrent reservation budgets enforced, expired/orphan cleanup verified |
| Untrusted files | Wrong format/revision, non-finite values, invalid slot IDs/order/counts, malformed checkpoints, oversized lengths and decompression bombs rejected before world allocation |
| Compatibility | Solo leaderboard, best slots, file versions, history, sharing, champion, multiplayer transport/respawn/spectator behavior still pass |

Use unit tests for ranking/eligibility/outbox/codec/checkpoints, two-to-four-browser integration for recording and peer lifecycle, and isolated live-backend tests for ownership/quota/concurrency. Never publish synthetic test runs into real public rankings.

Initial performance targets to validate on named desktop and mobile devices: recorder p95 additional tick cost ≤1 ms; camera inspection responds within one frame; typical five-minute seeks complete within 250 ms desktop/750 ms mobile without long UI blocking; compression outside the gameplay hot path. Track peak memory across recording, checkpoint copies, compression, upload, decode and cosmetic rebuild together. If memory/size is exceeded, display replay unavailable/export-only and retain an honest completion status; never silently truncate and label a partial replay complete.

Release is complete when a real 2-, 3-, and 4-player party can finish, see every name in its appropriate public ranking, reload the page, download the exact run, and inspect it in Free flight and Top view, including paused deaths/respawns and arbitrary seeks, while the existing solo flow continues to work.
