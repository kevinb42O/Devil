# The Descent

Design and implementation direction for an environment that falls from the open sky into the deepest part of hell. Updated to reflect the user's requirement for a bright, almost happy opening and no artificial dark horizon in any chapter.

## Creative direction

The arena is a condemned fragment of stone falling through a universe that has no intention of letting it land. The player fights on a stable platform while enormous atmospheric layers rise past it. Each encounter milestone takes away another sign of the world above.

The memorable sequence is: daylight → weather → loss of daylight → heat → impossible architecture → darkness beneath the fire. Hell becomes stranger as the player survives longer. The final environment is colder and quieter than the furnace, leaving the enemies as the brightest living things in the scene.

No chapter title appears during a fight. The environment itself becomes a learned clock. Chapter names below are art direction names, useful for development and optionally for the death summary later.

## Six chapters

Times are survival simulation seconds. Existing encounters were checked against `survivalSchedule()` in `src/survival.ts`; these chapter boundaries are proposed design choices, not changes to the spawn schedule.

| Chapter | Approximate interval | Environment | Recognizable cue |
| --- | --- | --- | --- |
| The Last Sky | 0–39 s | Bright blue sky, white clouds, an ivory sun, and light surrounding the arena in every direction. It should feel almost happy. | The only open daylight in the run. |
| The Cloud Grave | 39–114 s | Broad storm layers rise past the arena; the sun fades behind them. No lightning flashes. | A dark cloud ceiling, with a thinning patch of blue above. |
| The Bruised Veil | 114–229 s | Slate and violet atmosphere; daylight contracts into a distant opening overhead. The opening is a remnant of the cloud layer, not a new astronomical object. | A pale opening receding above surrounding violet clouds. |
| The Furnace | 229–350 s | Deep rust and charcoal; a distant hot band below rises toward the periphery. By the Gigapede trio at 259 s, it reads as the lip of an enormous furnace. | Low, broken arcs of dull orange light, separated by wide black gaps. |
| The Cathedral Below | 350–442 s | Around Leviathan, immense silhouettes become apparent at the far sides: shapes halfway between basalt columns, ribs, and ruined buttresses. They pass slowly upward. | The first suggestion that hell has walls, on an impossible scale. |
| The Unlit Depth | 442 s onward | At the Ghostpede milestone, the last furnace glow recedes above. The environment becomes ink, faint plum, and enormous negative space. | A dim broken crown overhead; almost no environmental light at fighting height. |

The Furnace is the warmest chapter, not the final chapter. This reversal keeps the descent from becoming a predictable blue-to-red color ramp. Surviving longer feels like going somewhere that even fire cannot reach.

## Three signature moments

1. **The closing sky.** Between the first Centipede at 114 s and the six-squid encounter at 229 s, the last daylight narrows overhead. Players who look up discover how far they have fallen; looking up is never required to play.
2. **The furnace mouth.** Ahead of 259 s, enormous broken arcs become visible far outside the arena. Their size makes the platform look insignificant. They remain background silhouettes with no collision or apparent attack function.
3. **Below the fire.** During the approach to 442 s, orange fades and the broken crown rises. The deepest chapter deliberately reduces visual activity as combat becomes more demanding.

These are long atmospheric events, not cinematics. No camera movement, forced attention, sudden exposure change, or timed spectacle competes with a spawn.

## Motion and spatial illusion

- Keep player physics, arena coordinates, enemies, and collision exactly as they are. The descent is presentation.
- Use world-oriented azimuth for landmarks. A column stays in the same compass direction as the player turns; no landmark is anchored to the screen.
- Use distant cloud and architectural bands moving upward in angular elevation to suggest vertical descent. Changing only horizontal cloud drift would read as weather.
- Give distant and nearer atmospheric bands slightly different apparent speeds. Use broad shapes and very low contrast; avoid fast streaks or nearby particles.
- Do not translate the whole sky sphere vertically. It continues to follow camera translation, matching the existing distant-sky behavior.
- Use a monotonic, eased descent parameter and explicit band envelopes. Do not wrap a prominent landmark back into view when it leaves the top of the sky.
- The opening in the clouds shrinks gradually. It should feel like a place being left behind, not a sun attached to the player's view.
- After 442 s, retain the terminal chapter indefinitely. Optional extremely slow changes in faint haze can provide variation, with no return to daylight or growing effect density.

## Timing rules

Derive the environment directly from authoritative survival time. It must reconstruct correctly at any timestamp without having observed earlier frames.

- Build an immutable chapter table plus a pure `descentAt(time)` evaluator. Return blend weights, palette values, landmark envelopes, and descent position.
- For each boundary, begin the main blend approximately 12–18 seconds before the encounter and finish at its start. Use smooth easing with zero endpoint slope. Exact durations are tuning values.
- Landmark reveals can span 25–45 seconds and remain visible after the milestone. A spawn boundary is not a command to flash or switch the sky.
- Practice at 229, 259, 350, or 442 s immediately shows the appropriate environment.
- Pause freezes environmental progression. Restart resets it immediately. Death analysis uses the displayed replay timestamp, so scrubbing reconstructs the same chapter and landmarks.
- Multiplayer and spectators use the shared match simulation clock, not local wall time or player life age. Respawning does not reset the descent.
- Menu retains the current abyss presentation initially. A later menu treatment can show a restrained preview of the descent, independent of a live match.

## Combat readability

The sky surrounds the arena completely. There is no combat-height blackout, horizon suppression, or lower-hemisphere fade. Darkness comes from the later chapter palettes themselves. Enemy silhouettes and existing source lighting preserve readability against the environment.

