# Devil Daggers — research and recreation brief

Research date: **12 October 2026**  
Status: **historical pre-production baseline; superseded for current fidelity status by the 13 October replica audit**

Implementation: [Run the playable build](README.md) · [Current full-replica audit](DEVIL_DAGGERS_REPLICA_AUDIT.md) · [Implementation history](BUILD_NOTES.md). The latest user requirement is a **full replica**, superseding the earlier successor direction. The research below preserves the earlier baseline, including explicitly unmeasured values. The new audit recovers the complete raw Survival schedule and arena height field and compares current code directly.  
Requested goal: recreate the complete gameplay of Devil Daggers as faithfully as possible, with improved graphics.

Asset preparation: [Models, materials, and sound shortlist](ASSET_RESEARCH.md).

## 1. Feasibility and target

A complete recreation is a realistic development objective. Its apparent simplicity hides demanding work: movement tuning, projectile timing, many interacting enemies, segmented creatures, resource economy, positional sound, replay support, and stable performance under extreme load.

“Exactly the same” must become a measurable target. Public references establish many rules, but they do not provide Sorath's complete source code or every simulation constant. We should expect a research-and-comparison process rather than assume that matching appearances and enemy health will produce matching gameplay.

The working baseline is **the original Devil Daggers, v3.2 gameplay, using the standard Survival spawnset**. The community library labels v3.2 as its current version; Sorath's news documents that release and subsequent maintenance patches. Confirm the installed build and platform before recording measurements. [Community version constant](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/GameConstants.cs), [official update history](https://steamcommunity.com/app/422970/allnews/)

