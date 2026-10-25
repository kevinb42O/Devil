# Skulls I–III: horror anatomy pass

Implemented locally on 25 October 2026. New runtime geometry is authored in `src/skull-anatomy.ts`; original meshes are used only in the development reference captures. No commit, push or deployment was performed.

Skull I now has a compact biting mandible, a deep cranial vault, actual orbital/nasal openings and black recessed sockets. Skull II trades its metal helmet and visor for bone and heavy descending ram horns. Skull III trades the split mask and tissue skirt for a broader skull, extended jaw, serrated curling horns and occipital barbs. The same anatomy feeds the three transmuted variants, with their existing cold palettes. Dry keratin replaces the horns' generic shell patterns; decorative luminous lines are removed.

All six templates remain merged, instanced, single-material geometry. Facial bone and horns stay rigid; existing temporal-root motion, flight attitude, hit flashes and replay behavior are retained. Collision radii, paths, HP, targeting, spawn rules and network/replay formats are unchanged. Skull IV, spiders, eggs, towers, snakes and bosses were not redesigned in this pass. Shader changes are scoped to `SKULL_HORROR`.

## Review

Open `index.html` through the development server for the original-reference / previous / new comparison. `lineup.png` contains the new family. Models in studio captures are individually framed, not a scale comparison. Original component placement uses imported coordinates and is an approximate reference assembly; original skeletal joint transforms have not been recovered.

- `before/current-*-*.png`: captured incumbent geometry and materials before this pass.
- `reference/clay-*-*.png`: original anatomy under neutral clay shading.
- `after/current-*-*.png`: final new geometry, front/side/three-quarter views.
- `after/arena.png`, lighting variants, `near.png` / `far.png` and `after/dense.png`: actual combat renderer captures. The controlled lineup faces the camera at 5, 12 and 30 units; it is not a gameplay recording.
- `film/skulls-in-motion.mp4`: new model studio/arena showcase. Its arena poses are controlled presentation, not a recording of player input.
- `../skull-flight/comparison.mp4`: production instance-motion fixture, using controlled positions and velocities.

## Validation

- `npm run build`: passed, including production packaging; existing large-chunk warning remains. An initial attempt failed during packaging on a missing copied original-audio manifest; a subsequent complete build passed without changes to audio/build code.
- 31 targeted movement/contact/tower-clearance/spawn/Drake unit tests passed.
- `tests/skull-redesign-browser.mjs`: passed for all six variants, finite attributes, hit flag/restoration, dark-scene readability and a 1,000-enemy scene. Final triangle counts per creature: I 882, II 1,270, III 1,510. Each kind uses one draw.
- `tests/skull-motion-browser.mjs`: passed after the main anatomy changes, covering real instance poses, pause/seek, transmutation, reduced motion, launch/descent, hits and capacity growth. Subsequent changes reduced hidden socket polygons and adjusted horn width; the final skull render suite was rerun after those changes.
- Enemy hit-flash, multiplayer presentation and camera-feedback replay browser fixtures passed.
- Impeccable mechanical detector returned no findings for the three changed rendering modules. Scoped `git diff --check` passed.
- The broad `tests/remake-models-browser.mjs` fixture stops on `Missing tower architecture squid`: it still asserts the retired chimney/plinth/exhaust tower structure. The current workspace already has a different tower implementation. That unrelated fixture was left unchanged; this is not a claim that the entire browser suite passed.

## Performance

`performance.json` compares the committed incumbent skull anatomy, profiles and shader with the new versions in the same production renderer. The benchmark uses 1,000 mixed ordinary/transmuted skulls, 960×640 low quality, explicit GPU synchronization, four alternating rounds and 240 measured frames per variant after warm-up.

Both variants used 19 scene draws. Submitted triangles were 1,259,095 before and 1,261,013 after. Local median synchronized render time was 3.4 ms before / 3.0 ms after; p95 was 5.9 ms / 5.7 ms. This sample shows no measured regression on this machine; it is not a hardware-independent FPS guarantee. Timing varies between rounds. Shader and source snapshots in `before/` are development-only benchmark inputs and are not included in production.

## Recreate

With the local Vite server running:

```sh
node tests/skull-redesign-browser.mjs
node tools/capture-skull-horror.mjs after
node tools/record-skull-horror.mjs
node tools/create-skull-horror-gallery.mjs
node tools/benchmark-skull-horror.mjs
```

The benchmark snapshots the Git HEAD incumbent. After committing a future change, use a known baseline revision if historical comparison is needed. Do not rerun the `before` capture against the new models and overwrite the incumbent evidence.
