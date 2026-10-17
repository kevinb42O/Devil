> Superseded: this report used the older checkout. See the [current GitHub build investigation and fix](../guest-lag-current/README.md) for the validated repair on `f9abc5b`.

# Guest lag fix and validation — 17 October 2026

The guest now reuses immutable decoded state, rather than rebuilding multiple independent copies of the shared world for every packet. Wire format and gameplay timing remain compatible.

## Changes

- `decodeState` retains its already reconstructed enemy rows and projectile references as a receive baseline. `FriendsSession.receiveState` uses it directly, eliminating repacking and per-projectile clones.
- `applySnapshot` copies the mutable controllers, stats, and courtyard state. Shared decoded enemies, authoritative flight, gems, and rings remain immutable; prediction owns a separate projectile array.
- `SnapshotTimeline` retains only the remote presentation fields it uses. It shares immutable decoded poses and retains no projectile history. Raw host/tool snapshots still receive independent copies.
- Prediction maintains an authoritative projectile prefix and only advances/compacts its negative-ID predicted suffix. Full authoritative projectile scans and array rebuilding no longer run on every prediction or reconciliation tick.
- Applying snapshots and predicting movement release previous player-start references. The 600-second retention reproduction now holds one live pose rather than 12,000 obsolete player objects.
- Host baseline capture owns only the position/velocity/identity fields required for flight reconstruction. It no longer clones launch/render data per projectile.

## Paired Chrome benchmark

Same script, entity counts, input backlog, and actual fragment assembler/receive/reconcile path before and after the change. Synthetic scene; host encoding, audio, normal prediction, and rendering excluded from these per-update measurements.

| Enemies | Projectiles | Pending inputs | Before median | After median |
| --- | --- | --- | --- | --- |
| 300 | 1,000 | 12 | 10.9 ms | 0.8 ms |
| 1,000 | 3,000 | 12 | 24.3 ms | 2.6 ms |
| 1,000 | 3,000 | 120 | 29.3 ms | 4.4 ms |
| 1,000 | 3,000 | 240 | 34.4 ms | 8.3 ms |

The dense normal-backlog update is approximately 89% cheaper in this benchmark. This is a CPU processing result, not a promise of a particular Windows FPS. `chrome-before.json` and `chrome-results.json` contain the raw paired measurements.

## Correctness and transport

- All **454** unit tests pass (`unit-tests.log`).
- New frozen-snapshot tests replay movement, shots, homing, and jumps and chain 80 delta updates without changing snapshots or prior receive baselines.
- A 6,000-authoritative-projectile regression verifies that per-tick prediction does not visit those projectile identities, still advances/expires predicted bullets, and handles externally replaced arrays.
- Production TypeScript/Vite/PWA build passes (`build.log`); Vite reports the existing large-bundle advisory.
- Real four-player WebRTC sustained-fire soak, added latency/loss/reordering, input blackout recovery, and full acknowledgement recovery pass.
- Real WebRTC immediate prediction, jump/weapon timing, delayed input release and restart checks pass.
- Real 6,000-projectile paced delivery, reliable effects, acknowledgement, and restart cancellation pass (`rtc-regressions.log`).

Headless Chrome's local mDNS ICE resolution prevented the first local connection attempt. The successful WebRTC runs used `rtc-regressions.mjs`, which disables mDNS candidate hiding in those test browser processes. Production connection configuration is unchanged.

## Rendered dense endurance test

`tests/multiplayer-guest-dense-browser.mjs` exercises 600 **simulated** seconds (12,000 snapshots, 72,000 prediction ticks), keeping 1,000 moving enemies and 3,000 authoritative projectiles while the guest fires at level VII, periodically uses homing, strafes, and jumps. It renders each received update with real game assets, effects, interpolation, and GPU completion. It uses a deterministic 12-tick acknowledgement delay and the actual packet assembler/receive/reconcile path. Encoding is generated locally; this endurance test is accelerated and does not use a live WAN or reproduce a real match's enemy AI/damage. Those transport/correctness concerns are covered separately above.

The test asserts that every update reconciles, controller history stays bounded, pose references remain at most one, interpolation history stays at most 12, network baselines stay at most 32, retained heap plateaus after warmup, and receive processing avoids severe duration-dependent regression (late median must stay below 10 ms or three times the early median). `dense-rendered-soak.json` records exact timings and retained heap measurements; `dense-guest.png` shows the rendered scene.

The completed run processed all 12,000 updates in approximately 151 seconds of wall time. Retained heap after collection was 61.70 MB at update 1,000 and 61.93 MB at update 12,000. The map held one player pose throughout; input history ended at 18 commands. Overall receive/reconcile median was 3.2 ms (p95 6.7 ms). Early and late receive medians were 3.0 and 5.2 ms; early and late render medians, including GPU completion, were 4.6 and 7.8 ms. There were still isolated long frames, so this result does not establish a locked 60 FPS. It establishes that the obsolete-player retention is gone and dense guest processing is substantially cheaper with bounded retained state.

Run the regression with:

```sh
npm run dev
# In another terminal:
npm run test:multiplayer-guest-performance
```

The default endurance duration is 600 simulated seconds. `GUEST_SOAK_SECONDS` can shorten it during local test development.
