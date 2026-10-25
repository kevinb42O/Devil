# Skull motion polish plan

Status: implemented and verified. Gameplay rules and simulation code remain unchanged.

Implementation: `src/skull-motion.ts` supplies tier-specific damped heading, flight pitch, turn banking, bounded hit recoil, stable individual phase, and delayed appendage inputs. The production swarm renderer uploads the body pose and motion attributes, preserving them through batch growth. See `artifacts/skull-flight/README.md` for validation, comparison footage, and limitations.

## Direction and boundaries

Make the skulls feel self-propelled, alert, and physically committed to their movement. Every major rotation should explain a turn, climb, descent, launch, or impact. Secondary movement should follow that action with a small delay.

User-confirmed boundary: preserve current paths and difficulty. Keep simulation positions, steering, speeds, targeting, damage, collision radii, spawn timing, RNG, and replay/network formats unchanged. Do not add lunges that imply an attack the simulation does not perform.

Primary scope: Shrieker (`skull`), Executioner (`skull2`), Reliquary (`skull3`), and their Hollow variants. Drake (`skull4` / `transmuted4`) shares the swarm route but is grounded in the current game; give it a separate grounded presentation profile, never the hovering skull treatment.

## Findings in the current code

- `src/renderer.ts`: the swarm branch builds each instance with `rotation.set(0, enemyYaw(...), 0)`. Pitch and roll are always zero. Yaw follows velocity immediately. This branch exits before per-model animation.
- `src/enemy-presentation.ts`: `enemyYaw` already chooses skull travel direction. Preserve this shared gameplay-facing helper; visual lag belongs in a separate presentation layer.
- `src/remake-enemies.ts`: `createSwarmBatch` merges template geometry into instanced meshes. Animating cloned child objects alone will not affect combat skulls.
- `src/skull-anatomy.ts`: tiers I–III are merged anatomical meshes with region and motion-weight attributes. There are no separate articulated jaw joints to rotate in gameplay.
- `src/enemy-surface-material.ts`: skull appendages already have small shader undulations. Their phase currently depends on world position, so movement through space changes the cycle. This is secondary surface motion, not body attitude.
- `src/simulation.ts`: skulls already supply velocity, stable IDs, age, phase, hit time, and tower-ejection state. Tower flight already includes curved lanes and vertical movement; presentation should reveal these existing dynamics.
- `tests/skull-redesign-browser.mjs`: existing coverage checks one draw per skull kind, fewer than 2,400 triangles per instance, a 1,000-skull scene, lighting, and hit flashes. Preserve those budgets.
- `tools/record-skull-showcase.mjs`: existing footage uses a studio clone with tiny scripted movement. It does not demonstrate the actual combat swarm animation path.

## Motion design

### 1. Body attitude: the highest-value change

Use travel velocity for the base heading, with an unwrapped yaw angle so crossing ±180° cannot cause a spin. Add a bounded, damped visual response to heading changes. The face leads; the body settles into the new direction with restrained follow-through.

Pitch follows climb/descent angle, using local +Z as forward. Add a small acceleration/braking bias: lean into acceleration, lift slightly as speed falls. At near-zero speed, retain the last valid heading instead of deriving an unstable direction from tiny velocity values.

Bank from signed turn rate/lateral acceleration, not a looping sine. Build into a turn, peak during the turn, then recover with at most one small overshoot. Return toward level on straight travel. Filter velocity derivatives before using them; network corrections must not become violent banks.

Starting tuning ranges, subject to actual gameplay review:

| Profile | Pitch cap | Bank cap | Turn settling | Character |
| --- | --- | --- | --- | --- |
| Shrieker | 18–22° | 20–26° | 100–160 ms | Quick, nervous corrections; light recovery |
| Executioner | 12–16° | 14–20° | 170–240 ms | Weighty commitment; deliberate recovery |
| Reliquary | 16–22° | 18–24° | 130–200 ms | Controlled, predatory alignment; low idle noise |

These are maximum envelopes, not permanent poses. Scale them down near contact so the silhouette remains attached to the unchanged combat volume. Keep the root position at `enemy.pos`; begin with rotation only, without cosmetic translation or whole-body scaling.

### 2. Authored state transitions

- **Tower launch:** align with the existing upward ejection, follow the arc through its crest, then blend into the hunting attitude. Keep emergence scale and activation timing intact. No forward dip through the tower outlet.
- **Cruise:** very small, slow orientation drift, independently phased per enemy. Bias toward a stable face and readable silhouette. No synchronized swarm rocking.
- **Turn:** heading response, bank, delayed appendage swing, recovery. This is the main showcase moment.
- **Close approach:** reduce idle drift and lateral roll as the existing trajectory closes on its goal. The face becomes more purposeful without changing travel or attack timing.
- **Surviving hit:** a short 60–90 ms angular impulse followed by 160–250 ms recovery, layered over flight. Use `lastHit`; clamp repeated impulses so rapid fire does not create spinning. Tier I normally dies immediately, so do not promise a visible surviving-hit reaction there.
- **Transmutation:** retain identity and pose continuity when the same ID changes kind. Blend profile parameters rather than resetting the angle. Hollow versions use quieter, slightly delayed secondary motion, not a new trajectory.
- **Drake:** keep floor contact believable. Use modest heading follow-through and turn lean with grounded limits. Suppress hover pitch and bob. Check existing wing deformation before adding any secondary motion.

### 3. Secondary anatomy: finish after the flight reads well

