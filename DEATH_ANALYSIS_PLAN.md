# Single-player death analysis: five-second killer replay

Status: implemented on 2026-10-13. The original design below is retained as rationale; the delivery notes here describe the shipped behavior.

## Delivery notes

- Playback starts automatically after single-player death, as requested in the implementation follow-up. The final five seconds play at normal speed, followed by a 1.25-second impact hold; shorter runs show their available duration.
- A damped third-person camera follows the lethal enemy/body segment, frames the player's ghost, lifts above intervening enemies, and stays above arena geometry. Falls follow the player's descent. Retry is always available; Results/Escape skips playback, Pause/Space freezes it, and Watch death replays the clip.
- The numeric history starts at 30 Hz and adaptively reduces to 15 Hz or 7.5 Hz under memory pressure, retaining the five-second interval and all entities within a 16 MiB history limit. If even the reduced-density state exceeds that limit, the normal death summary remains available.
- A single scratch `World` adapts decoded presentation to the existing renderer. It is never stepped, scored, or used to resume gameplay. An interface-wide renderer refactor was unnecessary for this implementation.
- A one-time lethal enemy pose survives removal/transmutation later in the death tick. Combat RNG, saved input replay format, and multiplayer messages are unchanged.
- Historical blood/particles and replay event audio are omitted. Existing death audio can finish; gameplay loops and menu music are stopped during analysis.
- `tests/death-analysis.test.ts` covers attribution, immutable snapshots, terminal capture, rolling duration, adaptive memory, interpolation, camera validity, and same-tick killer removal. `tests/death-analysis-browser.mjs` covers automatic enemy/fall playback, hold, pause, replay, skip, retry, and stat isolation. `tests/death-camera-browser.mjs` checks killer/victim framing for all 22 enemy families. `tests/death-analysis-controller.mjs` verifies controller pause/resume, Results, and immediate Retry; the touch death audit covers landscape and rotated portrait.
- Recorder measurements and full-frame capture comparisons are saved under `artifacts/death-analysis-performance.json` and `artifacts/death-analysis-frame-performance.json`; these are local headless Chrome measurements, not guarantees for every device.

## Recommendation

Implement this as a local, presentation-only replay backed by a rolling five-second buffer. Record compact visual state during single-player combat, then play it through the existing renderer with a camera following the identified killer. Do not record video or run a second simulation during gameplay.

This is viable and moderate in complexity. Killer attribution and replay timing are straightforward; readable camera framing, segmented enemies, and bounded recording allocations are the main work. Performance should be manageable, but the budgets below must be measured before enabling it by default.

## Existing foundations and constraints

- `src/simulation.ts`: fixed 120 Hz simulation (`STEP=1/120`), stable enemy IDs, and lethal contact checks in `updateEnemies`. `die()` currently stores a cause string only. Falling calls `die('FALLEN')` independently of enemies.
- `src/replay.ts`: seeded full-run input recordings and deterministic `ReplayPlayer`. `seek()` advances synchronously from the current tick or restarts from the beginning. Seeking straight to the final five seconds of a long run can therefore cause an avoidable CPU spike.
- `src/main.ts`: records input before each combat tick, consumes effects after the tick loop, and finalizes scores/history in `death()`. Existing full-run replay replaces the `world` variable. Death analysis should keep the final gameplay world intact and pass a separate sampled view to rendering.
- `src/renderer.ts`: already accepts an external camera position and hides the first-person hand for that view. It batches swarm enemies and segmented bodies. It still expects a `World` and maintains cosmetic state such as blood and sinking towers; rewinding requires explicit reset behavior.
- `src/network-enemies.ts`: illustrates which enemy fields presentation needs. Its allocating network pack/unpack helpers are a reference for the schema, not the hot-path implementation for this feature.
- Existing replay tests verify exact simulation reconstruction and older combat revisions. Attribution must not alter combat outcomes, random-number use, or saved replay trajectories.

## Player experience

1. Death immediately shows the existing result screen and adds the actual killer name: for example, “Killed by Skull II.”
2. A **Watch death · 5s** button opens analysis. Retry remains immediate; there is no mandatory wait before another attempt.
3. Playback shows the final five seconds before death, at normal speed, using a third-person camera near the killer. Frame both the enemy and the player's recorded position so the approach is understandable.
4. Mark the killer with a light screen-space label/indicator and show the player with a simple ghost avatar. Do not add a full-screen outline pass just for this feature.
5. Display a short countdown to impact. Stop at the terminal recorded state, briefly hold the view, and return to the same death screen. Provide Replay again, Back, and Retry throughout playback.
6. Keyboard, controller, and mobile controls can operate these buttons. Playback releases gameplay input and does not require pointer lock.

Start with button-triggered playback. Automatic playback and slow motion can be later preferences after the normal-speed version is readable and fast.

### Special cases

