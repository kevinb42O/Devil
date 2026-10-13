# Devil Daggers: complete-replica mechanics audit

Research and code audit: **13 October 2026, before the implementation pass**. This is a historical snapshot; see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current implemented features and remaining work. Target: **original Devil Daggers v3.2, standard V3 Survival**, including subsequent maintenance features. The user's current requirement is a full replica; earlier successor design choices are deviations to resolve.

## What this audit establishes

Our build is a working arena-survival prototype with some original rendering assets. It is not mechanically equivalent to Devil Daggers. Eight of the reference's 22 granular enemy entries exist, and even those eight use partly approximate AI. The schedule, arena, movement, weapon state machine, audio, and surrounding game features all need work. Roster coverage is not a percentage of total fidelity.

This audit combines official descriptions/update notes, firsthand player guides, the authors' public community-tool source, a downloaded default Survival binary, and direct inspection of our code. It does **not** claim access to Sorath's gameplay source, exhaustive knowledge of undocumented constants, or a measured match against a running original game. No full gameplay video was watched or annotated during this audit. Public research reaches its limit on physics, AI, collision, and frame timing; the remaining measurement tasks are explicit below.

The local repository has an unborn `main` branch, no commits, and no configured remote. Therefore there is no local commit or upstream revision to cite. File hashes in [audit-source-hashes.json](research/devil-daggers-v3/audit-source-hashes.json) identify the inspected source snapshot. Existing working files were preserved; gameplay code was not changed by this audit.

The public sources were cloned and pinned at:

