# Multiplayer replay after a team wipe

Status: implemented in the working checkout. The original design below is retained for context; delivery notes describe the current behavior.
Prepared: 14 October 2026.

## Delivery notes

- Team-wipe results now offer full-run and final-ten-seconds playback. Individual deaths retain live spectating and revival. Keyboard, controller, mobile landscape, and rotated portrait are covered by real-browser checks.
- `src/crew-replay.ts` provides the shared `RecordedCrewRun`, compact exact Float64 input storage, complete simulation checkpoints, event/blood/tower-death metadata, cancellable seeking, validation, and a compressed binary codec. The public roster is frozen as exactly `{id, name, host}`; lobby readiness and authentication state are excluded.
- `src/crew-replay-viewer.ts` owns an isolated playback world and first-person/follow/free/top-down cameras. It rebuilds persistent blood, recent death bursts, aged hand/ground upgrades, and sinking tower poses after seeking. Controls can collapse to leave more of the arena visible. Live match state and room membership remain separate. Playback freezes at its terminal tick.
- `src/crew-replay-transfer.ts` delivers the recording on an ordered reliable channel with SHA-256 integrity, bounded 16 KiB chunks, 64 KiB queues, progress, retry, cancellation, and per-peer pacing. Three simultaneous guests share one compression/hash result. A complete guest recording survives host departure; lobby return/new epochs cancel old viewers and transfers.
- Simulation checkpoint spacing adapts to measured host tick cost (or entity density in fixtures), while reducing historical checkpoint density under memory pressure. This avoids replaying several expensive seconds synchronously during a seek. Inputs are never silently truncated.
- Initial resource limits are 64 MiB of estimated recorder data on desktop, 24 MiB on touch devices, 30 minutes per run, 32 MiB compressed, and 64 MiB decoded. Resource failures leave the game/results usable and explain why full replay is unavailable. These are data limits, not total browser-memory guarantees. Leaderboard storage applies its own smaller upload budget separately.
- The user's implementation follow-up added concurrent multiplayer leaderboard work. That implementation consumes this recording/codec/viewer, listens to `abyss-crew-run-finished`, and uses generic `crew-ranking:*` reliable controls plus `beforeArenaStart` for pre-run registration. It owns cloud storage, publication, local history, consent, and leaderboard UI. The original menu/history exclusion below applies to the initial in-game scope, not this later authorized extension.
- `npm run test:crew-replay` passed all 16 unit tests plus real-browser checks covering exact reconstruction, compressed loading, corruption/oversize rejection, host/guest lifecycle, three guest transfers/backpressure, all camera choices, keyboard, controller loss/reconnection, touch flight/seeking, and seek cosmetic reconstruction. The full project suite passed 350 tests and the production build passed. Existing spectator, respawn, host-clock, and single-player replay-sharing browser regressions passed; stale fixtures were updated to cross the existing courtyard seal and use the loaded Vite module versions before expecting combat.
- `npm run test:crew-replay-performance` produces measurements under `artifacts/crew-replay/`. On this macOS arm64/Node 24 fixture, the full 30-minute four-player recording retained about 50 MiB of estimated recorder data; seeks measured roughly 1–61 ms. The 302-enemy/280-projectile fixture measured about 0.24 ms added recording cost at the 95th percentile and an 89 ms seek after adaptive checkpointing. The long fixture deliberately has no enemies; neither measurement certifies renderer FPS or every device. Reports include runtime, fixture details, and memory observations.

## Intended experience and scope

Every completed crew run should have a full, accurate replay, accessible from its in-game team-wipe results. Each participant can watch the same authoritative match, inspect any teammate, and seek to deaths, respawns, or the final wipe without leaving the crew.

Interpret “only to be seen when playing” as an in-session feature: record silently during arena combat; expose replay only after the host confirms the team wipe. Add no multiplayer replay browser, main-menu entry, lobby control, public sharing, upload, or multiplayer leaderboard. Keep existing single-player replays and rankings working as they do today.

The first version includes the complete run, camera switching, a useful event timeline, sound, keyboard/controller/touch controls, and host/guest lifecycle handling. Completion means meeting the release checks below, not just adding a Watch button.

## Current foundations, verified in this checkout

