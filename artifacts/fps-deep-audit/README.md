# Combat FPS audit — 25 October 2026

The largest reproduced stalls came from homing/tower collision work and repeated tower-clearance scans in enemy movement. Fixes substantially reduce both. Stable 60 FPS is **not yet established for every load**: sustained six-player level-seven primary fire and the extreme dense guest fixture still exceed the frame budget.

The user narrowed the scope to shooting, enemies, collisions, and multiplayer. The final benchmark tools do not instantiate audio or compare mist/post-processing settings. Graphics remain fixed during the combat comparisons.

## Reproduced causes and implemented fixes

1. **Whole-body creatures now have an explicit simple hit path.** All skull/transmuted tiers, eggs, spiderlings, and the orb bypass mesh armor and crystal selection during aim, swept-target construction, and homing. The incumbent armor function already returned without triangle tracing for these types, but callers still invoked it. Those no-op calls and empty weak-point-array probes are removed. Large homing swarms use an exact horizontal-cell nearest-body index, built once per tick, with 3D distance checks, live health, and stable tie ordering. It is enabled only with at least 256 simple bodies and 16 homing projectiles; small scenes retain a direct scan. Existing rules about which enemy types homing may target are preserved.
2. **Homing searched expensive tower visibility even after finding a closer target.** Each projectile visited every eligible enemy and performed floor/armor sweeps for reachable tower crystals. Ordinary bodies now take the direct weak-point path; crystals farther than the current best target are rejected before visibility tracing. Armor candidates are collected once per tick. Live health checks remain in place, including when an earlier projectile destroys a crystal.
3. **New tower armor had no triangle acceleration.** Each part had one bounding-box leaf containing all its triangles. Added a local-space BVH with at most eight triangles per leaf. Mesh vertices and collision surfaces are unchanged. Articulated joint matrices, inverses, and normal matrices are reused for a tower pose, with storage retained across ticks. Static tower collision trees are prepared during game loading rather than at first gameplay contact.
4. **Tower-spawned skulls repeatedly scanned the whole swarm for towers.** Build the tower-only list once per update and pass it to clearance queries. The old code visited all enemies up to twice for each hunting tower-spawned skull, producing near-quadratic work as the swarm grew. Neighbor separation also rejects out-of-range neighbors by axis before calculating their length, and reuses that length instead of calculating it again.
5. **Thousands of daggers repeated invariant floor work.** Tile shrink thresholds are precomputed in Float64 storage. Zero-footprint floor queries sample one tile instead of the same tile four times. Sweeps entirely above the highest authored surface return immediately; tiles can only sink, so this is conservative at all descent times. Raised sides, seams, downward hits, and missing tiles retain their existing behavior.
6. **Authoritative shots parsed contact ownership when no contact owners existed.** Skip ownership parsing when the owner list is empty. This avoids string/array allocation for each crew dagger in authoritative simulation.

## Controlled simulation comparison

Apple M1, Chrome/ANGLE Metal. Fixed seed, positions, level, and initial projectiles; 60 simulation ticks per fixture, first ten discarded. Timers instrument selected methods, so these are diagnostic CPU measurements rather than user-visible FPS. A simulation tick is 1/120 second: 60 FPS ordinarily needs two ticks per displayed frame. The per-tick budget is therefore considerably smaller than 16.67 ms.

| Fixture | Median before | Median after | p95 before | p95 after |
|---|---:|---:|---:|---:|
| 600 skulls + ordinary projectiles | 2.6 ms | 1.8 ms | 5.7 ms | 2.3 ms |
| 150 skulls + 6 towers + ordinary projectiles | 2.5 ms | 0.8 ms | 4.2 ms | 1.0 ms |
| 600 skulls + 48 initial homing projectiles | 7.0 ms | 1.8 ms | 9.6 ms | 2.0 ms |
| 150 skulls + 6 towers + 48 initial homing projectiles | 16.9 ms | 0.8 ms | 19.6 ms | 1.3 ms |
| 600 tower-spawned skulls + 6 towers | 6.7 ms | 2.4 ms | 8.0 ms | 2.8 ms |
| 1,500 tower-spawned skulls + 6 towers | 28.5 ms | 7.7 ms | 31.7 ms | 9.2 ms |

Every fixture's final enemies, projectiles, statistics, and gems produced the same state checksum before and after. This is in addition to collision/reference tests. Some projectiles expire or hit enemies during the fixture; these are identical evolving scenes, not permanently frozen entity counts.

Sources: [before.json](before.json), [after.json](after.json). The saved baseline simulation, collision, and arena modules preserve the relevant incumbent hot paths. Other modules/assets remain shared with the working tree; this is not a whole-repository historical checkout comparison.

Reproduce against Vite on port 5173:

```sh
node tools/profile-fps-audit.mjs before
node tools/profile-fps-audit.mjs after
```

## Sustained combat and remaining limits