The project folder name is a working name. Sorath announced **Devil Daggers II** in February 2026, so this project must be clearly identified as an independent recreation, rather than the official sequel. [Sorath announcement](https://steamcommunity.com/app/422970/allnews/)

Asset production should use newly made models, textures, effects, and recordings, or material explicitly supplied for reuse. The current research does not include original game assets or authorize their redistribution.

## 2. Evidence and confidence

Three labels apply throughout this document:

- **Official:** published by Sorath, including the store description and update notes.
- **Community data:** maintained reference data or firsthand player observations; useful starting values, still requiring comparison with the target build.
- **Proposal / unmeasured:** our design direction or a parameter that has not been established.

The DevilDaggers.info pages sometimes returned a loading/error shell through the research browser. Their public backing repositories were therefore inspected directly. Numeric enemy and upgrade data below comes from a pinned revision of `ddinfo-core`: **1d64444d9f31632a3c932657ad13d5b4693df729**, dated 20 August 2026. This is a community reference library, not the original game's source. [Reference project](https://github.com/NoahStolk/ddinfo-core/tree/1d64444d9f31632a3c932657ad13d5b4693df729)

No original game session or replay was inspected during this first pass. Controller measurement and full reference-run annotation remain outstanding. The later [replica audit](DEVIL_DAGGERS_REPLICA_AUDIT.md) recovered the community-hosted default Survival binary and decoded its full schedule and height field; it has not yet compared that file with an installed original-game build.

## 3. Core experience

Devil Daggers is Sorath's single-player survival FPS, released on 18 February 2016. The official description establishes an abyssal arena, magic daggers, crystal upgrades, homing attacks, advanced jumping, leaderboards, and replay viewing. Its engine supports hundreds of enemies with mutual avoidance and positional audio with optional HRTF. [Official game description](https://store.steampowered.com/app/422970/Devil_Daggers/)

The player collects a dagger in a small opening space, enters the arena, survives until contact with an enemy or a fall ends the run, and tries again. Survival time is the central score. [Gameplay overview](https://en.wikipedia.org/wiki/Devil_Daggers)

Our fidelity target is the following repeated decision:

**Move into a useful position → kill the right threat → stop firing long enough to collect resources → prepare for the next spawn.**

The pressure comes from simultaneous responsibilities: aiming, anticipating enemies, maintaining movement, preserving escape routes, and deciding when to stop attacking. Improved visuals must retain that pressure and the ability to read it.

### Scope of a complete recreation

Proposed completeness checklist:

- Opening dagger interaction, arena transition, death presentation, and immediate retry.
- Matching player movement and both ordinary and homing attack modes.
- All four hand levels and the complete gem economy.
- All enemies, secondary spawns, transformations, and segmented weak points.
- Standard spawn sequence, late-game repetition, and arena shrink behavior.
- Distinct positional sounds, visual feedback, and configurable HUD.
- Settings, local best times, run statistics, and local replay recording/playback.
- A separate decision on online rankings, account integration, and custom spawnsets.

Online scores would belong to our own service. Compatibility with Sorath's official score submission or replay services is not assumed.

## 4. Player movement and feel

Officially supported techniques include circle strafing, bunny hopping, dagger jumps, speed boosts, and double jumps. [Official movement features](https://store.steampowered.com/app/422970/Devil_Daggers/)

A firsthand survival guide describes timed hops as the source of speed gain and coordinated strafing/mouse turning as steering. This is a reason to measure Devil Daggers directly rather than adopt a stock Quake controller. The guide also describes a jump sound and brief FOV change as feedback. Treat these as observations, not a complete physics model. [Player movement observations](https://steamcommunity.com/sharedfiles/filedetails/?id=1248222759)

### Parameters still to measure

| Area | Required observations |
| --- | --- |
| Ground movement | Speed, acceleration, deceleration, friction, diagonal normalization |
| Air control | Steering, momentum retention, response to abrupt direction reversal |
| Jumping | Gravity, jump impulse, apex height, flight time, input timing window |
| Bunny hopping | Speed gain, cap if any, landing timing, sound and FOV feedback |
| Dagger jumping | Ground distance, aim angle, shot/jump ordering, second boost conditions |
| Collision | Player dimensions, enemy contact tolerance, edge/fall threshold |
| Camera | Eye height, sensitivity conversion, FOV convention, viewmodel motion |
| Timing | Simulation frequency, pause rules, upgrade slowdown, score-clock behavior |

Proposed measurement method: record controlled runs with fixed input actions, resolution, sensitivity, and FOV. Repeat straight travel, diagonal travel, jump chains, tight turns, and floor shots. Establish tolerances from repeatability before choosing implementation values.

Do not introduce sprinting, automatic hopping, an unrestricted double-jump button, or generous input assistance by accident. Any such change would require an explicit gameplay decision.

## 5. Weapon system

### Inputs and firing rhythm

Ordinary daggers use left mouse: hold for a projectile stream; release early for a shotgun-style burst. Homing uses right mouse after unlocking it. A firsthand strategy guide describes cooldown manipulation used for rapid burst firing, and switching to homing while already streaming to avoid an unwanted homing burst. Shot timing therefore needs an explicit state diagram before implementation. [Firsthand firing guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258)

Dagger travel time, spread, ricochets, launch positions, and shot/stream transitions must be measured. Do not substitute hitscan or a generic shotgun. Ordinary fire and homing need separate accounting; visual projectiles must stay synchronized with damage events.

### Four hand levels — community baseline

| Hand | Unlock | Ordinary burst | Ordinary stream / second | Homing burst | Homing stream / second |
| --- | --- | ---: | ---: | ---: | ---: |
| Level 1 | Start | 10 | 20 | — | — |
| Level 2 | 10 total gems | 20 | 40 | — | — |
| Level 3 | 70 total gems | 40 | 80 | 20 | 40 |
| Level 4 | 150 stored homing | 60 | 106.666 | 30 | 40 |

These are projectile counts, not a promise that every projectile hits. The reported Level 4 rate is preserved as written by the reference library. [Versioned upgrade data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/UpgradesV3_2.cs), [field definitions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/Structs/Damage.cs)

Level 4 is a reserve threshold. The often quoted “220 gems” assumes no homing expenditure after Level 3; spending homing delays that upgrade. [Firsthand progression explanation](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258)

### Homing exceptions

The reference reports 10 damage against most enemies, but only 1 against Leviathan and Orb. Orb and spider eggs are excluded from automatic targeting. Ghostpede resists direct homing hits and attracts homing projectiles. Level 4 adds splash; the exact splash value is marked uncertain in the reference and needs measurement. Squid III also has a reported Level 3/4 effectiveness anomaly. [Reference homing notes](https://github.com/NoahStolk/ddinfo-web/blob/main/src/DevilDaggersInfo.Web.Client/Pages/Wiki/EnemiesPage.razor)

These exceptions need a documented damage/targeting matrix. A single global “homing damage multiplier” would not capture them.

## 6. Gems and the resource economy

Gems expire after approximately 10 seconds. When the player stops firing, gems are attracted toward them; stream fire preserves their prior movement vector; shotgun fire pushes them away. This creates deliberate collection windows rather than continuous automatic pickup. The lifetime and movement states are documented by the community gem reference; velocities, impulses, and collection radius remain unmeasured. [Gem behavior](https://devildaggers.fandom.com/wiki/Gem)

Spiders compete for these resources and convert consumed gems into eggs. Deliberately leaving Squid I/II alive can produce more gem-bearing skulls, a player strategy called farming. Squid III's offspring do not offer the same gem reward. [Enemy behavior data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs), [farming observations](https://devildaggers.fandom.com/wiki/Advanced_Mechanics)

Design inference: the economy regulates tempo. Constant fire may control enemies while sacrificing future power; farming increases resources and crowd pressure together. Our recreation should preserve this tradeoff instead of making gems easier to collect through a graphics update.

Proposed resource ledger: distinguish gems released, collected, expired, and eaten; homing acquired, spent, stored, and consumed by enemies. Never conflate total collected gems with the current homing reserve.

## 7. Enemy roster

The official store advertises 13 enemies. The community's granular v3.2 dataset contains **22 entries** when transformed skulls, eggs, and spiderlings are included. Use the granular list for implementation coverage; do not infer missing content from the marketing count. [Official roster claim](https://store.steampowered.com/app/422970/Devil_Daggers/), [complete reference dataset](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemiesV3_2.cs)

### Health, rewards, and first scheduled appearance

Community values below. A dash denotes a secondary spawn rather than a fixed first-spawn time. **HP is aggregate** for enemies with several gem weak points; dividing by gem count gives the reference weak-point HP. Reward is the enemy's own gems, excluding gems from its offspring. [Numeric data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemiesV3_2.cs), [data definitions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/Objects/Enemy.cs)

| Enemy | HP | Gems | First spawn (s) |
| --- | ---: | ---: | ---: |
| Squid I | 10 | 1 | 3 |
| Squid II | 20 | 2 | 39 |
| Squid III | 90 | 3 | 244 |
| Skull I | 1 | 0 | — |
| Skull II | 5 | 1 | — |
| Skull III | 10 | 1 | — |
| Skull IV | 100 | 0 | — |
| Centipede | 75 | 25 | 114 |
| Gigapede | 250 | 50 | 259 |
| Ghostpede | 500 | 10 | 442 |
| Spider I | 25 | 1 | 39 |
| Spider II | 200 | 1 | 274 |
| Spider Egg I | 3 | 0 | — |
| Spider Egg II | 3 | 0 | — |
| Spiderling | 3 | 0 | — |
| Leviathan | 1500 | 6 | 350 |
| Orb | 2400 | 0 | — |
| Thorn | 120 | 0 | 447 |
| Transmuted Skull I | 10 | 0 | — |
| Transmuted Skull II | 20 | 1 | — |
| Transmuted Skull III | 100 | 1 | — |
| Transmuted Skull IV | 300 | 0 | — |

### Behavior summary — community baseline

- **Squids:** slow clockwise spawners near the edge. I/II release 10 Skull I plus one Skull II/III; III releases 15 Skull I plus one Skull IV. First release follows appearance by 3 seconds; subsequent releases repeat every 20 seconds.
- **Skulls:** I pursues slowly; II moves between randomized positions; III/IV pursue quickly.
- **Spiders:** raise their heads, attract gems, produce eggs, and move erratically. I faces the player after 3 seconds, II after 9. Sustained damage affects head exposure.
- **Eggs/spiderlings:** eggs hatch after 10 seconds into five spiderlings; spiderlings advance in irregular bursts.
- **Centipede:** emerges after a delay, then pursues and burrows. **Gigapede:** pursues immediately after emergence. **Ghostpede:** circles overhead and consumes homing.
- **Leviathan:** delayed activation, counterclockwise rotation, periodic skull transmutation, then Orb release on death.
- **Orb:** tracks the player and transmutes skulls; continuous damage suppresses its activity.
- **Thorn:** delayed emergence creates a spatial obstacle.

[Versioned behavior descriptions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs)

Transmutation preserves skull tier but replaces its health with the transformed tier's full health. Partially damaging a skull before conversion does not preserve that damage. [Transformation rules](https://github.com/NoahStolk/ddinfo-web/blob/main/src/DevilDaggersInfo.Web.Client/Pages/Wiki/EnemiesPage.razor)

### Proposed fidelity work per family

| Family | What must be recorded beyond HP |
| --- | --- |
| Squids | Rotation, weak-point positions, appearance animation, offspring placement |
| Skulls | Speed, steering, separation, avoidance, collision, individual sounds |
| Spiders | Head exposure, damage reactions, resource attraction, egg production |
| Segmented creatures | Segment spacing, path following, weak-point tracking, emptied segments, collision during death |
| Leviathan / Orb | Activation, beckoning geometry, conversion timing, suppression, transition |
| Thorn / eggs | Telegraphs, collision activation, placement, lifetime, destruction |

Proposed encounter interpretation: skulls constrain movement, squids sustain population, spiders punish neglected resources, segmented creatures demand precise path reading, Leviathan/Orb punish accumulated skulls, and thorns reduce usable space. This interpretation guides testing; it is not an additional rule from Sorath.

## 8. Spawn sequence and escalation

The standard level has an authored schedule. Enemy offspring and survival depend on the evolving run state, so a scheduled sequence does not mean every run develops identically. The reference format contains enemy types and spawn delays, together with arena and shrink settings. [Spawnset format research](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/spawnset-binary.md)

The first-spawn column above supplies **milestones, not the full schedule**. It cannot drive a faithful recreation by itself: repeated squids, simultaneous appearances, empty delay entries, secondary events, and the ending loop also matter.

Proposed encounter phases for organizing research:

| Time range | Research focus |
| --- | --- |
| 0–39 s | Opening squid rhythm and first resource collection |
| 39–114 s | Squid II and Spider I interaction |
| 114–244 s | Centipede rewards, movement, progression |
| 244–350 s | Squid III, Gigapede, Spider II escalation |
| 350–442 s | Leviathan and kill-dependent Orb transition |
| 442 s onward | Ghostpede, thorns, repeated late-game pressure |

These ranges are an analytical grouping, not named waves in the game. Appearance can lag scheduled spawn: emerging creatures must be checked frame by frame.

The later [replica audit](DEVIL_DAGGERS_REPLICA_AUDIT.md) supplies the complete 118-record raw schedule, cumulative delay semantics, loop boundary and the community reference's discrete acceleration algorithm. Visible emergence, location rules and an annotated 1,200-second original run still need direct measurement; the raw file does not contain spawn positions.

## 9. Arena and spatial orientation

The community format documents a 51 × 51 height grid and default shrink controls of approximately 50 start radius, 20 end radius, and 0.025 shrink rate in game units. Those values imply 1,200 seconds to traverse the radius difference **if interpreted as units per second**. Validate the interpretation and distinguish the shrink boundary from the actual occupied tile footprint. [Arena format and default header](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/spawnset-binary.md)

The arena reference describes sinking edge tiles, concentric lighting cues, and distinct directional ambience. Its tile-diameter description uses a different representation from the binary radius values; do not treat the two as interchangeable units. [Arena observations](https://devildaggers.fandom.com/wiki/The_Arena)

Proposed graphics constraint: preserve the flat combat surface, readable edge, usable center/perimeter cues, and measured shrink. Additional visible stone relief should not accidentally become collision terrain or obscure small enemies.

## 10. Sound, feedback, and interface

Sound is part of combat information. Sorath documents positional audio and optional binaural HRTF; v3.2 specifically increased the priority of nearby Skull II/III chatter. [Official audio features](https://store.steampowered.com/app/422970/Devil_Daggers/), [audio priority change](https://steamcommunity.com/app/422970/allnews/)

Proposed audio deliverables: distinct idle/approach signatures, spawn and emergence cues, weak-point hit confirmation, enemy death cues, gem pickup, hand upgrades, homing consumption, jump feedback, directional ambience, and death feedback. Test identification with threats outside the view and with a crowded arena. Mixer priority must keep dangerous nearby enemies audible.

Official updates document replay scrubbing, statistics/graphs, HUD toggles, a gem/homing counter, a default FOV change to 90, and local storage of the ten most recent runs. The v3 update introduced top-down replay viewing. These are relevant completeness features, not just polish. [Official interface and replay updates](https://steamcommunity.com/app/422970/allnews/)

Persistent dagger awards are separate from in-run hand upgrades: Default at start; Bronze at 60 seconds; Silver 120; Golden 250; Devil 500; Leviathan 1,000. The lobby dagger does not alter combat power. [Award thresholds](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/Daggers.cs), [lobby dagger explanation](https://github.com/NoahStolk/ddinfo-web/blob/main/src/DevilDaggersInfo.Web.Client/Pages/Wiki/DaggersPage.razor)

## 11. Better graphics — proposed direction

The visual goal is a sharper, more detailed abyssal horror presentation that retains the original's silhouettes, scale, darkness, and readable red weak points. “Better” should mean that detail and animation improve the image without increasing the time needed to identify a threat.

| Element | Proposed improvement | Gameplay constraint |
| --- | --- | --- |
| Enemies | Detailed bone, flesh, tendrils, and materials | Retain measured silhouette and collision dimensions |
| Arena | Cracked stone, surface shading, sinking tile detail | Keep the edge and small threats legible |
| Weak points | Distinct crystal geometry and restrained emission | Preserve size, exposure, and hit feedback |
| Daggers | Clear trails and impact effects | Show trajectory without hiding targets |
| Lighting | Controlled shadows and local light | Avoid exposure shifts that conceal enemies |
| Animation | Better deformation and emergence | Match timing and collision activation |
| Gore / particles | More convincing impact and death effects | Cap clutter and measure dense-scene cost |
| Camera | Sharp image and stable motion | Avoid mandatory blur, shake, or latency |

Prepare three still-image directions before asset production: faithful dark horror, detailed stylized horror, and restrained realism. Choose using both visual preference and threat-recognition checks. No engine, graphics style, or asset pipeline is committed in this first document.

A useful later comparison is the same enemy layout at the same FOV in the original and the recreation. Compare recognition of skull tiers, red gems, emptied segments, the floor edge, and upcoming emergence cues. Spectacular lighting that lowers recognition would fail the stated goal.

## 12. Technical planning — proposals only

Required future systems: player controller, weapon state machine, projectile simulation, enemy behaviors, swarm separation, segmented path following, per-weak-point damage, gem lifecycle, spawn timeline, shrinking arena, audio prioritization, run state, UI/settings, statistics, and replay capture/playback.

Keep simulation separate from presentation. Rendering quality should not alter movement, projectile count, damage, spawn timing, or scores. Fixed-step simulation and reproducible randomness are candidates for replay reliability; their final design depends on measured behavior.

Performance planning must include hundreds of enemies, dense ordinary/homing fire, many weak points, particles, corpses, and overlapping sounds. A proposed baseline is stable 120 FPS on agreed desktop hardware, with scalable visual settings. This is a target, not a tested claim; choose hardware and resolution first.

Do not choose an engine based only on visual demonstrations. Compare candidates later on controller control, swarm/segment costs, input latency, audio, replay needs, platform support, profiling, and asset workflow. No dependencies or engine scaffolding have been installed for this research.

## 13. Questions and measurements before code

### User decisions to settle

1. Target operating systems and minimum hardware; native desktop versus browser delivery.
2. Preferred graphics direction and acceptable differences in presentation.
3. Standard Survival only at first, or custom levels/practice tools too.
4. Local rankings/replays versus a full independent online leaderboard.
5. Whether every measured quirk should be retained, or documented exceptions are acceptable.

### Research tasks

- [ ] Confirm access to the original game and record exact build/platform/settings.
- [ ] Annotate reference runs through early progression, 500 seconds, and late-game loops.
- [ ] Complete the spawn ledger and separate spawn from emergence/activation.
- [ ] Measure movement and camera parameters using repeated controlled actions.
- [ ] Measure tap/hold transitions, cooldowns, spread, projectile velocity, and ricochets.
- [ ] Measure gem lifetime, attraction, pushback, reserve conversion, and upgrade feedback.
- [ ] Record each enemy's speed, turning, avoidance, contact dimensions, and sounds.
- [ ] Record weak-point exposure, per-segment HP, destroyed-segment collision, and death timing.
- [ ] Measure Leviathan/Orb transition and beckoning; validate homing exceptions.
- [ ] Verify arena footprint, tile sink behavior, and shrink over time.
- [ ] Inventory settings, HUD, statistics, death causes, and replay controls.
- [ ] Prepare visual references and recognition criteria without starting game implementation.

### Known disagreements / traps

- Older guides omit later hand levels or later enemies; always attach a version to values.
- Reported Orb timing can confuse release, visible appearance, and activation. The versioned behavior reference reports release about 3.3167 seconds after Leviathan death and activation 10 seconds after death. Measure both separately. [Transition data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs)
- Arena tile counts and binary radii use different scales.
- Full enemy HP does not imply damage can be applied anywhere on its body.
- Gem totals do not determine Level 4 if homing has been spent.
- v3.2 changed spawn-animation hitbox scaling, homing detonation/overkill behavior, and Ghostpede orientation. Baseline older observations accordingly. [Official v3.2 changes](https://steamcommunity.com/app/422970/allnews/)

## 14. Later development order and acceptance

This was the pre-production roadmap. The user authorized implementation on 13 October 2026; the first playable build and its deviations are documented in [BUILD_NOTES.md](BUILD_NOTES.md).

| Stage | Deliverable | Acceptance evidence |
| --- | --- | --- |
| A — specification | Measurement sheets, full schedule, references, platform/art choice | Unknowns identified; core numbers supported |
| B — movement | Minimal arena and controller | Recorded travel, jump, turn, and boost comparisons |
| C — weapon/economy | Four hand levels, gem states, ordinary/homing fire | Timing and resource scenarios agree with baseline |
| D — enemy families | Every listed entity and transformation | Per-enemy behavior and damage comparisons |
| E — complete run | Full timeline, shrinking arena, late-game loops | Opening and long-run checkpoints match |
| F — presentation | Models, materials, effects, sound | Readability and frame-time targets met |
| G — complete product | Settings, persistence, stats, replay, optional online service | End-to-end runs and reliable replay verification |

A convincing recreation should pass comparisons for progression timing, resources lost to spiders/expiry, per-weak-point damage, movement paths, enemy emergence, and crowded late-game behavior. A run lasting 500 seconds is one checkpoint; it does not establish that the endless game is complete.

## 15. Source index

Sources are linked next to the claims they support. Main references:

1. [Sorath's Steam game page](https://store.steampowered.com/app/422970/Devil_Daggers/) — official scope and advertised features.
2. [Sorath's official update history](https://steamcommunity.com/app/422970/allnews/) — version changes, interface, replay, and sequel announcement.
3. [Pinned ddinfo-core reference](https://github.com/NoahStolk/ddinfo-core/tree/1d64444d9f31632a3c932657ad13d5b4693df729) — versioned numerical and behavioral data.
4. [DevilDaggers.info website source](https://github.com/NoahStolk/ddinfo-web) — explanatory wiki rendering and combat exceptions.
5. [V3 Strategy Guide, 2019](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258) — firsthand firing and progression observations; predates v3.2.
6. [V3 Survival Guide, 2017](https://steamcommunity.com/sharedfiles/filedetails/?id=1248222759) — firsthand movement observations; predates v3.2.
7. [Community gem reference](https://devildaggers.fandom.com/wiki/Gem), [arena reference](https://devildaggers.fandom.com/wiki/The_Arena), [advanced mechanics](https://devildaggers.fandom.com/wiki/Advanced_Mechanics) — supplemental observations.

This first document provides a researched foundation and a concrete route to a complete specification. It does **not** claim that all constants, the full schedule, or exact behavioral parity have already been established.