- `src/main.ts` has menu, playing, paused, dead, and single-player replay modes. `death()` explicitly sets `lastRun` to null for multiplayer and hides Watch this run. `watchRun()` refuses playback while a crew session exists.
- `src/replay.ts` records one input stream and reconstructs with `World.step()`. Crew gameplay instead uses `World.stepCrew()` at 120 Hz; the single-player format cannot represent this match.
- `FriendsSession.step()` resolves reliable commands, buffered button edges, stale-input neutralization, and a `waiting` set before stepping the host world. These decisions affect the result and must be recorded after resolution.
- `FriendsSession.start()` creates the arena world and advances the epoch. Courtyard movement and the real-time start countdown are separate from the survival run.
- Guests predict locally and reconcile against network snapshots. Those snapshots are compressed, sampled, and delayed; they are not a complete authoritative replay source.
- A death leaves a player spectating with a 15-second respawn countdown. `World.stepCrew()` resolves the wipe before revival, so a pending respawn cannot save a wiped team. Replay must preserve this ordering.
- `World` has hidden RNG streams, scheduler state, delayed spawns, detonations, weapon channels, and upgrade pulses. `ArenaSnapshot` omits state needed to resume deterministic simulation. It is not a checkpoint format.
- The renderer already has free-camera and top-down support, crew avatars, and name labels. Its avatar loop currently omits the selected player's body; an external replay camera must explicitly render that body too.
- `home()` closes the crew session. `returnCrewLobby()` advances the epoch and replaces the world. Existing replay Exit-to-home behavior cannot be reused for crew replay.

## Player flow

1. Record from the initial arena state before the first combat tick. Do not record the menu, courtyard, or wall-clock countdown.
2. A single player's death keeps today's spectating and respawning flow. No replay prompt appears while anyone is alive.
3. On the first host-authoritative transition to `state='dead'`, finalize once and show the existing team results immediately. Preserve the frozen spectator camera behind the panel.
4. Add **Watch team replay** and **Watch final moments · 10s**. Full replay begins at zero; final moments begins at `max(0, finalTime - 10)`. Short runs show their actual available duration. Playback is opt-in, so returning to the lobby remains immediate.
5. The host can watch the finalized recording locally. Guests see a compact “Preparing team replay…” status while fetching the same recording; never block results or lobby actions on transfer.
6. Enter a dedicated crew-replay state, hide live HUD/connection/respawn indicators, and show a compact replay bar over the arena. Keep team results and the final live world intact for returning.
7. Each participant controls their own playback, camera, speed, and selected teammate. Watching or pausing cannot control another participant's replay or change room readiness.
8. **Back to results** restores the same final stats and frozen view. The host retains **Return to lobby**; guests retain the current host-wait message and a **Leave crew** action.
9. Host lobby return or a newer run epoch exits replay for everyone and clears the old run. No old replay controls appear in the courtyard, lobby, or next run. If the host leaves, participants with a complete local recording can finish watching; Exit then returns to the disconnected results state with a route to the menu.

## Replay interface

The bar shows elapsed / total survival time, Play/Pause, speed, camera, teammate selection, and Back to results. Start paused only if a restore/seek is still running; otherwise start playback immediately. End at the exact terminal tick and remain paused there; Play at the end restarts from zero. Seeking to the end does not automatically return to results.

Provide 0.25×, 0.5×, 1×, and 2× speed; jump to beginning/end; seek ±3 seconds and ±10 seconds; and previous/next event. While paused, allow single-tick stepping. The time label uses simulation time, never download time or wall time.

Timeline markers identify player deaths, respawns, disconnects, shared upgrades, and the final wipe. Stack simultaneous events and show the teammate, life number, time, and cause. Death markers seek two seconds before the event, clamped to the run. A per-player row shows alive/dead/disconnected, respawn time, hand level, and reserve at the selected moment. Label existing kills/gems/accuracy as team totals; do not invent individual scores from shared stats.

Camera modes:

- **First person:** start on the local participant when alive at the target time, otherwise the last surviving player with stable roster order breaking ties. Reproduce recorded yaw/pitch and that player's hand, weapon channels, and reserve. Remember explicit player selections.
- **Follow:** damped third-person view of the selected teammate, with the teammate's own avatar visible, terrain clearance, and an explicit reset-view action.
- **Free flight:** reuse spectator movement, constrain position to finite values and a usable arena volume, show all living avatars, and leave recorded player positions untouched.
- **Top down:** frame the arena and show all living teammates, consistent colors/name labels, and optional trails bounded to a short interval.

A selected player's death hides their first-person hand immediately and moves to a clearly labelled follow view at the recorded death position. Do not silently switch to another player's perspective. Seeking into another life restores that life's state; returning to first person is explicit. Keep camera smoothing local to presentation, and reset it on seek or identity/life changes.

Use existing typography and team colors. Keep the arena visible; do not place a full-screen analytics dashboard over it. Controls must fit small landscape screens and the current rotated portrait layout. Timeline markers need larger touch hit areas and accessible text equivalents.