- Keep daylight bright around and below the arena as well as overhead. Do not add an artificial dark band in any chapter.
- Retain readable edge separation between arena and background, especially as the arena shrinks. Do not make the edge disappear into identical black values.
- Keep background cloud detail coarse; small bright dots can resemble pickups or projectiles. Remove the current stars during daytime and omit dense ember fields throughout.
- Coordinate the arena, native enemy materials, hand and scene lights with each chapter. Use a soft daylight fill in the opening, fade it over the same 18-second transition as the sky, and let faint furnace/violet light tint the later surfaces. Retain enemy glow colors, gem treatment and attack cues. Emissive firing-hand textures keep their original brightness rather than receiving extra daylight.
- Warm environmental highlights must be substantially dimmer and larger than orange gems and projectiles. Avoid green and cyan background highlights competing with enemy families.
- Render sky color below bloom's bright-pass threshold. Confirm this in the actual output; `toneMapped: false` alone does not prevent bloom.
- Architecture is distant, softly defined, and sparse. Avoid narrow pointed details that look like enemies or gaps that read as an alternate arena edge.
- Offer **Sky motion: Full / Reduced**. Reduced keeps chapter progression and landmark recognition while disabling vertical travel and independent drifting detail. Both remain deterministic.

## Rendering approach

The current `AbyssSky` already has one procedural `ShaderMaterial`, one camera-following sphere, `depthWrite: false`, a far-depth vertex shader, and late render order. Extend that existing path first.

1. Add `src/descent.ts` for chapter definitions and deterministic evaluation.
2. Extend `src/sky.ts` with fixed uniform slots for chapter palette, descent, cloud coverage, opening size, furnace glow, and architecture strength. Reuse the existing cloud noise field rather than evaluating independent full skies and crossfading them.
3. Compose the cloud opening, furnace arcs, and distant rib silhouettes from cheap angular masks where that looks convincing. Keep the sky opaque in one draw call.
4. Feed the correct presentation timestamp through `src/renderer.ts`, accounting for live play, menu, pause, death analysis, and spectator paths. Apply the same timeline to the scene's shared environment-lighting uniforms and existing lights.
5. Expose the motion preference through the existing visual settings and persistence, after inspecting that code during implementation.

Implemented scene lighting uses `src/environment-lighting.ts`: a shared directional daylight/fill term for native unlit stone and enemy textures, the overlay hand, and cloned crew-arm materials. Existing hemisphere, directional and point lights blend with the same timeline, together with fog color/density. Gem crystals and projectile emission remain independent of ambient lighting. The opening palette is deliberately restrained enough for lime, blue, cyan and violet daggers to separate from both cloud and blue-sky backgrounds.

Avoid runtime shader recompilation, texture replacement, extra screen passes, real volumetric clouds, background particle systems, and per-stage light allocations. Add no new audio in the first release. The game currently uses entrance ambience and then silence; any later environmental audio must preserve directional enemy cues and receive a separate listening review.

On low quality, retain all chapters and their major landmarks, but use fewer cloud octaves and simpler architecture. Quality should reduce detail, not remove progress information. Reduced motion is independent of quality.

## Implementation order

**Pass A — prove the descent.** Build the deterministic timeline and six palettes in the existing shader. Add upward movement of broad cloud bands and full surrounding skies. Capture a standard forward view and an upward view at 0, 39, 114, 229, 259, 350, 442, and 520 s. Review against real enemies before adding architecture.

**Pass B — make it memorable.** Add the closing daylight opening, broken furnace arcs, and sparse cathedral silhouettes. Tune each so that it is recognizable without looking like a target. Confirm the final chapter feels deeper than the furnace.

**Pass C — integrate and finish.** Complete pause, restart, practice, replay, spectator, multiplayer, low-quality, and reduced-motion behavior. Measure performance under identical camera and enemy loads, tune shader cost, and polish transitions.

The first shippable version includes all six chapters, the three restrained signature moments, coordinated scene lighting, deterministic time behavior, low-quality support, and reduced motion. Environmental audio, death-summary chapter names, and additional geometry remain optional later work.

## Acceptance criteria

- A side-by-side contact sheet clearly distinguishes all six chapters through silhouette and light placement, not only hue.
- Real forward and upward gameplay captures preserve enemy, gem, projectile, hand, and arena-edge readability at each checkpoint, including both sides of every transition.
- No visible popping, rapid brightening, artificial horizon cutoff, or recycled architecture occurs during a continuous run or replay scrub.
- Practice, pause/resume, restart, death replay, respawn, and spectator views reconstruct the intended chapter without carrying stale state.
- Unit coverage verifies deterministic evaluation, blend continuity, boundary behavior, and terminal-stage stability. Browser checks target integration and visible output; do not duplicate shader formulas in tests.
- Compare the existing sky and proposed sky with the same resolution, quality, camera angles, and enemy loads. Include forward views, mostly-sky views, the furnace, cathedral, and late-game combat.
- Proposed performance gates: no added sky draw calls or render targets; median added GPU cost at most 0.3 ms on the main desktop test machine; no more than 5% regression in p95 frame time on the lower-power test target. These are acceptance targets, not measured claims. Record baseline, machine, viewport, quality, sample length, and timing method. If GPU timing is unavailable, state the frame-time proxy limitation.
- If the gates fail, simplify noise and silhouettes before reducing chapter identity. Ship only after the cheapest convincing version passes.

## Definition of success

A new player notices that the world is sinking into something terrible. A practiced player sees a familiar cloud opening or furnace arc and anticipates the next encounter. An expert remains focused on enemies and scarcely notices the motion, but feels the absence of daylight when it is gone.