Keep hard skull anatomy rigid. Add follow-through only to anatomically flexible parts: hanging roots, tendrils, membranes, and any jaw region explicitly tagged for articulation.

Reuse the merged instanced geometry. Add explicit motion masks/pivots where necessary; do not infer a jaw hinge from height or animate every low vertex. Drive appendage deflection partly from the same turn/acceleration signal as the body, with delayed recovery. Keep ambient undulation subtle.

Provide a stable per-instance phase derived from ID/existing phase instead of moving world coordinates. Pass bounded motion inputs through instanced attributes if needed. Maintain correct lighting normals for any meaningful articulated deformation. No new material or draw call per enemy.

## Implementation architecture

1. Add `src/skull-motion.ts` with profile data, bounded attitude calculations, angle wrapping, response integration, and pose composition. Keep dependencies one-way: presentation may read simulation data; simulation must not import the presentation controller.
2. Add a renderer-owned motion cache keyed by enemy ID. Store previous sampled velocity, heading, angular response, last processed simulation time, and kind transition state. Update once per source-time advance, independently of visibility; render calls at the same time must not advance it again. Interpolate presentation samples for display.
3. Integrate the pose in the actual swarm instance matrix path in `src/renderer.ts`, before bounds/culling and matrix upload. Reuse scratch vectors/quaternions and cache entries; avoid allocations inside the per-frame enemy loop.
4. Keep root yaw, pitch, and roll composition explicit and test local +Z orientation signs. Use quaternion composition/interpolation for the final pose. Clamp visual heading lag so the face does not point away from its travel direction for prolonged periods.
5. Reuse the same pose API for inspection clones and recording tools, so the showcase demonstrates shipping motion. This integration must be explicit; `RemakeEnemies.animate` alone cannot update swarm instances.
6. Add stable phase and optional secondary-motion attributes in `src/remake-enemies.ts`; update anatomical masks in `src/skull-anatomy.ts` and shader deformation in `src/enemy-surface-material.ts` only after the body pass is accepted visually.
7. Expand culling bounds conservatively for shader appendage displacement. Rotation is already represented by the instance matrix; displacement outside the baked sphere needs its own allowance.

### Lifecycle, replay, and multiplayer requirements

- Pause freezes motion. Resume must not integrate paused wall time. Rendering twice at the same source time produces the same pose.
- Reset caches on world replacement, restart, replay seek/time reversal, and ID reuse; prune removed enemies. Preserve state across same-ID transmutation.
- Replay seeking must not reuse future velocity or impulses. Define reconstruction in the replay integration: use available prior samples/pre-roll to rebuild response where supported; otherwise seed a bounded neutral response from the seek sample. Verify the resulting seek behavior explicitly rather than claiming exact historical pose from current velocity alone.
- Guest presentation reads the displayed enemy samples. Clamp/reseed on large position corrections or time discontinuities; never extrapolate cosmetic motion into gameplay position.
- Low and high quality retain body attitude. Reduced-motion preferences attenuate ambient drift and recoil/overshoot while keeping useful travel orientation. Do not couple enemy behavior to the camera's movement-motion slider.
- Confirm skull collision representation before final angle tuning. Preserve all collision code and test aim/contact at extreme cosmetic poses. If a pose visibly breaks target alignment, reduce its envelope rather than changing the hitbox.

## Delivery sequence

1. **Baseline and flight prototype:** capture actual instanced gameplay; implement heading, pitch, banking, fixed-source-time sampling, and cleanup. Establish the effect on one Shrieker before spreading profiles.
2. **Character pass:** tune all three tiers side by side; add tower-launch blending, contact restraint, hit recovery, Hollow continuity, and a separate grounded Drake profile.
3. **Anatomy pass:** add stable per-instance phase and restrained motion-driven appendage follow-through. Keep the rigid facial mass readable.
4. **Finish and proof:** tune in first person at normal speed, verify replay/guest/pause behavior, profile dense swarms, and record comparisons through the production rendering path.

Do not compensate for weak turning with more idle oscillation. Each phase must read well before adding the next layer.

## Acceptance and evidence

Add focused numerical tests in `tests/skull-motion.test.ts` for left/right bank signs, climb/dive signs, yaw wrap, zero-speed stability, bounded recoil, pause, duplicate sample time, discontinuity reset, and kind transitions. Test convergence at 30/60/120/144 Hz against the same source samples.

Add `tests/skull-motion-browser.mjs` to inspect real instance matrices and render launch, straight flight, left/right turn, descent, close approach, hit, and transmutation scenes. Verify no NaNs, stale poses, culling pops, or flashing resets. Compare unchanged simulation results with presentation enabled/disabled: positions, HP, targeting, collision/contact outcomes, and RNG progression.

Run `npm run build`, the focused motion tests, existing skull-redesign and enemy-contact checks, relevant tower-ejection checks, and guest/replay checks for the touched presentation integration. Reuse the 1,000-skull fixture and measure CPU frame time on the same browser/hardware before and after; target no extra draw calls and less than 5% median/p95 frame-time regression. Record actual results; do not treat the target as proof.

Deliver short before/after clips of an isolated skull and mixed combat swarm, captured from the shipping instance route, plus a report with performance and lifecycle checks. Judge at ordinary first-person distance and full gameplay speed as well as slow motion.

The pass succeeds when a player can read a turn's weight and direction, distinguish the tiers' movement character, and feel immediate hit response without losing confidence in where the skull can be hit.