## Recording architecture: exact commands plus complete checkpoints

Use a separate versioned `RecordedCrewRun` and `CrewReplayPlayer`, not a widened single-player recording with optional crew fields. Record the host's simulation decisions and reconstruct in a separate scratch world. This gives full-length fidelity without retaining dense snapshots of every enemy at every tick.

### Tick transaction

At `FriendsSession.step()`, after network commands/staleness/waiting are resolved, capture immutable copies of the effective input for every crew member and the waiting IDs actually passed to `stepCrew()`. Capture no guest-predicted input. Preserve original numeric values; do not quantize authoritative angles or movement.

Each transaction contains a monotonically increasing replay-step index, the expected world tick, resolved inputs, waiting IDs, and any ordered external world mutations since the preceding transaction. External mutations include peer disconnect state and any future roster/gameplay intervention. A disconnect occurring outside the tick loop must be queued at its actual boundary, not inferred later from the member list.

Run-length encode only fully identical transactions with no intervening mutation. Copy mutable collections before the next live tick. Finalization includes the last transaction, terminal world, immutable roster, team totals, and final checksum. No further transaction is appended after finalization.

Record per-player death attribution at the first successful lethal call: player ID/life, tick, cause, lethal enemy ID/kind/body segment when present, and copied contact positions. Falls and disconnects have their own causes. This is observational metadata and must consume no RNG or alter collision order. Derive respawn/upgrade markers from authoritative transitions; preserve same-tick ordering and event IDs.

### Recording header and compatibility

Include an independent crew format/version, gameplay revision/build identifier, run ID, session ID and source epoch, seed, initial simulation options, initial roster order and names/colors, tick rate, transaction count, initial/final time, terminal reason/stats, section lengths, and checksum.

Version checkpoint and transaction schemas explicitly. In this session-only first version, accept only a matching supported build and format; show “Replay uses a different game build” for mismatches. Leave single-player versions 4/5/6 and existing imports unchanged. Bump the multiplayer protocol if the new transfer messages affect its compatibility.

### Complete checkpoint contract

Add explicit `World` capture/restore methods for crew replay. Audit every simulation-owned field. Capture RNG and shot/spawn RNG, next entity ID, placement angle, schedule position/next event, options, time/tick, all crew state and order, active-player selection, world entities and their internal AI/weapon state, shared stats, delayed spawns, detonations, rings, upgrade-pulse hit sets, and counters affecting event identity.

Generators and object-keyed maps cannot simply be serialized. Give the spawn scheduler a reproducible cursor or recreate it to a recorded cursor outside the hot path. Rebuild object aliases and maps against restored player/entity objects. Capture checkpoints only at a defined completed-tick boundary where transient collision caches can either be restored or safely rebuilt. Do not use `structuredClone(World)` or `applySnapshot()` as a shortcut for complete restoration.

Create an initial checkpoint, then approximately one checkpoint every five simulation seconds, plus the terminal checkpoint. Treat this interval as a profiling starting point. Capture checkpoints in the same host tick path used by both animation frames and background-worker wakeups, so recording continues when the host's tab is hidden.

Store authoritative digests at checkpoints. Replay validates them during reconstruction. A mismatch must stop with a useful error; never continue with a plausible but inaccurate match. Verify final team stats and deaths as well as positions.

### Effects and cosmetic history

Reconstructed simulation effects are emitted once during forward playback, in tick order. Compare effect identities against recorded boundary/event metadata. During seek, suppress audio, flashes, and transient notices; rebuild bounded visual effects from a recent warm-up interval.

Floor blood, death gore, sinking towers, interpolation caches, muzzle effects, and avatar animation need a defined reset/rebuild policy. Preserve persistent cosmetic event data needed to reconstruct the target, with compact cosmetic anchors where necessary. Seeking repeatedly to the same tick must produce the same visible scene without duplicated splashes or lingering corpses. Do not promise cosmetic fidelity from a simulation checkpoint alone.

## Seeking, playback, and sound

Seeking restores the nearest checkpoint at or before the requested tick and processes transactions forward. Decode/restore away from the live world, then publish the completed view atomically. Use a monotonically increasing request token; rapid slider drags cancel obsolete work. Bound work per frame or use a dedicated reconstruction worker with a measured handoff cost. Never synchronously simulate an entire long match on the UI thread.

Use the 120 Hz replay clock with interpolation between completed states. Speed changes affect simulation playback time; camera motion uses bounded real frame time. When 2× playback cannot keep up, show buffering or reduce effective advance without skipping transactions. Pausing must freeze animations, descent lighting, gore, particles, and weapon effects as well as world time.