- [ddinfo-core: 1d64444d9f31632a3c932657ad13d5b4693df729](https://github.com/NoahStolk/ddinfo-core/tree/1d64444d9f31632a3c932657ad13d5b4693df729).
- [ddinfo-web: e3e8768f12b5240d4eaf70a9421965b5a83b1e39](https://github.com/NoahStolk/ddinfo-web/tree/e3e8768f12b5240d4eaf70a9421965b5a83b1e39).

The community site's rendered wiki returned an application-error shell. Its source and working read-only API were used instead. Community references are evidence, not official certification. Old v1/v2 guides contain incompatible values; the file-format documentation also includes unknown fields. Those cannot be treated as settled v3.2 mechanics.

## 1. Coverage at a glance

| System | Present in our code | Remaining replica work |
| --- | --- | --- |
| Survival/death/retry | Contact death, fall death, timer, retry, local best | Original collision/death behavior, opening lobby, accurate clock and death presentation |
| Movement | Friction, acceleration, gravity, jumping, air steering | Measure and reproduce timed-hop boosts, turn response, double dagger jumps, camera feedback |
| Ordinary weapon | Physical stream and release burst, level-dependent counts | Correct cadence, Level IV throughput, shotgun tech, spread, spawn offset, ricochet rules |
| Homing | Reserve, nearest-target steering, generic damage | Matching release/hold controls, simultaneous-input rules, piercing, splash, detonation, enemy exceptions |
| Gems | Attraction windows, drift, burst push, expiry, reserve accounting | Original floor settling, velocity/drag/pickup/push values and upgrade slowdown |
| Squids/skulls | Squid I/II, Skull I/II | Squid II offspring correction, Skull II wandering/dodging, remaining variants and transmutation |
| Spiders | Spider I, one egg type, spiderlings | Spider II/egg II, original motion, gem attraction and protective animation/collision |
| Pedes | Centipede segments and rewards | Centipede emergence/burrow; Gigapede; Ghostpede; accurate segment geometry and collision |
| Boss | Nothing | Leviathan, Orb, beckoning rings, transmutation, stun, boss transition |
| Obstacles | Nothing | Thorns, emergence, collision and projectile interaction |
| Standard schedule | A different 14-event arrangement and invented loop | Imported 118-record schedule, correct loop acceleration and substitutions |
| Arena | Flat analytic radius, cosmetic tile grid | Actual height field, tile support/fall behavior, original scale and shrink |
| Visuals | Original meshes/textures for current roster and hands; adapted effects | Original rigs/animations, original scene/shader/lighting/decal behavior, HUD/menu parity |
| Sound | Substitute one-shots and synthesized warnings with HRTF panning | Distinct enemy voices, continuous emitters, original mixing and weapon/upgrade audio |
| Meta features | Best and last-run summary, basic settings | Dagger trophies, run history, replays/seeking, statistics, rankings, settings parity |
| Validation | 23 automated tests pass | Reference comparison fixtures, controlled measurements, dense endgame performance |

## 2. Original enemy inventory and our differences

HP below is aggregate regular-dagger damage. Multiple crystal enemies distribute it across weak points. `Own gems` excludes offspring. This distinction matters: Squid I itself yields **one** gem, while its initial Skull II can yield another; it is not a two-gem squid. Numeric reference: [EnemiesV3_2.cs](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemiesV3_2.cs); [field definitions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/Objects/Enemy.cs).

| Enemy | HP | Own gems | First scheduled spawn | Our status |
| --- | ---: | ---: | ---: | --- |
| Squid I | 10 | 1 | 3 s | Present; one 10-HP crystal |
| Squid II | 20 | 2 | 39 s | Present; two 10-HP crystals; wrong offspring |
| Squid III | 90 | 3 | 244 s | Missing; three 30-HP crystals |
| Skull I | 1 | 0 | Offspring | Present; approximate pursuit |
| Skull II | 5 | 1 | Squid I offspring | Present; wrong movement model |
| Skull III | 10 | 1 | Squid II offspring | Missing |
| Skull IV | 100 | 0 | Squid III offspring | Missing |
| Transmuted Skull I | 10 | 0 | Boss interaction | Missing |
| Transmuted Skull II | 20 | 1 | Boss interaction | Missing |
| Transmuted Skull III | 100 | 1 | Boss interaction | Missing |
| Transmuted Skull IV | 300 | 0 | Boss interaction | Missing |
| Centipede | 75 | 25 | 114 s | Present; 25 × 3 HP; wrong lifecycle/pathing |
| Gigapede | 250 | 50 | 259 s | Missing; 50 × 5 HP |
| Ghostpede | 500 | 10 | 442 s | Missing; 10 × 50 HP |
| Spider I | 25 | 1 | 39 s | Present; approximate animation/AI |
| Spider II | 200 | 1 | 274 s | Missing |
| Spider Egg I | 3 | 0 | Spider I offspring | Present |
| Spider Egg II | 3 | 0 | Spider II offspring | Missing |
| Spiderling | 3 | 0 | Egg hatching | Present; approximate burst motion |
| Leviathan | 1500 | 6 | 350 s | Missing; six 250-HP nodes |
| The Orb | 2400 | 0 | Leviathan death | Missing |
| Thorn | 120 | 0 | 447 s | Missing |

The official store's advertised 13 enemies and the reference's 22 entries use different counting granularity. Transmutations and secondary entities must be counted for implementation. Andras is an unfinished v2 custom-spawnset entity, not a requirement for current standard Survival. [Official feature list](https://store.steampowered.com/app/422970/Devil_Daggers/); [versioned enemy descriptions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs).

### Squids and skulls

Reference squid emission begins three seconds after appearance, then repeats every 20 seconds. Squid I produces ten Skull I plus one Skull II; Squid II produces ten Skull I plus one Skull III; Squid III produces fifteen Skull I plus one Skull IV. Squids move slowly clockwise near the perimeter. Skull I pursues slowly, Skull II repeatedly heads toward random positions for 1.6–2.5 seconds, and Skull III/IV pursue quickly. Exact acceleration, steering and evasive response still need measurement. [Behavior data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs).

Our `updateEnemies()` gives **both** squid types the Squid I offspring pattern. Our Skull II directly chases the player at speed 5.6 instead of following the documented random-target behavior. The common swarm model adds local separation but no explicit dagger avoidance, stun response, enemy-specific turn limit, or momentum. These affect early survival and farming before any missing boss appears.

### Spiders and eggs

The reference describes three seconds before Spider I faces the player and nine seconds for Spider II. Facing spiders consume gems and eject eggs individually. A hit followed by one second without damage triggers head hiding. Eggs hatch five spiderlings after ten seconds. Spiderlings move in bursts with random offsets. [Behavior data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs).

Our Spider I has these broad phases, stays outside the analytic edge, and implements one-gem/one-egg conversion. However, its angular motion, radial offset, head curves, mouth pull, ejection interval, egg flight, and reopening duration are chosen constants. Gem attraction depends on head exposure rather than an independently measured facing condition. Spiderlings pulse straight toward the player without an explicit random-offset target. Spider II and its egg are absent. The original v3.2 scales spider collision with its spawn animation; our common contact sphere uses an age gate instead. [Official v3.2 notes](https://steamcommunity.com/games/422970/announcements/detail/3055122329856629760).

### Pedes and Thorns

Centipede, Gigapede, Ghostpede and Thorn emerge about three seconds after their scheduled spawn. Centipede initially flies idly, then pursues, and burrows after 15 seconds emerged or when the player approaches its head. Gigapede immediately pursues after emergence. Ghostpede circles high above the arena and intercepts homing. Thorn occupies space. [Behavior reference](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs).

Our Centipede immediately follows a direction toward the player, varies height sinusoidally, and trails 25 linked points. It never burrows or passes through a measured idle phase. Its damage spheres are segment-centered rather than certified crystal locations. All segments remain lethal under the current contact check even after their crystals are removed; the exact original body/contact rules require comparison. The other two pede species and Thorns are entirely absent. Original v3.2 also makes destroyed Gigapede legs darker and orients emerging Ghostpede weak points inward. [Official update](https://steamcommunity.com/games/422970/announcements/detail/3055122329856629760).

### Leviathan, Orb and skull transmutation

The reference places Leviathan activation 8.5333 seconds after its 350-second spawn. First beckoning follows at spawn age 13.5333, then every 20 seconds. It rotates counter-clockwise. After its death the Orb is dropped after 3.3167 seconds and becomes active ten seconds after the death. Its beckoning interval is 2.5333 seconds; sustained fire stuns it. These are separate clocks, not a fixed Orb spawn time. [Boss lifecycle data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs).

Skulls contacting a beckoning ring are pulled in and returned as the corresponding transmuted type at full health. Partially damaging an ordinary skull does not carry that damage into its transformed form. The ring geometry, pull/release motion, already-transmuted interactions and exact stun response need measurement. [Transmutation explanation](https://github.com/NoahStolk/ddinfo-web/blob/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Client/Pages/Wiki/EnemiesPage.razor).

None of these entities, states, rings, transformations or boss milestones exist in our simulation. This removes a major change in the original game's difficulty and tactics.

## 3. Exact Survival schedule recovered

The default V3 file was fetched from the site's [default-spawnset API](https://devildaggers.info/api/spawnsets/default?gameVersion=V3_0). Its route maps v3 variants to the same V3 file: [controller implementation](https://github.com/NoahStolk/ddinfo-web/blob/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Server/Controllers/Main/SpawnsetsController.cs).

Saved evidence:

- [Full raw schedule CSV](research/devil-daggers-v3/survival-spawns.csv): all 118 records, including waits and simultaneous spawns.
- [Reference JSON](research/devil-daggers-v3/reference-data.json): schedule, header, 22 enemies and four upgrades.
- [Arena height field](research/devil-daggers-v3/survival-arena.json): all 2,601 serialized heights.
- [Downloaded binary](research/devil-daggers-v3/survival-v3.bin): 13,784 bytes; SHA-256 `507b806debe1019464899ce5422c42e78c1b03749d0880089d3a0464bc441767`.

The file-format parser and byte lengths were checked against [spawnset-binary.md](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/spawnset-binary.md). This is a decoded community-hosted reference, not a comparison with an installed game's file.

| Time | Original scheduled events | Our schedule |
| --- | --- | --- |
| 3 | Squid I | Matches type/time |
| 14, 19, 24 | Squid I each time | Instead 16 and 28; one squid absent |
| 39 | Squid II + Spider I | Matches types/time |
| 49, 64, 79, 94 | Squid II + Squid I each time | Different single events/times |
| 109 | Squid II | Missing exact event |
| 114 | Centipede | Scheduled, but emergence behavior differs |
| 119 | Spider I | Missing; our next spider is at 145 |
| 134, 144, 154, 164 | Squid II + Squid I each time | Different arrangement |
| 174 | Centipede + three Spider I | Missing; our centipede is at 160 |
| 184, 189, 194 | Squid II + Squid I each time | Invented loop instead |
| 199 | Three Spider I | Missing |
| 229 | Six Squid I | Missing |
| 239 | Three Squid II | Missing |
| 244 | Squid III | Missing entity/event |
| 259 | Three Gigapedes | Missing entity/event |
| 274 and 289 | Spider II + two Spider I each time | Missing |
| 304 | Three Squid III | Missing |
| 330 | Three Squid II | Missing exact event |
| 350 | Leviathan | Missing |
| 365, 370, 375 | Three Squid I; three Squid II; Squid III | Missing |
| 397–430 | Further squids, Gigapede, and three spiders | Missing; full detail in CSV |
| 440, 441, 442 | Squid I; Squid II; Ghostpede | Missing |
| 447, 449, 451 | Thorn each time | Missing |

Use exact file times, not rounded guide labels: the first spider trios are at **174/199**, often called “175/200”; Gigapedes at 259 emerge around 262. Scheduled spawn, visual emergence, collision activation and secondary emission are different events.

### End loop

The last empty record is index 100. Preloop accumulated delay is 451 seconds. The repeating section includes an initial five-second wait, so its first two Squid I events happen around **456 seconds**. Its nominal delay sum is **56 seconds**. Each wave contains 17 nonempty records. First-wave first-pass times: 456 (two Squid I), 459 (Squid II + Squid I), 462 (Squid III), 467 (Gigapede), 472 (Spider II), 473/474 (Spider I), 484/485/486 (Thorn), 491/492 (Spider I), 497/502 (Squid I), 507 (Squid II).

The reference implementation advances loop enemy time by `(1 + waveIndex / 8) / 60` per real 1/60-second step, with a zero-based wave index. Thus approximate duration is `56 / (1 + waveIndex / 8)`; exact spawn times require its discrete float stepping and carried delay, not separately rounding every delay. Every third wave substitutes Ghostpede for Gigapede. [Loop algorithm](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Spawnset/View/SpawnsView.cs).

Our loop starts at **180**, adds one enemy every **18 seconds**, never accelerates, and cycles only current types. This changes the complete difficulty curve. The raw schedule has no spawn positions: placement, random seeds, constraints and orientation must still be recovered from original observations/replays. Our fixed per-event angles and identical seed on every retry are not certified equivalents.

## 4. Arena geometry and shrinking

The downloaded header specifies shrink start radius **50.0000038**, end **20**, rate **0.02500000037**, brightness **60**, and a **51 × 51** height array. These are original coordinate units; they cannot be copied into our 31-unit arena without a consistent scale conversion. Our tiles are spaced 2.5 units, while the community parser uses four world units per tile.

The reference computes a tile's shrink threshold from its distance to the grid center, then lowers its height by `(time - threshold) / 4` after that threshold. Inner tiles inside the end radius never lower through this rule. The radial controller runs from the beginning; visible playable-floor loss depends on the actual height field and tile positions. The nominal controller duration is about 1,200 seconds. This does **not** establish that the arena is a perfect radius-50 playable circle. [Tile shrink and support utilities](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Spawnset/SpawnsetBinary.cs).

Our collision treats every point inside a continuous radius as a flat floor at eye height 1.7. It shrinks from 31 toward 21 after 180 seconds at 0.012 units/second. Render tiles sink based on distance outside that radius, and a clipped cylinder forms the side wall. Neither the physical support nor the sinking animation follows the reference tile heights. We need one authoritative height field shared by movement collision and rendering; measured player footprint/edge support; and consistent world scaling for enemies, projectiles and jump measurements.

The community arena account identifies concentric brightness rings and distinct ambience for the four cardinal directions, both useful for spatial orientation. Our uniform floor material/multiple-light scene and audio system do not recreate those cues. Its approximate tile-diameter description should not override the downloaded height field or be confused with header radii. [Arena observations](https://devildaggers.fandom.com/wiki/The_Arena).

## 5. Weapons, timing and damage

### Correct progression and projectile counts

| Hand | Unlock condition | Ordinary burst | Ordinary stream / s | Homing burst | Homing stream / s |
| --- | --- | ---: | ---: | ---: | ---: |
| I | Start | 10 | 20 | — | — |
| II | 10 collected gems | 20 | 40 | — | — |
| III | 70 collected gems | 40 | 80 | 20 | 40 |
| IV | 150 stored homing | 60 | 106.666 | 30 | 40 |

Our burst counts and unlock thresholds match this reference. After 70 total collected gems, subsequent gems add homing reserve. Spending reserve can delay IV; “220 total gems” is only valid with no prior spending. Ordinary ammunition is unlimited. Hand progression persists within the run. Exact upgrade presentation/timing remains unmeasured. [Upgrade data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/UpgradesV3_2.cs).

### Our measured stream throughput is wrong

An isolated 100-second exercise of the actual `weapon()` code, at its standard 120 Hz, clearing projectiles/effects after every step to avoid the capacity cap, emitted:

| Hand | Reference / s | Our measured / s, including startup | Difference |
| --- | ---: | ---: | ---: |
| I | 20 | 17.13 | −14.35% |
| II | 40 | 34.26 | −14.35% |
| III | 80 | 68.52 | −14.35% |
| IV | 106.666 | 85.65 | −19.70% |

The `.05` cooldown remains slightly positive after six double-precision decrements, so a shot occurs every seven ticks. Our Level IV also emits five projectiles per batch. This needs a tick/rate representation that preserves the reference average and timing. Fixing only the nominal cooldown label would leave the measured problem unresolved.

### Input state machine

The original regular weapon chooses stream versus release burst according to hold duration. Skilled players shorten burst recovery by holding during cooldown (“shotgun tech”). Switching into homing while streaming can emit a controlled homing stream without an unwanted burst. Dagger jumps depend on closely timed floor bursts and jumps, including a second boosted jump. [Firsthand firing/technique guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258).

Our regular release gate is 0.13 seconds and burst recovery 0.22 seconds; these are provisional. Holding does not modify cooldown, so the documented recovery technique is absent. Homing bursts fire on **press**, followed by four daggers per `.1` cooldown, rather than using the same tap/release selection. Both buttons share a cooldown; regular stream executes first and can starve homing while both are held. There is no explicit stream-to-shot transition or original combined-input state machine. Mouse button changes are sampled as booleans in the frame loop; multiple edges between steps can be lost. Record input edges with timestamps for faithful timing and replays.

### Homing damage and interactions

The reference lists ten damage against most targets, one damage against Leviathan/Orb, no automatic targeting of Orb or either spider egg, and Ghostpede interception/direct-hit immunity. Level IV has splash, including damage to Ghostpede; its radius/value are not fully established. Squid III is anomalous: the reference reports one Level III homing per crystal but three Level IV homing per crystal. Do not silently normalize that behavior. [Homing exceptions](https://github.com/NoahStolk/ddinfo-web/blob/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Client/Pages/Wiki/EnemiesPage.razor).

Our projectile stops at the first damage target and always applies ten homing damage. It has no damage budget/piercing, splash entity, delayed explosion, Ghostpede attraction, or boss exception. The reference's fractional homing-equivalent value for Skull I (0.25) signals that first-hit destruction is insufficient to reproduce its efficiency; exact pierce/retarget rules require fixtures. [Per-enemy homing data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemiesV3_2.cs).

Original v3.2 makes Level IV homing ricochet off empty Centipede/Gigapede segments, reduces detonation delay to one frame, and fixes excess consumption on dying skulls/eggs/Thorns. Our dead damage zones are skipped entirely. [Official v3.2 changes](https://steamcommunity.com/games/422970/announcements/detail/3055122329856629760).

Other unmeasured projectile details: launch point, speed, per-level spread distribution, surface normals, bounce restitution, lifetime, body obstruction, damage during spawn phases and target choice. Current values are normal speed 70, homing speed 42, spread 0.17/0.022 radians, lifetime 2.8 seconds and a floor-only ricochet. No measurement makes those original values. A 2,500-projectile cap silently suppresses shots and can alter combat under load.

## 6. Movement and camera

Our tuning is speed 11, ground acceleration 100, air acceleration 17, friction 8, gravity 26, jump impulse 9, and horizontal cap 18. Diagonal input is normalized. Fresh jump presses suppress one ground-friction pass. The controller has no explicit precise-hop success state, timed speed impulse or success-dependent FOV pulse. The floor burst directly sets upward velocity to at least 10.8 when pitch is below −0.95 and eye height below 3.8; it does not test the actual shot's floor impact or implement a measured two-jump sequence.

Firsthand observation describes timed hops producing speed and coordinated mouse/strafe motion steering, with sound/FOV feedback. The original's behavior should be measured rather than inferred from a generic Quake controller. [Movement account](https://steamcommunity.com/sharedfiles/filedetails/?id=1248222759).

A public replay reconstruction exists, but it explicitly marks player size, jump cooldown/velocity, boost and decay as guesses, and dagger jumping as TODO. Its move-speed constant is not sufficient to certify a faithful physics port. This is a useful research aid, not Sorath's controller. [ReplaySimulationBuilder.cs](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Replay/PostProcessing/ReplaySimulation/ReplaySimulationBuilder.cs).

Required measurements: straight/diagonal travel; acceleration and stopping curves; hop timing window, boost, cap and decay; air turning/reversal; jump height/flight; floor-shot angle/distance/ordering; second dagger jump; eye height and player support footprint; FOV axis, transient pulses, bob/recoil; sensitivity conversion and pitch limits. Our camera uses Three.js vertical FOV, default 95°, while the hand pass uses a separate projection; exact original conventions must be matched.

## 7. Gems and upgrade feedback

The reference gem loop is stop firing to attract, preserve drift while streaming, and push away on bursts. Gems expire in roughly ten seconds. Farming means deliberately keeping Squid I/II alive to generate additional gem-bearing skulls. [Gem reference](https://devildaggers.fandom.com/wiki/Gem); [farming description](https://devildaggers.fandom.com/wiki/Advanced_Mechanics).

The inspected current code already turns player steering off for either held fire button, preserves drift and suppresses attraction on the burst-release tick. Idle attraction blends toward a capped target velocity, with speed 17, steering rate 12, pickup radius 1.15, and burst push 8. This is a functional approximation. Spawned gems receive an upward velocity of 2 and have no independent downward gravity term; floor contact reflects vertical velocity. The reference describes quickly settling gems, so spawn/drop trajectory and floor behavior must be checked directly.

Our counters distinguish collected, expired, eaten and reserve, but omit total released gems, reserve peak, homing fired/eaten, per-species counts and upgrade timestamps. Homing button holds before unlock still disable collection in our implementation; whether the original does so needs a controlled check.

Hand upgrades are instantaneous in our simulation; our UI displays a notice and plays a substitute sound. Older firsthand descriptions report a brief slowdown and colored transition. Duration, time-scale curve, input behavior and score-clock relationship need measurement on v3.2. [Firsthand upgrade observation](https://steamcommunity.com/sharedfiles/filedetails/?id=692059731). This must not be implemented by guessing a one-second pause.

## 8. Presentation and audio

Original assets do not establish original animation or behavior. Our meshes/textures are original for the eight present types, four hands, floor/gems and selected effects. The local port assembles joints and motion; tentacle curves, hand placement, particle velocities/lifetimes, recoil and shader adaptation remain approximate. The original floor decal system is absent. See [enemy asset limits](ORIGINAL_ENEMY_ASSETS.md) and [weapon asset limits](ORIGINAL_WEAPON_ASSETS.md).

The original publicly describes unfiltered textures, polygon jitter, particle physics/procedural decals, flocking enemies and HDR positional audio with optional HRTF. [Engine feature description](https://store.steampowered.com/app/422970/Devil_Daggers/). Our render adds antialiasing, ACES tone mapping, bloom, several scene lights, a cylinder edge and a procedural star/cloud/moon sky. These are explicit presentation differences; a full visual replica requires reference captures and comparison of scene, visibility, materials and shader effects.

Our sound system loads nine substitute CC0 one-shot roles, limits active voices to 28, throttles shot audio, and synthesizes triangular spawn/egg/skull warnings. Only selected impact/death effects are positionally panned. There are no persistent per-enemy sound emitters, species-specific chatter banks, original boss voices or measured mixing priorities. HRTF panning alone does not recreate the soundscape. The community asset catalog exposes specific homing-pierce and many other sound roles useful for mapping: [audio catalog](https://github.com/NoahStolk/ddinfo-web/blob/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Server/Utils/AssetInfo/AudioAudio.cs).

Our HUD defaults to directional threat markers, adds hit markers and textual advance spawn warnings, displays invented phase names, resource labels and persistent statistics. These convey information differently. Exact original HUD visibility, timer toggle, crosshair, notification and menu behavior needs a UI inventory and reference captures. Current sky/HUD differences should be resolved against the latest replica request and any explicitly retained user preferences before presentation changes.

## 9. Opening, trophies, death, settings, replays and rankings

Our start button creates a run directly at `(0, 1.7, 10)`. The opening dagger lobby/pickup/transition is absent. Default retry seed is always 80421. Our deaths show custom labels; multiple enemy kinds collapse into “Skull swarm.” The original has specific death codes/labels for all families. [Death taxonomy](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/DeathsV3_2.cs).

Six lobby dagger trophies unlock at 0, 60, 120, 250, 500 and 1,000 seconds. They change trophy presentation/sound, not in-run combat strength. The 500-second dagger grants the Steam achievement; the 1,000-second trophy does not add one. Our best time unlocks no trophy/lobby behavior. [Threshold data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/Daggers.cs); [trophy behavior](https://github.com/NoahStolk/ddinfo-web/blob/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Client/Pages/Wiki/DaggersPage.razor).

Local best and last-run totals are present, but input recording, event replays, replay seeking, saved-run lists, global/friend rankings and replay statistics are absent. Original local replay storage automatically retains ten recent runs and supports longer manual saves. A complete replica should reproduce those user capabilities; our independent scores do not automatically belong on Sorath's service. [Official v3.2 replay announcement](https://steamcommunity.com/games/422970/announcements/detail/3055122329856629760).

Reference replay files contain metadata, the spawnset and compressed event records, including spawn/target/hit/transmute/input events. Input records delimit ticks and distinguish held/released shooting and held/pressed jumping. An input-only replay is not automatically compatible with that format or sufficient to reproduce the original random events. [Local replay format](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/local-replay-binary.md); [event format](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/replay-events.md).

Practice/custom spawnsets can specify initial hand, extra gems and start time; formats also represent Time Attack and Race. Our developer preview URLs are not a user-accessible practice or custom-spawnset feature. These optional modes and modding tools belong in full product coverage, after standard Survival is faithful. [Spawnset format](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/spawnset-binary.md).

Current settings cover sensitivity, FOV, volume, two quality modes and threat cues. Need an original-settings inventory for bindings, fullscreen/resolution, rendering options, frame limit, audio/HRTF and replay controls. Settings ranges and behavior must be measured rather than copied from an older guide.

Officially documented completeness details: default FOV changed to 90; gem/homing counter toggles with 2; HUD elements use default keys 1–4; replay top-down view toggles with M; recent maintenance adds seeking ±3 seconds or ±10 with Ctrl; options include an FPS limiter, menu-music volume and flashing-hand disable. The original also delays mouse activation after death to avoid an unintended click. Our implementation has none of these specific controls except a general FOV/volume setting. [Official update history](https://steamcommunity.com/app/422970/allnews/).

## 10. Simulation, scoring and performance

Our 120 Hz fixed simulation is reproducible for identical inputs/seeds, but not proven equivalent to original tick timing. Community replay and schedule tooling uses 60 Hz. Moving to 60 Hz without first calibrating rates/physics would not itself establish parity.

Our frame loop caps elapsed delta at 50 ms, discarding extra wall time on stalls. A stalled machine therefore advances less game time; no interpolation bridges simulation frames. Original score-clock behavior, pause/resume, time scaling, interpolation and stall handling need comparison. Effects also have render-time state, which must be captured or reconstructed for visual replay parity.

The enemy separation hash is local, but projectiles still test every enemy, with allocations for segment/weak-point target lists. Our imported creatures consist of many mesh parts. There has been no endgame frame-time/memory benchmark; build/test success cannot substantiate a hundreds-of-enemies performance claim. Profile representative 500/800/1,000-second densities after the roster exists, including projectile/particle/audio/render caps. Caps must not silently change the effective weapon or hide lethal threats.

## 11. Work order and completion gates

This is the proposed dependency order for implementation, not a claim that the remaining work has been implemented.

| Priority | Work package | Acceptance evidence |
| --- | --- | --- |
| P0 | Import reference schedule and tile height field; establish coordinate scaling | Every raw delay/type/wait matches; first wave and repeat substitution checks; tile support matches rendered floor |
| P0 | Correct ordinary/homing state machine and projectile accounting | Measured per-level throughput; timed tap/hold/recovery and both-button fixtures; no cooldown drift |
| P0 | Add Skull III; fix Squid II emission and Skull II AI | Correct offspring/HP/rewards; wandering behavior and swarm comparison clips |
| P0 | Calibrate movement, hop boosts and dagger jumps | Repeatable travel/jump/turn curves and timing windows against original |
| P1 | Complete Squid III, Skull IV, Spider II/egg II, and existing AI | Whole 0–259-second encounter/economy comparison |
| P1 | Centipede lifecycle, Gigapede and segment collision/ricochets | Emergence/idle/burrow/path tests; scrape gem output and damage-zone comparison |
| P1 | Leviathan, Orb, rings and four transmuted skull states | Relative activation/drop clocks; full-health transformation; stun/beckon fixtures |
| P1 | Ghostpede, Thorn and accelerating loop | Interception/splash checks; emergence orientation; multiple exact repeat waves |
| P1 | Full homing damage/target/pierce/splash matrix | Per-enemy direct, splash, lethal-hit, dead-segment and no-target cases |
| P2 | Upgrade presentation, original audio, rigs/particles/decals/lighting/UI | Synchronized comparison captures, spatial sound recognition tests, original UI inventory |
| P2 | Dagger lobby, trophies, death flow, settings | Threshold unlocks and capture comparisons for every state |
| P2 | Replays, run history and statistics | Repeated playback produces matching state/events; seek/resume consistency; recent ten-run retention |
| P3 | Independent rankings and custom/practice facilities | Version/spawnset identity and score checks; clear separate records; replay-supported submissions |
| P3 | Dense endgame optimization and packaging | Frame-time percentiles, memory/audio budgets and gameplay-preserving load tests on target hardware |

A full-replica claim needs all of: complete roster, standard schedule/loop, calibrated mechanics, matching economy and enemy interactions, presentation/audio coverage, surrounding product features, and measured late-game behavior. It cannot be established by matching meshes, passing our existing tests or attaching a completeness percentage to the roster.

## 12. Remaining measurements: public research cannot settle these

| Unknown | Measurement fixture |
| --- | --- |
| World scale, eye height, player footprint, floor support | Fixed-position captures and replay coordinates against known tiles |
| Ground/air motion, diagonal effects, hop timing/boost/decay | Repeated controlled input sequences with position/time traces |
| Dagger jump and second boost | Sweep aim angle, height, jump/shot ordering and timing offsets |
| Burst/stream thresholds, recovery manipulation, input priority | Mouse edge timestamps and projectile birth ticks for each hand |
| Per-level spread/speed/lifetime/launch offset | Isolated shot samples and trajectories over multiple trials |
| Homing choice, pierce budgets, splash, detonation and anomalies | One/two-target fixtures including each boss, dead segments and Ghostpede |
| Enemy acceleration/turning/avoidance/stun/pathing | Single-enemy and dense-swarm replay/capture comparisons |
| Spawn placement, constraints and RNG | Multiple reference runs with fixed player positions/orientations |
| Spawn/active/body/crystal collision | Contact and shot sweeps during emergence and after crystal removal |
| Gems: fall, drag, pull, push, floor bounce and collection radius | Isolated pickups under idle/stream/burst and facing spiders |
| Upgrade slowdown, score-clock and input relationship | Frame/tick annotations at every hand transition |
| Audio gain/attenuation/voice priority and sustained emitters | Fixed-distance recordings and occluded/behind-player encounters |
| Scene/HUD/rig/particles/death camera and settings | Original captures in every state, controlled FOV/resolution |

Useful original telemetry exposes gems released/collected/eaten/expired, homing stored/eaten, per-family alive/killed counts, upgrade times, boss kill times and peaks. These make stronger comparison targets than subjective “feels similar” judgments. [Documented telemetry](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/docs/game-formats/game-memory.md).

## Verification performed for this audit

- Inspected simulation, input/frame loop, renderer/sky, audio, enemy/weapon asset documentation and tests.
- Checked both public repository revisions and downloaded/decoded the working default Survival endpoint.
- Confirmed binary byte count from `36 + 10404 + 40 + 118 × 28 = 13784`, last wait index 100, preloop delay 451 and loop delay 56.
- Parsed all 22 enemy entries and saved original arena heights and source hashes.
- Exercised actual weapon scheduling for 12,000 fixed steps per hand to measure the rate discrepancy.
- Ran `npm test`: **23 passed, zero failed**. These validate our implemented behavior; they do not certify original-game fidelity.

Not performed: native original-game measurement, full reference-run annotation, current UI/audio capture, new browser playtest, endgame performance benchmark, or original leaderboard compatibility validation. This audit supplies a substantially stronger implementation specification and a bounded list of remaining unknowns; it does not turn approximations into verified facts.
