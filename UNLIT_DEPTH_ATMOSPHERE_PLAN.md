# The Unlit Depth — final environment design

Status: proposed direction and implementation plan only. No final-scene implementation is included in this planning pass.

## 1. Role in the descent

Keep the existing chapter name, The Unlit Depth. Creative subtitle: **The weight of the world.**

The player has descended beneath weather, fire and monumental architecture. The final environment reveals the foundations of that entire world: colossal, fractured stone masses suspended around an abyss, with an immense broken crown above the arena. Its underside catches a narrow cold light. The arena is a small, readable island below it.

The emotional progression is apprehension → recognition of scale → sustained pressure. The player should feel they have reached somewhere final, while the fight continues under their control.

One defining image must carry the scene: a broken black-stone annulus spanning the upper forward view, its deep underside revealed in fragments, a cold glancing reflection crossing the player's stone, and faint suspended matter establishing the distance between them.

## 2. Current implementation audit

Read the descent, sky, cathedral, mist, audio manifest and simulation state. Captured current views at 454, 472, 486, 520, 720 and 1200 seconds in `artifacts/depth-plan/`.

- Cathedral's outgoing occlusion begins at 440 seconds.
- Visual/audio chapter crossfade into Depth runs from 454 to 472.
- Depth continues from 472 with no subsequent environment chapter.
- The simulation remains in playing/dead states; there is no victory transition tied to this chapter.
- Sky travel is already bounded. Its existing crown is a dim angular band near the upper sky.
- Cathedral geometry retains a faint overhead presence; its projected light and dust disappear. The late rendered views also contain dark inherited stone silhouettes. Audit scene ownership and preparation visibility before deciding which of these forms the Depth should retain.
- Floor retains a modest cold multiplier but has no defining Depth material effect.
- Depth mist is near-black violet, with low banks and no cathedral shafts.
- Existing audio combines geological rumble and a slow pulse at the established restrained ambience gain.

Preserve gameplay, encounter timing, arena collision/shrink behaviour, controls and the 454–472 chapter handover. Build the arrival reveal inside the continuing final chapter.

## 3. Composition: a place with depth

### Hero: the broken foundation crown

Build one authored silhouette from a small modular mesh set: seven foundation sectors, sharing the cathedral's world azimuth, joined by incomplete annular courses and separated by deep irregular fractures. The sectors should feel hewn and structural. Distinct broken profiles, layered stone thickness and a visibly ribbed underside establish scale. Author their silhouette first; procedural surface noise supports it afterward.

Place the hero outside the playable footprint and within the useful scene depth range; prototype roughly 80–110 m radius and 25–50 m above deck level. Tune its elevation so a substantial arc is visible in a normal forward combat view. Looking up reveals its full sweep. A good forward composition is an acceptance criterion, not an optional camera angle.

The familiar sevenfold cathedral alignment makes the crown feel like the architecture's foundation. It is an environment landmark, with no aiming target, rotating eye, entrance, health cue or boss behaviour.

The crown receives narrow, interrupted silver-violet grazing light. Deep fractures remain dark. Restrained dull mauve mineral scatter can appear deeper inside the stone, at much lower intensity than combat highlights. Avoid a uniformly luminous ring. Make missing sections and darkness do much of the compositional work.

### Middle layer: hanging foundations

A few unequal buttress roots and broken hanging slabs occupy the space between the crown and distant void. Their silhouettes overlap, with slightly different depths and thicknesses. Keep them outside the arena; their lowest shapes disappear below the rim. They provide real parallax, scale and a directional relationship to the crown.

They rise a finite distance relative to the platform during arrival, continuing the apparent descent. After settling, the architectural layout remains stable. Nothing recycles upward, wraps around, respawns visibly or drifts into the fighting space.

### Far layer: structured darkness

Use broad, extremely low-contrast depth fields behind the masonry: a few distant mass silhouettes and thin, separated haze layers. Leave large areas of true negative space. Reveal enough material at grazing angles to imply continuing distance.

Near-black indigo, neutral charcoal and muted violet form the palette. Keep warm reds associated primarily with combat. Stars, galaxy ribbons and floating cosmic decoration would break the physical continuity of this descent.

### Below the platform

A restrained sub-floor haze shelf catches weak scattered light on its upper surface. A few deep stone silhouettes fall away beneath it. The player gets a convincing abyss when looking over the edge. All effects respect actual tile depth and leave the platform boundary legible.

## 4. The platform is the other hero

### Material: dark mineral stone

Retain the existing stone texture, original tile relief and tile positions. Shift the light response toward dense charcoal stone with cool mineral flecks, deep mortar and broad polished high points. The result should feel heavy, old and compressed.

