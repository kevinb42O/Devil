# Replica implementation status — 13 October 2026

Current target: original Devil Daggers v3.2, V3 Survival. This document describes the implementation **after** the research audit. [DEVIL_DAGGERS_REPLICA_AUDIT.md](DEVIL_DAGGERS_REPLICA_AUDIT.md) is the preserved pre-implementation snapshot and measurement backlog, not the current feature inventory.

## Implemented in this pass

- Replaced the invented timeline with all 118 original Survival records, including waits and simultaneous groups. Infinite looping uses discrete 60 Hz reference stepping, per-wave acceleration, and Ghostpede replacement every third wave. Locations remain seeded port logic; the raw reference file does not specify positions.
- Imported the complete 51 × 51 arena height field. Collision and rendering now use the same per-tile support/sinking function, with a uniform .62 conversion from original world units. Removed continuous circular clipping and the artificial cylinder side wall.
- Added all 22 granular enemy kinds/states with reference aggregate health, crystal counts, and own rewards. The missing native meshes/textures now load for all families.
- Corrected squid offspring: I → ten Skull I + Skull II; II → ten Skull I + Skull III; III → fifteen Skull I + Skull IV. First emission is three seconds after appearance, repeating every twenty seconds.
- Squid towers now drift straight toward the center on their original spawn bearing, without circling the perimeter, while rotating clockwise about their own axes. At the center translation stops and rotation continues. Models and crystal damage zones share the rotation. Clockwise spin/inward drift/outward initial weak point are documented in the [detailed enemy guide](https://steamcommunity.com/sharedfiles/filedetails/?id=692059731) and [V3 strategy guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258). Rates remain explicit tuning: 0.5 world units/second inward, 0.28 radians/second spin. All three rendered rigs were checked over 600 real simulation ticks: 2.5 units inward, zero tangential travel, 1.4 radians clockwise. New runs use replay rules version 6; versions 4/5 replay with their previous tower motion.
- Dropped gems are 40% larger, emissive, and have batched warm halos. The nearest eight cast warm light on arena tiles in both quality modes; attached weak-point crystals also use a brighter self-lit material. Lighting stays bounded as gem counts increase. `node tests/gem-browser.mjs` verifies scale, halo count, shader compilation and actual floor pixel brightening in both modes.
- Added Skull II random-target intervals, separate pursuing skull tiers, and four transmuted forms that reset to their reference HP when hit by a beckoning wave.
- Added Spider II's nine-second lift, its egg type, and both eggs' ten-second/five-spiderling hatch behavior.
- Added pede emergence, Centipede idle/pursuit/burrow states, 50-segment Gigapede, ten-crystal Ghostpede, and Thorns.
- Added Leviathan's activation/beckon timings, six 250-HP crystals, kill-relative Orb drop and activation, and Orb beckoning suppression under sustained hits. Rings are implemented with radial transformation; original pull/release trajectories remain outstanding.
- Replaced floating weapon cooldowns with integer tick scheduling. Regular stream averages are now 20/40/80/106.666… daggers per second; homing is 40 per second. Burst counts remain 10/20/40/60 and homing 20/30.
- Each hand now widens the firing cone and increases flame/ember counts and sizes. Shared tuning keeps projectile spread and visual spread aligned; matching ember lifetimes preserve increasing sustained density. Upgrade bursts also grow at every level. Replay rules version 3 includes the spread change. Temporary keys 1–4 select hand levels for testing and mark the run as practice.
- Homing now selects tap/release versus stream and takes priority over ordinary fire. Entering homing during a primary stream avoids an unwanted burst. Holding during burst recovery shortens recovery; its chosen 0.5/0.375-second recovery constants still need original-game calibration.
- Added homing damage budgets for four basic skull kills, Level IV delayed adjacent-target splash, boss one-damage exceptions, Squid III level-dependent behavior, dead-segment ricochets, and Ghostpede interception. Splash radius and target/steering/interception details remain port tuning.
- Preserved mouse button edges across render frames so short taps are not lost. Long frame delays now retain simulation backlog, processing a bounded number of steps per rendered frame instead of discarding elapsed time.
- Added precise-hop speed/FOV feedback, terrain support, and downward initial gem drop velocity. These are explicit, testable approximations pending measurements.
- Imported 275 original WAV recordings from the same archived v3.2 package used for rendering assets. Weapon, pickup, upgrade, death, enemy, boss and cardinal-direction ambience use original recordings. Added persistent positional enemy emitters with nearby Skull II/III priority. Mixing, loop phases, voice budget and attenuation remain unmeasured.
- Fixed the imported material's missing instance transforms, including loose gems. Skulls, eggs, and spiderlings now use batches that grow with population rather than one set of draw calls per enemy.
- Added practice starts with selected time/hand/reserve. Practice scores do not overwrite standard Survival records. Standard records use a new storage key, so old prototype times are not promoted into the new rules.
- Added seeded input replay recording, seeking, pause/play, top-down view, ±3/±10-second keyboard seeking, export, and IndexedDB storage retaining ten recent runs plus explicitly kept runs. These are this port's replay files, not native Devil Daggers replay compatibility.
- Added resource, homing, species kill, upgrade, boss and peak statistics to the run data. Default threat markers and advance spawn notices are disabled; optional cues remain available.

## Verification

### Sustained-fire readability pass

Sustained fire now has separate presentation tuning from bursts. Compact flames live for 55–85 ms and move at 9–15 world units/second, with reduced opacity and fewer small embers drifting sideways. This prevents the higher hands' muzzle effects from forming a long overlapping column along the aiming line. Burst effects retain their stronger hand-dependent escalation. Projectile counts, spread, trajectories, damage, and replay rules are unchanged.

`npm run test:weapon-readability` captures three seconds of sustained primary fire with hands III and IV against a surviving target at 4, 12, and 30 world units. Before/after screenshots and run counts are in `artifacts/weapon-readability/`; target visibility was visually inspected. All 49 current automated tests, the production build, and the projectile browser checks pass. These checks cover this presentation pass, not a completed movement/weapon-feel calibration.

### Original implementation-pass verification

**40 automated tests passed** and the production build completed for the original implementation pass. That automated suite covered original milestone groups, accelerating loop substitutions, tile support/shrink, all enemy HP/crystal totals, offspring, weapon throughput, homing controls/exceptions/splash, emergence protection, Spider II brood timing, Orb transition, transmutation/stun, practice initialization and deterministic replay/seek.

The real-browser checks cover ordinary play, all 22 enemy rendering families, original audio loading, practice groups, a tap delivered between frames, replay seeking/top-down, run history/keep, and boss initialization. A 500-skull renderer fixture also verifies instance transforms, capacity growth to 512, and five draw calls for both one and 500 skulls in its isolated low-quality scene. This is a draw-call check, not an FPS benchmark. These establish implemented behavior and browser integration; they do not establish native-game parity or a frame-rate guarantee.

## Still required for a full replica

1. Measure player movement, hop timing/boost/decay, air steering, dagger jumps, eye/player dimensions, projection and input sensitivity against the original. Current values remain approximations.
2. Match enemy collision shapes, projectile blocking, exact turn/avoidance/stun behavior, spawn placement, pede path/burrow details and corpse lifecycles. Current state machines reproduce documented broad behavior but not the original solver.
3. Reproduce boss pull/transmute/release motion, full beckoning geometry and remaining boss collision behavior.
4. Calibrate projectile spread, velocities, homing selection/interception, piercing, splash and ricochets through controlled fixtures. Matching reference counts is necessary but insufficient.
5. Add the original dagger pickup lobby and trophy presentation, upgrade slowdown, original death camera, complete settings/interface, and remaining shader/animation/particle/decal behavior.
6. Calibrate original audio levels, timing, phase behavior and full sound-event coverage. Original recordings are present; the browser mixer is a port.
7. Add independent online ranking/account services and decide whether native replay/mod/custom-spawnset formats should be supported. No original-service integration is implemented.
8. Continue profiling crowded late-game frame times and memory on target hardware. A controlled Chrome fixture with 300 skulls and 280 daggers measured about 8.5 ms per simulation tick before the spatial collision lookup, and 1.6–2.1 ms after. This is a fixture benchmark, not an endgame FPS certification. Active instance buffer ranges, unchanged floor caching, single-pass particles and a 1.25 high-quality pixel-ratio cap also reduce rendering work. `npm run test:performance` checks all three tower rotations and idle particle uploads, and saves local timing results.

## Source locations

- [src/survival-data.ts](src/survival-data.ts): decoded reference constants, records and height field.
- [src/survival.ts](src/survival.ts): infinite schedule.
- [src/arena.ts](src/arena.ts): terrain and sinking.
- [src/enemy-kinds.ts](src/enemy-kinds.ts): roster and numeric specs.
- [src/simulation.ts](src/simulation.ts): movement, weapon, resource and enemy state machines.
- [src/original-enemies.ts](src/original-enemies.ts): native asset rigs and static batching.
- [src/audio.ts](src/audio.ts): original sound mapping and positional emitters.
- [src/replay.ts](src/replay.ts): input recording, playback and browser storage.

Source hashes for this pass are recorded in [implementation-source-hashes.json](research/devil-daggers-v3/implementation-source-hashes.json). Restart/resume resets the frame-clock boundary, and pointer-lock exit events are ignored during an active capture request to avoid a retry race.

No local Git commit exists yet; the repository remains an unborn branch with the existing project files untracked. No commit, push or external publication was performed.