- **Falling:** show “Fell into the abyss” and follow the player's final path; do not invent an enemy killer.
- **Run shorter than five seconds:** show the available duration and label it honestly.
- **Killer spawned within the window:** show the earlier player context, then blend to the killer at its spawn. Do not make it appear before it existed.
- **Segmented killer:** retain the enemy ID and the body part responsible for contact. Follow that segment near impact, with enough framing to identify its owner.
- **Stationary/large killers:** use a side or elevated view that frames the lethal body and player, rather than assuming every enemy needs a chase camera.
- **Transmutation:** track the stable ID; display the enemy kind at the moment of death, while rendering its earlier kind correctly.
- **Pause/options/background interruption:** stop the replay clock rather than skipping unseen seconds. Resuming continues from the same point.
- **Practice/weapon test runs:** capture actual visual state independently of `RunRecorder`, including runs where that recorder is disabled.
- **Co-op and entrance:** no capture, analysis UI, or automatic death-analysis transition. Existing multiplayer spectator behavior remains separate.

## Architecture

### 1. Capture the actual lethal source

Add optional single-player death metadata containing cause, enemy ID, enemy kind at impact, body/segment index, simulation tick/time, and copies of player and killer/contact-body positions. Capture it at the first successful lethal call and never overwrite it with later contacts in the same tick.

Refactor contact detection just enough to return the responsible body/segment while preserving collision order, radii, swept checks, and legacy-rule results. Attribution records which check caused death; do not describe this as an exact geometric impact point unless the swept collision helper also returns its intersection fraction.

The terminal visual sample is taken after the completed lethal tick. Preserve the lethal-source metadata separately because other enemies can still be processed later in that tick. Use it to identify and annotate the correct killer even if the end-of-tick presentation differs slightly from the contact instant.

Keep multiplayer's death/transport schema unchanged. Do not derive the killer by finding the nearest enemy or mapping the cause string: multiple enemies can share a cause.

### 2. Record a compact rolling presentation buffer

Add `src/death-analysis.ts` with a bounded buffer and a playback sampler. Start with **30 samples per simulation second**, taken after every fourth 120 Hz combat tick, plus an initial sample and an unconditional final death sample. Preserve one sample before the five-second start for interpolation. Roughly 152 slots cover this boundary and terminal sample; timestamps define the actual window.

Capture inside the single-player tick loop, rather than once per animation frame. Copy owned values into reusable typed-array storage; snapshots must not retain references to mutable game objects. Capture the exact final state even when death falls between regular samples.

Record presentation fields only:

- Simulation time, arena time/radius, level, player position/velocity, aim, and the small set of HUD values needed by analysis.
- Every enemy's ID/kind, position, velocity, health/visibility state, age, phase, facing, emergence/status fields, size, head exposure, last-hit time, tower spin, segment positions/health, and weakpoint state needed by current animation/render helpers.
- Projectile IDs, positions, velocity, age, level, homing state; gems and beckoning-ring state. Use IDs to interpolate entities across samples.
- A separately bounded event stream for necessary cosmetic cues. Capture new events before `world.effects` is cleared; do not copy the accumulated effects array repeatedly during a multi-tick animation frame.

Exclude meshes, textures, audio buffers, AI path history, future spawn queues, RNG state, and simulation internals. This buffer is visual history and cannot be used to resume gameplay.

Record all enemies, including ones behind the player or outside the current frustum: the future killer is unknown during recording. Do not capture only the nearest enemy or visible enemies.

Interpolate continuous positions and suitable angles between samples. Apply births, deaths, kind changes, segment health, and other discrete fields at their recorded boundaries; never interpolate one entity into another. Feed already sampled positions to rendering at interpolation alpha 1, so the renderer does not apply a second 120 Hz interpolation.

Thirty Hz is a starting quality tradeoff. Fast daggers can travel about 2.3 units between samples at the configured launch speed of 70; straight interpolation will approximate bounces and rapid homing turns. Preserve important impact/bounce events or selectively add samples if browser review shows misleading trajectories. The terminal death and killer attribution stay independent of this visual approximation.

### 3. Reuse rendering through an explicit presentation interface

Introduce a render-view interface for the fields used by renderer, animation, lighting, blood, and projectile helpers. Let both `World` and the sampled analysis view satisfy it. Avoid casting a partial object to `World` and avoid creating full enemy objects every playback frame.

Use a separate analysis mode/controller, a separate render view, and a camera result containing position/yaw/pitch. Keep the original dead world, final stats, `lastRun`, and death-screen values available throughout analysis.

Reset transient renderer state on entry/restart/exit so blood, flashes, tower death animations, and entity caches cannot leak across the rewind. First version may omit historical floor stains and incidental particles that existed before the buffered interval. Do not display the final run's blood texture during an earlier replay time. Essential positions, lethal body, arena geometry, and impact labeling take priority over cosmetic completeness.

Keep the replay silent initially, or add a dedicated replay audio path later. Do not feed buffered events into gameplay handlers that show upgrade notices, trigger death transitions, or clear live audio state unpredictably.