Preserve roughness variation: raised grains catch light while recesses absorb it. Treat satin reflection as a sparse mineral response, keeping the stone recognisable and traversal readable. Do not introduce liquid behaviour, puddles or mirror-clear surroundings.

The material must be built in normal gameplay view before proceeding to dense atmosphere. Floor-focused captures should identify the Depth independently of the sky.

### Fragmented crown reflection

Use a shared world-space crown model to drive the floor's glancing incident light and rough reflection. Large missing crown sectors interrupt the light. Soft angular fragments travel a small, bounded distance as arrival geometry settles, then hold a stable overall composition.

Integrate the pattern with grain and grazing angle, and soften with distance. Avoid a bright drawn circumference or a diagram-like ring on the arena. The player should perceive reflected material and directional illumination.

The floor reads on three scales:

1. Immediate: readable stone texture, contacts and tile height.
2. Mid-field: broad cold glancing bands and rough dark islands.
3. Far edge: restrained side-face illumination separating stone from the abyss.

### Light reacting to the fight

Audit the existing enemy/projectile light and mist-light field on the new material. Warm combat bursts should briefly reveal mineral relief and nearby suspended matter through those existing systems. Preserve blood, gems and projectile colours. Use the current bounded light sources; do not allocate a new dynamic light per impact.

Ambient brightness remains steady during combat. No hit-driven whole-screen flash, auto-exposure pump or environment event can interrupt identification of an enemy attack.

### Motion close to the stone

Introduce very sparse, pale mineral dust and a low, almost motionless haze layer in distant floor recesses. Keep the immediate fighting volume clear. Dust should be visible mainly where it intercepts existing light. Use small neutral particles, stable global seeding and deterministic animation.

Avoid local glowing cracks, animated glyphs, concentric shockwaves, dark spreading hazard circles, upward floor fire and force-like suction. Those effects imply mechanics.

## 5. A reveal that remains playable

The reveal is the environment coming into view, with no camera control or exposure cut. Its main silhouette should become legible promptly after entering Depth. The longer secondary settling movement rewards continued survival.

| Match time | Intended experience |
| --- | --- |
| 440–454 | Existing cathedral occlusion: upper openings close, floor illumination contracts, atmosphere loses its lit dust. Hint at dark foundation masses behind the remaining ribs. |
| 454–472 | Exact existing chapter crossfade. Cathedral light drains; its structural alignment resolves into the crown underside. Broad cool floor glints begin replacing the cathedral bands. Bell air recedes into the established Depth bed. |
| 472–486 | Main reveal: thin grazing light makes the immense broken crown and its missing sectors legible in the forward view. Hanging foundations separate from the far void. Floor material reaches its final identity. |
| 486–515 | Finite settling descent. Underside thickness and distant roots become clearer through restrained parallax and haze. The reveal's temporary light contribution eases into a stable level. |
| 515 onward | Lasting composition. The crown holds its scale; a small number of independent haze and dust motions sustain life. Ambient readability and effect density stay bounded for an indefinite run. |

At the handover, the crown must feel structurally continuous with the cathedral. Use one handoff owner for inherited geometry: transfer or replace the existing residual cathedral silhouettes rather than layering a duplicate system indefinitely. Replace the old analytic crown band where it conflicts with the new landmark.

The permanent lighting composition must remain satisfying after the reveal contribution is removed. The scene cannot depend on a single bright event to look finished.

## 6. Long-run atmosphere

After settling, use two or three small, independent motions: broad sub-floor haze drift, sparse dust movement and a slight change in the visibility of one distant fracture. Their periods should differ and their amplitudes stay low. Keep the overall light level and crown outline steady.

Reconstruct every effect from absolute match time and fixed seeds. Movement is bounded; infinite survival cannot accumulate particles, increase fog indefinitely, march the crown out of view or produce integer-time discontinuities. Inspect 520, 720, 1200 and 1800 seconds as separate compositions.

Reduced motion keeps the silhouette, material and stable glancing light, while freezing or greatly reducing arrival translation and ambient particle drift. No screen distortion is required for the identity of this scene.

## 7. Sound: weight and distance

Start with the shipped geological bed, maintaining the established chapter crossfade and gameplay volume. Audition its low pulse against real combat and several minutes of sustained listening.

Desired layers, subject to audition and source/licence verification for any additions:

- A restrained continuous geological foundation, with audible body above the deepest bass so the environment survives laptop speakers.
- Sparse distant material resonances, with long quiet tails and strong apparent distance.
- Thin, filtered air close to the crown fractures, used sparingly in stereo.
- The final cathedral resonance carried naturally into the handover if the existing fade is insufficient.