Set the audio listener to the replay camera. Follow the selected player's weapon loops in first person and spatialize crew effects in external views. Stop loops on death, pause, seek, exit, and device interruption. At slow motion, avoid repeating/skipped event sounds; use the existing audio implementation's supported playback-rate behavior with a tested fallback. Arena replay has game sounds and no menu music.

Hidden tabs suspend local playback and resume at the same tick. Losing pointer lock releases free-flight input without losing the replay position. Controller disconnect pauses only this local viewer and offers keyboard/touch controls. Reset all held input before exiting to any live/courtyard state.

## Host-to-guest delivery

Distribute one finalized, compressed recording over a dedicated reliable ordered replay data channel, with a small manifest/control exchange. Keep replay traffic separate from input/state channels and prioritize ordinary room control. Do not transfer active-match recordings or add a backend service.

Guests request the recording on Watch; cache it in the current session after validation so subsequent Watch actions are instant. Send a manifest with run/session/epoch/build identifiers, compressed and decoded sizes, chunk count, checksum, and final tick. A guest can request after results appear even if the host is already watching locally.

Use bounded chunks (initial target 16 KiB), `bufferedAmountLowThreshold`, a per-peer queue cap, and rate limiting. Test simultaneous requests from three guests. Reject unknown run IDs, invalid sizes/counts, duplicate conflicting chunks, unsolicited bulk transfers, stale epochs, malformed records, and decompression beyond the decoded limit. Hash the complete payload before installing it; validate tick ordering and all input/state ranges after decoding.

Show transfer progress, retry, and cancel. A failed download leaves results usable. Complete recordings survive loss of the peer connection for the current viewer; incomplete recordings are unavailable and must not masquerade as full replays. Host return-to-lobby cancels transfers and viewers through an explicit lifecycle message/new epoch, and stale callbacks cannot reopen an old replay. Transfers do not delay lobby return or readiness.

## State isolation and lifetime

Create a discriminated replay context, separate from `friends.world`, guest reconciled `world`, and `lastRun`. It owns playback world, camera, controls, transfer state, and a reference to immutable results. Renderer/HUD/audio choose their source explicitly. In crew replay, never invoke `friends.presentation()` on the playback world, send recorded inputs into `FriendsSession`, or start the live host clock.

Keep network room control alive so host departure and epoch changes are handled. Centralize entry/exit/reset in a crew replay controller rather than adding unrelated conditionals to every input handler. Exit does not call `home()` except when the player explicitly leaves the crew.

Keep the latest completed recording only for the current completed-run session. No IndexedDB history retention or public URL in this scope. Drop decoded caches, transfer buffers, scratch worlds, cosmetic caches, and camera state on lobby return, next epoch, explicit leave, or page teardown. Free unused copies immediately after transfer validation.

## Resource budgets and honest failures

Use compact append-only transaction chunks and bounded checkpoint/cosmetic caches. Lower checkpoint density before dropping fidelity; never silently trim the beginning of a run and label the remainder a full replay. Estimate worst-case changing-input storage as well as dense late-game checkpoints.

Initial acceptance targets, to validate on named desktop and mobile devices:

- Recording adds no more than 1 ms at the 95th percentile of host simulation-tick cost in representative four-player dense scenes.
- Recorder resident data stays within 64 MiB on desktop and 24 MiB on mobile, with additional compression/transfer/decoded allocations measured separately and included in total peak-memory results.
- Normal five-second checkpoint seeks complete within 250 ms at the 95th percentile on the chosen reference desktop; longer work stays cancellable and visibly responsive. Measure mobile separately and set its release threshold before enabling there.
- Replay transfer queues remain bounded per peer and ordinary lifecycle messages stay responsive while all guests download.

If allocation or recording limits are reached, mark the full recording unavailable and keep gameplay/results usable. Do not advertise a complete Watch action for a partial recording. Storage-independent capture avoids browser quota failures, but memory exhaustion still needs a tested outcome. Raise/lower budgets only from measurements; no unbounded recordings in the name of completeness.

## Controls

| Action | Keyboard/mouse | Controller | Touch |
| --- | --- | --- | --- |
| Play / pause | Space or button | Focus + A / Cross | Button |
| Seek | Slider; Left/Right ±3s, Ctrl ±10s | Focus slider + D-pad | Drag slider; labelled step buttons |
| Step paused tick | Dedicated buttons / comma and period | Focus step buttons | Step buttons |
| Select player / camera / speed | Labelled controls | D-pad focus + A / Cross | Labelled controls |
| Free-flight movement | Existing spectator bindings; arena click captures mouse | Existing spectator sticks/ascend/descend | Existing touch movement/look plus accessible height buttons |
| Back to results | Escape or button | B / Circle | Button |

