# Thorn lighting and height

Fracture Spires retain dark volcanic glass with sparse, interrupted amber emission, a slow surface pulse, and restrained cold facet highlights. Four small lower-cluster glow anchors replace the generic bounding-box socket; their reduced strength keeps mist spill soft. The existing shared floor field uses a smaller thorn footprint. No per-thorn dynamic lights were added.

The central tip rises from 5.3 to 7 world units (32% higher); surrounding cones extend from 4.5 to 5.8 units in length. The central buried endpoint is retained. The remake projectile BVH was rebaked from the actual meshes; the Leviathan collider is unchanged.

- arena-high.png and arena-low.png: actual game renderer at a fixed camera, with mist.
- studio.png: close material inspection.
- before-*.png: same camera/settings before this change.
- report.json: height, upper-spike collision, light count, source anchors, bloom-independent emission and pulse checks.

Validation: npm run build; node tests/thorn-lighting-browser.mjs; node tools/audit-remake-colliders.mjs; node tests/enemy-hit-flash-browser.mjs. All passed. The production build retains its bundle-size advisory. Collider alignment includes 1,152 thorn rays with no missing, invisible or depth-mismatched hits. Increasing the scene from 3 to 43 thorns retains six scene lights. Render checks report no browser or shader errors.

Recreate with the Vite server on port 5173 and node tests/thorn-lighting-browser.mjs. THORN_BASELINE=1 writes baseline captures; use it only against the pre-change implementation.
