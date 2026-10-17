# Guest multiplayer lag fix on current GitHub code

Base revision: `f9abc5b` (latest `origin/main` when fetched on 17 October 2026). The earlier investigation used `2a1d77e`; its measurements did not exercise the current client-owned collision and hit-reporting path. This report supersedes that validation.

## What was reproduced

The current guest repeats full-world copying while receiving snapshots and independently advances its local projectile collisions at 120 Hz. Dense level-VII fire uses the current 48-projectile primary streams and up to 288-pellet shotguns. Host simulation does not pay the guest's receive/interpolation/reconciliation work.

The current code retained the same obsolete-player map bug. The new code also repeatedly partitioned remote/local projectile arrays and rebuilt collision grids and target history for each fixed substep inside one rendered pose.

## Repair

- Retain the already decoded baseline rows and immutable shared flight rather than repacking/copying the world after every receive. Preserve drawing-state delta baselines.
- Retain only enemy/gem/crew/courtyard presentation fields in interpolation history; omit projectile history entirely.
- Clone mutable controllers/stats/courtyard state and **local-owner** acknowledged flight when applying a decoded snapshot. Remote flight and authoritative health stay shared and immutable. Local hit prediction and authoritative snapshots remain separate.
- Cache the local/remote flight partition across unchanged arrays, controller ticks, and physics ticks. Snapshot replacements and appends invalidate or update it. Simulate acknowledged local-owner bullets as well as unconfirmed negative-ID bullets.
- Reuse a conservative collision grid within a single presentation's fixed-step catch-up. Read live health every tick; update target-relative motion after the first tick. Use independent query stamps across reused grids. Rebuild for the next rendered pose; standalone prediction calls retain their ordinary swept-motion behavior.
- Reject distant armor rays with a conservative horizontal bound before mesh transforms and BVH traversal.
- Clear previous-player pose references on prediction and snapshot replacement.

The fix preserves the current hit-reporting protocol, damage ownership, moving-target hits, homing, floor bounces, and newer courtyard/drawing behavior. It was integrated into the original shared checkout while preserving the separate combat-gesture changes there.

## Paired Chrome measurements

`tools/profile-guest-lag.mjs` exercises current `clientHits:true` code in an isolated HTML page. Both runs used 1,000 enemies, 3,000 snapshot projectiles including locally owned flight, level-VII held fire, and the actual fragment assembly/receive/reconcile path. Host encoding and GPU drawing are excluded. Prediction/presentation includes two controller ticks and a 1/60-second presentation update with local collision simulation.

| Work | Before median | After median |
| --- | --- | --- |
| Receive/reconcile, 12 pending inputs | 25.6 ms | 1.8 ms |
| Receive/reconcile, 120 pending inputs | 29.8 ms | 3.1 ms |
| Receive/reconcile, 240 pending inputs | 31.7 ms | 4.8 ms |
| Two prediction ticks + presentation/flight | 17.6 ms | 8.2 ms |

Raw measurements and profiles are `before.json`, `after.json`, and their `.cpuprofile` files. These are CPU measurements on this Mac, not a promised Windows frame rate.

## Regression coverage

- Frozen decoded snapshots remain unchanged through client collision simulation, local health feedback, and 80 chained delta updates. Local daggers own their mutable state; remote daggers retain immutable sharing.
- Drawing ink survives relative updates using the reused decoded baseline.
- Cached and uncached collision steps match projectile state, contacts, health and effects over changing poses, homing and consumed bullets.
- 24,000 sampled armor rays across eight kinds matched the original mesh traversal exactly (497 hits); see `armor-equivalence.json`.
- The 600-second replacement/prediction reproduction retains one current player pose instead of 12,000 obsolete players.
- All 551 tests passed in the merged shared checkout, including the current shooting/contact and separate combat-gesture tests. See `merged-unit-tests.log`.
- Real WebRTC shooting at 300 ms added RTT produced ten immediate local contacts and exactly ten authoritative hits, without duplicate feedback.
- Real moving-target registration passed at 0/150/300 ms added RTT, including 20% input loss/reordering and deliberately duplicated reports. All 25 local hits per case became exactly 25 host hits; see `rtc-regressions.log`.

These local WebRTC browser checks use a test-process-only Chrome flag to bypass this machine's local mDNS candidate resolution problem. Production ICE configuration is unchanged.

## Rendered endurance method

`tests/multiplayer-guest-dense-browser.mjs` runs 600 simulated seconds: 12,000 snapshots and 72,000 prediction ticks, 1,000 moving enemies, 3,000 remote projectiles, and the additional live local level-VII bullets. **Client hit reporting is enabled**, and presentation advances local flight at its real fixed-step rate. The fixture acknowledges pending contacts and keeps a 12-tick controller acknowledgement delay. It renders real assets, local hit effects, interpolation and GPU completion once per update.

This is an accelerated synthetic workload, not a live 10-minute WAN match or a full host AI simulation. Its assertions cover update delivery, bounded input history/pose references/caches, retained heap plateau and severe duration-dependent processing regression. It records both processing and rendering timings, so individual long frames remain visible.

Run against a development server with:

```sh
npm run dev
npm run test:multiplayer-guest-performance
```

Use `GAME_URL` for another dev-server port and `CHROME_PATH` for another Chrome installation. `GUEST_SOAK_SECONDS` controls simulated duration (default 600).

## Completed endurance result

All 12,000 snapshots reconciled with client hit reporting enabled. The accelerated run took approximately 404 seconds of wall time. Retained JS heap after collection was 70.49 MB at update 1,000 and 71.70 MB at update 12,000 (about 1.7% variation). The final controller history contained 18 inputs; pose history contained one player; baselines stayed at 32 and interpolation history at 12.

Overall receive/reconcile median was 4.9 ms (p95 10.0 ms) while rendering real assets and local collision feedback. Early/late medians were 4.9/3.9 ms. Early/late presentation plus render medians, including GPU completion and six local-flight fixed steps per snapshot, were 21.0/15.3 ms. This test renders once per 50 ms of simulation time; those render times must not be presented as a 60 FPS end-to-end measurement. Individual long frames occurred, especially during warmup and concurrent verification, and remain in the raw data. The result demonstrates bounded retained state and no progressive slowdown in this workload, not a universal FPS guarantee.

A four-player transport soak initially exceeded its pending-input threshold while the dense GPU/CPU endurance run was active. That attempt was not counted as a pass; the standalone repeat is recorded separately in `rtc-soak-isolated.log`.

The standalone repeat **passed**: four players fired 6,912 authoritative daggers with added latency, loss/reordering and an input blackout. Peak pending input counts were 112/106/95, all below the test's 180 limit, and every guest recovered full acknowledgement. The 6,000-projectile paced WebRTC transfer/restart test also passed (1,775 ms transfer). The prior contended attempt was therefore retained as a resource-contention limitation, rather than silently reported as successful.

The merged production TypeScript/Vite/PWA build passed (`merged-build.log`), with the existing large-bundle advisory.
