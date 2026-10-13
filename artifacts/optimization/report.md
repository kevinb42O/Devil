# Rendering optimization measurements

Measured on 13 October 2026 using headless Google Chrome, ANGLE Metal, Apple M1, at a fixed 1600 × 900 drawing resolution and High quality.

Reference revision: `cae94e067cbe5a71ef76b5a0d42bcfd9adc24742`.

## Results

| Scene | CPU before → after (median ms) | GPU before → after (median ms) | Draw calls before → after | Triangles before → after |
|---|---:|---:|---:|---:|
| empty | 0.70 → 0.70 | 2.79 → 2.95 | 17 → 17 | 7,506 → 7,506 |
| swarm | 3.10 → 2.00 | 6.10 → 5.72 | 26 → 26 | 913,956 → 713,745 |
| mixed | 3.70 → 2.60 | 5.05 → 4.81 | 602 → 190 | 896,647 → 801,453 |

Swarm: 600 skulls across four tiers. Mixed: 300 skulls, nine larger creatures including three centipede variants, 350 projectiles and 250 gems. CPU times measure rendering updates and command submission; simulation is measured separately. CPU and GPU overlap during normal gameplay, so these values must not be added or converted directly into an FPS promise.

The strongest repeatable result is the CPU reduction (roughly 30–40% in these populated fixtures). GPU medians vary between runs. The same-context GPU ablation results are included in comparison.json and show that sky ordering varies by workload. The sky retains its original shader appearance; its work can now be rejected behind opaque geometry. No resolution, quality, bloom radius/strength, geometry detail or lighting frequency was reduced.

## Changes

- Reuse enemy glow vectors, socket coordinates and deduplication buffers; avoid repeated template and crystal ancestor matrix updates.
- Compute floor light splats with squared coordinate offsets and square roots, while preserving texture byte values.
- Compose shared billboard rotation once per frame and write scales/translations directly into instance buffers.
- Cache animation and segment weak-point nodes, and compose only local transforms that actually animate.
- Instance repeated centipede segment parts, with the original frustum decisions and opaque depth/id ordering preserved.
- Cull invisible swarm instances using conservative bounds padded for the original world-grid vertex snapping.
- Allocate bloom intermediate targets without unused depth buffers.
- Draw the sky at far-plane depth after opaque geometry, allowing covered sky fragments to be rejected.

## Validation

- All 38 framebuffer comparisons match every RGBA byte. Enemy floor lighting fields also match every byte, including off-screen sources.
- Comparisons cover all 22 enemy types, camera turns, moving creatures, emergence, damaged crystals, six crowded Ghostpedes (batch growth), top-down view, quality/FOV transitions, and return to the menu.
- Simulation agrees exactly with the reference over a sustained firing/homing fixture (240 ticks, 300 enemies).
- npm run build passes; existing bundle-size advisory remains.
- npm test passes: 66 tests.
- Swarm, enemy lighting, projectile lighting, gem lighting, and startup/performance browser tests pass.
- Replay/practice/browser regression passes at 1440 × 1400. The existing 1440 × 900 harness cannot click its expanded practice button because it falls outside the viewport. Product UI and that test file were not changed.

## Reproduce

Start the development server at http://127.0.0.1:5173, then run:

```sh
npm run test:optimization
# To select another original revision:
npm run test:optimization -- <git-revision>
# Diagnostic bloom/sky ablations and component CPU timings:
npm run profile:rendering
```

The comparison creates a temporary source tree from the reference revision and removes it on exit. Both comparison canvases are detached from the DOM to avoid presentation/visibility bias, samples alternate order, and GPU queries are awaited individually. GPU-only ablations use one WebGL context. Dynamic resolution is held constant. Ablations affect only the test renderers.

Full samples and p95 summaries: comparison.json. Exact-matching mixed-scene images: before.png and after.png.
