> Superseded: this report used the older checkout. See the [current GitHub build investigation and fix](../guest-lag-current/README.md) for the validated repair on `f9abc5b`.

# Guest multiplayer lag investigation — 17 October 2026

## Finding

The guest snapshot/prediction path has a reproducible CPU and allocation bottleneck that scales with enemies, projectiles, and unacknowledged input count. There is also an independently reproducible guest-only player-object retention bug. These mechanisms fit the reported host/guest difference and worsening performance under dense sustained fire. This is a reproduction of the current code's failure modes, not a capture from the affected Windows PC or a claim to have reproduced its exact 600-second match.

The initial investigation below describes the pre-fix code. The subsequent repair and its validation are documented in [FIX-VALIDATION.md](FIX-VALIDATION.md). The scripts, raw measurements, and CPU profiles in this directory preserve the evidence.

## Expensive receive path

1. `FriendsSession.receiveState` decodes a delta into a full enemy/projectile object graph.
2. `snapshotBaseline` clones each projectile separately and repacks each enemy. The guest retains up to 32 baselines.
3. `SnapshotTimeline.push` deep-clones the full decoded snapshot. It retains up to 12 full snapshots, including projectiles even though presentation uses `world.projectiles` for projectile flight.
4. `applySnapshot` deep-clones that full snapshot again and replaces the player objects.
5. `reconcile` replays every outstanding input through `World.predictCrew`.

The network's small delta representation therefore does not translate to small client-side work. The host does encode/baseline work but does not run the guest's decode, timeline copy, snapshot application, and reconciliation path.

## Replay amplification

`World.predictCrew` loops over all projectiles, then filters the full array on every tick, even though it only advances negative-ID predicted projectiles. It calls the weapon controller, and each shot calls `World.shoot`, which scans all enemies and performs aiming/armor/floor queries. Reconciliation repeats this work for every unacknowledged command on every snapshot. The input history is bounded at 240 ticks (two seconds), but work before that limit can still be expensive. `InputPacer.next` bypasses pacing while fire/homing/jump is held, so holding fire does not drain an excessive host queue through that mechanism.

The guest also allocates interpolated enemy/projectile objects each rendered frame in `SnapshotTimeline.view`. These costs share the browser main thread with rendering and user input.

## Measurements

`browser-profile.mjs` runs the current TypeScript modules in local headless Google Chrome. It uses synthetic decoded states at time 600, level VII held fire, a mixture of skulls/towers, and 25% homing projectiles. It exercises the actual fragment assembler -> receiveState -> onSnapshot -> reconcile path using delta packets. All 38 updates for each measured case must reconcile successfully; eight warmups precede 30 measured updates. Independent component measurements use 50 measured calls.

The measured update excludes WebRTC transit, host encoding, GPU rendering, audio, and normal between-snapshot prediction. It isolates main-thread guest processing, rather than estimating real match FPS. The synthetic scene sizes and pending-input counts are stress cases, not measured counts from the user's match. Timings vary between runs; use the JSON files for exact values.

Representative initial Chrome run:

| Enemies | Projectiles | Pending inputs | Receive + reconcile median |
| --- | --- | --- | --- |
| 300 | 1,000 | 12 | 7.4 ms |
| 1,000 | 3,000 | 12 | 24.3 ms |
| 1,000 | 3,000 | 120 | 29.1 ms |
| 1,000 | 3,000 | 240 | 35.0 ms |

In the dense case, baseline construction, timeline copying, and snapshot application individually took approximately 7.1, 6.7, and 6.8 ms. A 60 FPS frame has 16.7 ms for **all** work. One dense update alone can exceed that budget before rendering starts. Actual network frequency is adaptive/budgeted, so these values must not be multiplied by an assumed constant 20 Hz for every dense scene.

The Chrome CPU profile identifies `applySnapshot`, timeline `push`, and baseline projectile copying as the leading sampled work. Garbage collection is also visible. The Node profile independently identifies structured cloning as its largest sampled cost. Component timings include instrumentation and are not a production Windows performance guarantee.

## Unbounded player-object retention

`World.move` stores player objects as keys in `playerStarts`, a strong `Map`. Normal host/solo steps clear the map each tick. Arena `predictCrew` does not clear it. `applySnapshot` creates replacement player objects, leaving earlier predicted players retained as obsolete map keys.

The Node reproduction applied 12,000 snapshots with six prediction ticks after each, equivalent to 600 seconds at 20 updates/second. The resulting world contained two live crew members but **12,000 retained player objects** in `playerStarts`. This is a confirmed leak, but the experiment does not establish it as the dominant cause of the severe slowdown. The copy/replay timings provide stronger direct evidence of frame-budget overruns.

There is no special 600-second threshold in these paths. Entity load increases their immediate cost; the map grows with snapshot count. Both can worsen over a long match.

## Why existing coverage missed it

`tests/multiplayer-soak-browser.mjs` is a 15-second transport/prediction test. It disables scheduled enemy spawning, runs without the renderer, and checks acknowledgement recovery, positions, and queue bounds rather than frame-time/heap budgets. `multiplayer-large-state-browser.mjs` checks delivery of 6,000 projectiles but its snapshot callback does not reconcile or render them. Those tests cannot validate long dense-match guest performance.

## Git attribution

The main copy/prediction architecture and map date to `5ece183` (13 October). The queue recovery/pacer and large-frame changes were included in `defb7e2` (14 October). The 16 October `146f872` commit modifies social/courtyard controls and other gameplay but retains the same expensive arena reconciliation architecture. The repository history does not isolate a standalone 16 October commit titled as a multiplayer lag fix, so attribution to one exact 'yesterday fix' would be unsupported.

## Repair priorities

- Give decoded immutable state explicit ownership; avoid repeated full-world cloning, especially projectile-by-projectile cloning and projectile retention in the enemy interpolation history.
- Keep authoritative projectiles outside the tick-by-tick predicted-projectile work; bound reconciliation work while preserving input/weapon timing and correctness.
- Clear or otherwise bound player-start references when players are replaced or predicted.
- Validate with a rendered host/guest dense-combat run lasting at least 600 seconds, tracking receive/reconcile timing, long frames, pending inputs, entity counts, and heap growth. Verify ordinary WAN latency as well as loss/recovery.

## Reproduction

From the repository root, with dependencies installed:

```sh
node --cpu-prof --cpu-prof-dir=artifacts/guest-lag-investigation --import tsx artifacts/guest-lag-investigation/profile.ts
npm run dev
# In another terminal:
node artifacts/guest-lag-investigation/browser-profile.mjs
```

`results.json` contains Node component timings and the retention reproduction. `chrome-results.json` contains the latest browser measurements. `*.cpuprofile` files can be opened in Chrome DevTools.