The reveal should earn its scale through a slow change in texture and depth. Do not use a loud arrival sting, heartbeat acceleration, fake whisper or periodic impact that competes with enemy warnings. Avoid large stereo swings that could be mistaken for nearby moving threats.

The 120-second bed should remain comfortable through repeated playback. Keep variation subtle and deterministic; preserve existing mute, pause, seek, hidden-tab and replay behaviour.

## 8. Darkness and combat readability

Set a deliberate permanent cold illumination floor on the playable surface and combat silhouettes. Darkening comes mainly from surrounding mass, material contrast and negative space. Keep exposure stable, including during arrival.

Validate the scene at normal brightness on an ordinary display and in grayscale. Compare against the current final scene from the same camera, with the same enemies and settings. Require:

- Visible stone texture and tile contacts immediately around the player.
- Clear platform edge and height changes in the mid-field.
- Enemy silhouettes and attack colours readable against both dark void and lit crown fragments.
- Gems, blood and projectile trails retain their established identity.
- No beam, particle sheet or bright fragment sits persistently over the aiming region.
- No colour-grading layer desaturates the HUD or hides combat tells.

Test active firing, large enemies, many projectiles and camera turns. A dramatic empty-arena image is insufficient evidence.

## 9. Implementation architecture and budgets

Proposed pure state module: `src/depth-state.ts`, with arrival, reveal, settling, persistent material, crown and motion envelopes. Use the existing match clock, including non-finite input handling. Keep chapter/audio timing authoritative.

Proposed render module: `src/unlit-depth.ts` containing hero geometry, shared crown field, floor hooks and one bounded dust batch. Share crown-sector geometry/light parameters with the sky and existing mist. Integrate renderer preparation, menu/entrance disable, quality/reduced motion and diagnostics.

Target two or three draws for the final treatment: one instanced stone batch, one dust batch, and an optional separate bounded sub-floor layer only if the current mist cannot provide it. Use the existing volumetric pass and existing combat light field. Reuse available stone material assets where they hold up; create or source additional texture assets only after a close-up quality review.

Avoid a full-screen raymarched singularity, dynamic reflection camera, new shadow-map stack, many real-time lights or high-overdraw particle walls. Those would consume the budget precisely when late-run combat is busiest.

Performance targets are provisional: approximately 2–3 ms added High GPU time at 1280×720, meaningfully lower Low cost, bounded CPU work and memory with no time-growing allocations. Measure at arrival overlap and steady Depth, using paced GPU timer queries, warm shaders and isolated paired scenes. Reduce secondary texture sampling/overdraw first if the budget is missed. Low retains the hero silhouette and defining floor response.

## 10. Build order and review gates

1. **Block the composition.** Greybox the crown and hanging roots. Check forward view, overhead view, arena edge and movement parallax. Reject silhouettes that only work in a cinematic camera.
2. **Prove the floor.** Develop dark stone, grain, permanent readability fill and fragmented crown illumination. Review with the sky hidden and with combat active.
3. **Connect light and space.** Add crown grazing light, material detail, depth layers and bounded dust. Use the same sector model for all related effects.
4. **Build arrival and inheritance.** Coordinate cathedral occlusion, residual geometry, old crown shader, new reveal and audio. Verify continuous light and ownership through 440–515.
5. **Tune indefinite survival.** Check later timestamps and full encounter load. Keep reveal intensity separate from the settled composition.
6. **Polish and record.** Resolve silhouette, readability, material and transition problems before adding decorative detail.

## 11. Definition of done

- A convincing forward-view hero silhouette and a distinct floor identity at playing height.
- Structural continuity from the cathedral; no doubled residual ribs or conflicting crown effects.
- A legible arrival within the first seconds after the chapter handover and a lasting settled composition.
- No new collision, damage, cover, target or safe-zone cues.
- Actual shrinking tile contact for floor haze/dust; effects disappear with dropped tiles where appropriate.
- Stable material and edge readability with busy combat, Low quality, mist disabled and reduced motion.
- Deterministic pause, rewind, direct practice skips, long timestamps and run resets.
- Audio crossfade remains continuous and restrained; no preview gain leaks into gameplay.
- Measured GPU/CPU/memory behaviour stays within the chosen budget through long runs.
- Existing cosmic, weather, veil, furnace and cathedral rendering still passes regression checks.

Final evidence: normal-speed 440–515 transition film with game ambience, a first-person floor and combat study, an arena-edge depth view and later-run captures. Use a native-compatible MP4 and verify its decoded audio/video. Disclose any recording-only gain. The preview uses the actual game renderer and gameplay exposure.
