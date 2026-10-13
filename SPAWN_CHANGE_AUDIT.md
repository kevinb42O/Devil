# Spawn changes and enemy roster audit — 2026-10-13

Scope: changes to scheduling, placement, practice skipping, and saved-replay
compatibility, plus the current v3.2 enemy roster and imported asset usage.
The tower motion and spider-jitter regressions, offspring timing, and spider
rewards were fixed in gameplay revision 11. The inferred placement-distribution
limitation remains open. Historical findings below describe the pre-fix state.

## Findings in the spawn changes

### P1 — Tower birth coordinates and entrance motion (fixed in revision 11)

Before revision 11, `World.spawnAt` started towers at `62 × .62 = 38.44` world units from the
center, but `updateEnemies` used a constant `.5` world-unit inward speed.
The original entrance moves them inward much faster initially. Replaying the
first spawn angle from either recorded original produces this comparison:

| At game time 4.48333 seconds | Original A | Original B | Replica before fix |
| --- | --- | --- | --- |
| Tower radius, replica world units | 31.99786 | 31.99335 | 37.69833 |
| Tower height | 3.91375 | 3.91375 | 4.03 |

That is about 5.7 meters of horizontal error only 1.483 seconds after birth.
It changes where the player engages the tower and where its first skull swarm
appears. Correct coordinates at age zero do not fix this regression.
The fix therefore required matching the entrance transform as well as birth
coordinates.

The revision-11 entrance uses shape-preserving interpolation of recorded poses.
Across captured entrance samples, radial error is below .04 world units and
height error below .02. At 4.48333 seconds the corrected radius is 31.99561,
within .0023 of each recording. This is reference calibration, not recovered
engine code.

Before-fix evidence: `artifacts/enemy-roster-audit/tower-motion-before-fix.json`;
after-fix evidence: `artifacts/enemy-roster-audit/tower-motion.json`; original source
measurements are in `research/devil-daggers-v3/original-survival-replay-spawns.json`.

### P2 — Scheduled spiders discard radial movement (fixed in revision 11)

`spawnAt` sets `spawnRadius` on scheduled spiders. Before revision 11,
`updateSpider` chose random `radialOffset` values after the head-lift period,
but its scheduled-spider branch ignored those values and replaced the radius
with `originalSpawnRadius(...)` each frame.

This caused manually spawned preview spiders to retain radial jitter while
normal scheduled spiders lost that part of their movement. The corrected birth radius
now acts as a base for movement, with radial jitter applied as a relative
offset. Entrance radii stay unchanged until jitter begins.

### P2 — The new placement distributions are inferred, not recovered engine rules

`pedeSpawnPosition` hardcodes a 25-original-unit disk and a uniform radial sample.
The 27 captured pedes are all inside that disk, but finite samples do not establish
its precise boundary or probability distribution. Similarly, uniform tower/spider
angular increments and the retained thorn radial selection range have not been
recovered from the engine. These are explicit approximations, not exact location
rules. This limits the previous 100% matching objective.

## Additional mismatches found during the roster check

- Tower offspring scheduling was approximate; revision 11 now matches every
  recorded emission tick and child type in both sources, including repeat
  bursts. Children are created individually and canceled if the parent dies.
  Discharge animation follows the same cycle. In both original recordings,
  the first tower's first skull is recorded at original tick 364 (6.06667 seconds),
  followed by ticks 365, 367, 369, 371, 373, 374, 376, 378, 380 and the horned skull
  at 382. Before revision 11, the replica started its first batch at simulation
  tick 719 (5.99167 seconds) and used randomized ejection delays. New tests
  compare every captured offspring event rather than only major spawnset events.
- Spider I and II previously each dropped five gems; revision 11 drops one each. The v3.2 reference specifies one
  gem each; their HP values do match. This existing economy deviation is not
  caused by the latest spawn changes.
- Spider vertical entrance/body transforms remain approximate; the measured
  replay anchors have not been mapped to the assembled rig.
- Tower crystals are enlarged 1.4× in the renderer, and spider rigs use an extra
  1.65× scale. Modular joint placement, several shaders and animation curves are
  adapted. Imported meshes alone do not establish exact presentation.

## Roster and assets

The build contains all 22 normal v3.2 enemy entries in the
[version-specific reference](https://github.com/NoahStolk/ddinfo-core/blob/master/src/DevilDaggersInfo.Core.Wiki/EnemiesV3_2.cs).

| Family | Entries present |
| --- | --- |
| Squid towers | I, II, III (3) |
| Spiders | I, II (2) |
| Pedes | Centipede, Gigapede, Ghostpede (3) |
| Skulls | I–IV (4) |
| Transmuted skulls | I–IV (4) |
| Eggs and spiderling | Egg I, Egg II, Spiderling (3) |
| Bosses and obstacle | Leviathan, Orb, Thorn (3) |

An independent comparison to the saved reference confirms all 22 mappings and
all aggregate HP values. The two spider gem values were the only `ownGems` differences; revision 11
corrects them. Collision radii and AI are separate and unverified.

All 439 imported rendering files match their manifest SHA-256 hashes. Those
include 130 OBJ meshes and 227 textures. A browser runtime inventory confirms
all 22 templates load without asset errors, including the native Gigapede and
Ghostpede leg texture variants. See
`artifacts/enemy-roster-audit/runtime-assets.json`.

The normal roster excludes Andras: the
[reference descriptions](https://github.com/NoahStolk/ddinfo-core/blob/master/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs)
identify it as an unfinished V2 enemy available only through edited spawnsets,
not an enemy in standard v3.2 Survival.

## Checks and limits

- The major-event generator matches every recorded type and tick in the two
  standard original replays, including all 281 events through 858 seconds in
  the longer recording.
- Full unit test suite after the fixes: 187 tests passed.
- Browser spawn groups, corrected entrance pose and first/complete burst: passed.
- Browser inventory: 22 loaded enemy templates, no asset/browser errors.
- Imported rendering-file integrity: 439/439 matching hashes.

New reference-based tests cover entrance trajectories at recorded sample points,
every captured offspring event, radial jitter, death during discharge, gem rewards,
and revision-10/current replay compatibility. Complete AI, exact RNG and entrance
interpolation between recorded poses remain uncertified.