Scope shortcuts to the viewer and do not override focused sliders/selects/text fields. Space on a focused control must not activate both that control and global Pause. Controller focus must survive dynamic labels/loading. Pointer capture is requested only from an explicit free-flight gesture; other views remain operable without it.

## Implementation sequence

1. **Exact reconstruction foundation:** add `crew-replay.ts`, explicit simulation checkpoint methods, resolved transaction hooks in `multiplayer.ts`, and per-player death metadata. Prove recorded/unrecorded live simulations remain identical and checkpoint restoration is exact before UI work.
2. **Viewer core:** add checkpoint seeking, cancellation, independent replay clock, effects reset, camera modes, and a dedicated controller such as `crew-replay-controller.ts`. Validate long-run seek and player-life transitions locally.
3. **In-game integration:** add results actions, replay bar and accessible control layout in `index.html`/a dedicated CSS file. Wire `main.ts` to isolated entry/exit/render sources. Keep multiplayer membership and existing results intact.
4. **Peer delivery:** add versioned replay manifest/chunks, reliable channel, progress/retry, validation, backpressure, and epoch cancellation. Test real host/guest browsers before polishing transfer UI.
5. **Polish and release gate:** finish camera clearance, selected-avatar visibility, cosmetic/audio seeking, controller/touch flow, resource profiling, and failure cases. Update README only after implemented behavior passes.

No schema migrations, leaderboard work, cloud sharing, export/import, replay library, synchronized watch party, or video export are required for this implementation.

## Release checks

### Determinism and data

- Replay matches live authoritative state at every checkpoint and final tick for one through four crew members, changing analog inputs, short taps, stale inputs, waiting sets, out-of-order arrivals, and background host ticks.
- Checkpoint round trips cover RNG, scheduler boundaries, delayed spawns, explosions, segmented enemies, tower rotation, upgrade pulses, shared gems, independent reserves, and weapon-channel edges.
- Death then revival, multiple lives, simultaneous final deaths, fall deaths, and wipe on the same tick as a pending respawn reconstruct identically. Disconnect mutation timing is exact and does not become a fictional enemy kill.
- Metadata contains the correct lethal enemy/segment even if that enemy dies or transforms later in the same tick. No duplicate finalization or repeated event IDs.
- Corrupt, truncated, oversized, wrong-build, and stale-epoch recordings fail cleanly. Recorder errors cannot terminate the live run.

### Real browser flows

- Use actual `FriendsSession`, WebRTC channels, UI, simulation, and renderer; stub public discovery only, following the existing multiplayer browser tests.
- A lone death exposes no replay controls; a confirmed wipe exposes the two results actions on host and guests. Neither main menu nor courtyard shows crew replay entry points.
- Two viewers seek/pause/select different players independently and see the same underlying authoritative match at equal ticks.
- All camera modes work around deaths/respawns and same-tick events. Hands never appear for dead players or external cameras; all expected living avatars remain visible.
- Seeking backward/forward repeatedly does not duplicate gore, sounds, blood, or upgrades. Paused visuals are stationary. The final frame and results stats agree exactly.
- Host return-to-lobby while a guest watches or downloads exits cleanly. Rapid restart, host leave, guest leave, disconnect/reconnect, backgrounding, pointer-lock loss, cancelled seeks, and late transfer callbacks leave no stuck overlays or active controls.
- Keyboard, controller connection/disconnection, touch landscape, rotated portrait, focus navigation, and small viewports all complete Watch → Seek → Back → next run.
- No multiplayer replay enters single-player history, score publication, best-time storage, or replay sharing. Existing single-player replay and death-analysis behavior passes regression checks.

### Performance and completion evidence

Run `npm run build` and the relevant unit suite, then the existing multiplayer spectator, respawn, recovery, network regression, and replay checks plus new crew-replay browser tests. Add meaningful checkpoint/transaction tests and a long-run/dense-world profiling fixture rather than assertions that merely mirror UI code.

Save measured recording overhead, allocation/peak memory, seek latency, transfer duration/queue peaks, and representative screenshots for every camera/control layout under `artifacts/crew-replay/`. Profile full matches, including a 30-minute input fixture and dense late-game states, with three concurrent guest transfers and throttled links. Report test hardware and distinguish measured targets from guarantees.

Ship only when complete authoritative recordings, lifecycle isolation, usable controls, and bounded resource behavior all pass. Any remaining limitation must be visible in the results state and documented precisely.