### 4. Killer-following camera

Compute framing from recorded killer/contact-body motion and player position. Use a trailing offset with an elevated side bias; derive heading from motion and fall back to the killer-to-player direction for stationary enemies. Smooth camera motion using replay time, with consistent initialization on each replay.

Adjust distance for enemy size and maintain enough separation to see the collision. Clamp above the recorded arena surface; avoid placing the camera inside a tower or pede body. Blend toward a side view at impact so the victim remains visible. A screen-space marker can identify an obscured killer, but do not promise that one fixed chase-camera offset will work for every enemy family.

The player's ghost is a render-only object using the existing avatar assets where appropriate, or a lightweight marker if that reads better. Do not add a crew member to the simulation to make the renderer draw the victim.

### 5. Lifecycle and score isolation

Finalize best time, stored run, and score handling exactly once when gameplay ends, before entering analysis. Playback never calls `World.step()`, submits a score, updates best time, or writes a new full-run replay.

Reset the capture buffer on every fresh arena run and free/reuse it on retry, home, or multiplayer entry. Keep only the latest death clip in memory; persistent/exportable death clips are outside the first version. The existing full-run Watch replay and history remain available.

## Performance expectations and limits

During gameplay the added work is copying visual fields 30 times per second. There is no additional WebGL context, second render pass of the world, video encoder, or background simulation. Playback renders one historical scene and does not advance combat AI. Its camera may expose more enemies than the player's camera, so playback GPU cost can still exceed the final gameplay view.

Illustrative enemy-core storage, assuming 64 bytes per enemy per sample:

| Average buffered enemy count | Approximate core payload across 152 samples |
| --- | --- |
| 300 | 2.9 MB |
| 1,000 | 9.7 MB |

These are payload estimates, not total heap measurements. IDs/indices, segmented bodies, weakpoints, projectiles, gems, events, slot overhead, and playback scratch storage add to them. For scale, one 50-segment body with four float32 values per segment adds about 122 KB across the window. Object snapshots would cost more and introduce allocation/garbage-collection pressure.

Use reusable slab/typed-array storage and track allocated bytes, not only populated counts. Start with a proposed **16 MiB history budget**, a separate bounded playback scratch budget, and allocation diagnostics. Do not grow storage without limit. Under pressure, lower retained sampling density while preserving full five-second coverage, all entities, and the terminal sample; discard optional cosmetics first. If required state still cannot fit, disable analysis for that run with an honest unavailable state and keep Retry working. Never silently omit the killer or claim a complete clip from truncated required state.

Proposed acceptance targets, subject to measurement on the target devices:

- Recording overhead below roughly 0.5 ms at the 95th percentile per rendered frame on the chosen desktop stress scene, and less than 5% frame-time regression against the same scene with capture off.
- No sustained increase in garbage-collection stalls; bounded memory over long runs and repeated retries.
- Watch death starts without synchronous full-run seeking, ideally within 100 ms after activation with warmed assets.
- Compare low-quality/mobile capture on/off separately. If it fails the same relative frame-time target, reduce sample density or default analysis off there until optimized.

These are implementation budgets, not claims of measured performance. Benchmark sparse, swarm-heavy, projectile-heavy, and multi-pede scenes because enemy count alone does not describe recording cost.

## Implementation sequence

1. Add first-contact killer metadata and focused collision tests. Preserve deterministic full-run replay tests and legacy behavior.
2. Build the presentation buffer/sampler with owned reusable storage, timestamps, terminal capture, and memory diagnostics.
3. Add the render-view interface, analysis camera, victim marker, killer indicator, and transient-state reset behavior.
4. Integrate Watch death / Back / Replay again / Retry into single-player death UI and controls. Keep score finalization separate from playback.
5. Verify camera readability and interpolation in browser tests; profile capture on/off under the stress scenarios before enabling by default.

Treat this as a few focused implementation passes. It is more than adding a camera to the current replay, but it does not require a new replay engine or recording video.

## Verification required when implemented

- Two simultaneous lethal contacts preserve the first actual killer; segmented and tower contact attribute correctly; falling has no enemy killer.
- Five-second rollover, boundary interpolation, short runs, off-cadence death, and snapshot immutability work. Memory stays bounded after entity spikes and many retries.
- Spawn/despawn and transmutation do not produce phantom or mismatched enemies; segment health and contact-body framing remain readable.
- Pause/resume, restart playback, Back, Retry, Home, and full-run replay work with keyboard, controller, and mobile.
- Final score/history are handled once; analysis does not mutate the dead world or RNG. Practice clips work when input recording is unavailable.
- No capture/UI path runs in co-op or the entrance. Existing multiplayer spectator and saved-replay compatibility checks continue passing.
- Run `npm test`, `npm run build`, relevant replay/death/control browser checks, and the targeted performance comparisons. Report measured cost and device context with the implementation.