The combat harness advances two real simulation ticks per callback, forwards effects to the renderer, and submits a full render. It uses a fixed 1280×720 CSS viewport, device scale factor 2, high graphics, six towers, and the same renderer for comparisons. Primary fire is pinned to the incumbent hold duration in both variants so unrelated concurrent weapon timing edits do not explain the speedup. Chrome's CPU sampling profiler is active, which adds overhead.

The short comparison measures 120 callbacks after 20 warm-up callbacks. In the six-player homing fixture, median simulation work per callback fell from **380 ms to 5.2 ms**. Total callback CPU fell from **385 ms to 10.4 ms**. The large stalls were dominated by triangle tracing and repeated animated transform composition in the original profile.

A longer after-only run measures 600 callbacks per scenario after warm-up (10 seconds of simulated combat, longer wall time when callbacks are missed):

| Scenario | Peak live daggers | Median total callback CPU | p95 interval | Intervals >20 ms / 600 |
|---|---:|---:|---:|---:|
| Solo idle, 300 initial skulls | 0 | 5.9 ms | 16.8 ms | 0 |
| Solo highest-level primary | 1,308 | 8.8 ms | 16.7 ms | 0 |
| Solo homing | 125 | 5.7 ms | 16.7 ms | 0 |
| Six-player highest-level primary | 9,804 | 24.1 ms | 50.1 ms | 344 |
| Six-player homing | 1,907 | 20.5 ms | 50.0 ms | 269 |

These animation callback intervals are useful pacing evidence, **not a guarantee of displayed frames** on a physical monitor. The isolated harness does not include the main app's HUD/recorder/network transport or its complete catch-up loop. The six-player scenarios are local authoritative simulation, not six connected browsers. The profiler stays active for the whole run, and machine load/GPU scheduling can change between passes; CPU submission and callback intervals are reported separately. The latest sustained six-player primary **and homing** runs remain unstable. Earlier after-only passes were faster, including a homing pass with no >20 ms callback intervals. This variability means the short comparison cannot establish sustained stability. Additional projectile/render throughput work and a controlled physical-display capture are needed before stable 60 FPS can be claimed. The 1,500-enemy CPU fixture also has very little remaining headroom at 120 Hz.

Sources: [combat-before.json](combat-before.json), [combat-after.json](combat-after.json), [combat-after-soak.json](combat-after-soak.json). Run `node tools/profile-combat-fps.mjs after-soak` to repeat the longer check. Avoid running tests or another benchmark simultaneously.

## Multiplayer guest check

Ran the existing dense guest benchmark for 400 updates / 20 simulated seconds, including snapshot encode/decode, reconciliation, local prediction, interpolation, and rendering. Its deliberately extreme load is 1,000 enemies (including 40 large towers), 3,000 initial remote projectiles, and local continuous fire. The fixture uses its existing fixed low graphics configuration.

Queue/history bounds passed: 18 pending inputs, 32 baselines, 12 presentation samples, and one prediction pose. Median snapshot receive/reconcile time was **5.0 ms per update**, while presentation/render with `gl.finish()` measured **34.1 ms median / 59.3 ms p95**. This fixture remains over budget. Its render measurement includes local projectile prediction and guest presentation, so it cannot be attributed solely to the GPU or enemy drawing. It does not reproduce real network latency. The current fixed render probe also shows 319 draws for six towers versus 32 for the swarm-only scene; large non-instanced creatures remain a scaling concern.

Source: [guest/dense-rendered-soak.json](guest/dense-rendered-soak.json). The guest fixture copy saves outputs here instead of overwriting the user's previous guest artifacts.

## Correctness and build validation

- 2,400 randomized tower armor sweeps compare old and accelerated contacts/normals across all three tower types, four ages, and both cadences, with tolerance 1e-9.
- All tile heights match across seven descent times. 4,000 randomized floor segments compare current and original sweeps, including legacy sweeps; footprint sampling also matches.
- Homing tests compare steering, damage, and effects across 12 seeded tower approaches; movement tests compare shortlisted and exhaustive tower clearance as enemies spawn.
- The focused collision/floor suite passed 32 tests; the earlier broader combat suite passed 73 tests; final focused checks passed 53 tests.
- The production build passes. Full-suite results are recorded separately in `full-tests.log`; see the final validation note below.

The full unit run completed with **729 passed / 737 total; eight failures**. Seven combat failures were reproduced in an isolated copy using the saved pre-audit simulation, collision, and floor implementations: tower floor-anchor assertions (three), hand-II ground-pulse damage, historical crew replay validation, cone-radius expectations, and stream-width expectations. The remaining failure is in untouched emergence-audio coverage. The baseline copy also showed two extra replay failures because its old weapon-hold implementation was combined with concurrently updated replay modules. These failures are recorded rather than concealed or fixed by changing unrelated rules. See `baseline-failures.log` and `full-tests.log`.

Final focused collision, floor, homing, client-contact and multiplayer regression coverage: **53 tests passed**. This includes 1,000 spatial nearest-body comparisons against exhaustive search, dead-target handling, stable ties, and mixed swarm/crystal steering comparisons. Production build passes.
