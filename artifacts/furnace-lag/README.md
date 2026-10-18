# Furnace slowdown investigation — 18 October 2026

The Mac report describes a sustained slowdown as the furnace appears while the trainer is active. The running trainer session was left untouched.

## Findings

The furnace adds two volume draws containing 24 surrounding fire banks and 48 deck emitters at high quality. Previously every visible fragment could march 40 samples, each with five 3D noise reads. The near-camera fade was calculated after that work, so fully faded flames still consumed it. The floor also recomputed its static warped Voronoi crack field, soot and pulse noise for every visible floor pixel every frame.

The local Apple M1/ANGLE Metal profile isolated fire volumes, floor effects and mist. Removing the volumes reduced GPU time in both runs. A separate CPU fixture containing 600 skulls and eight armored towers produced 616 target points; enabled trainer scans took roughly 1.3–3.8 ms across the captured runs, with no large furnace-specific spike. This does not measure the native macOS ESP overlay or the user's complete live frame.

GPU timings were highly variable with another game/trainer session sharing the machine. In the paired run, identical baseline blocks ranged from 43 to 111 ms. The profiles therefore do **not** establish a reliable FPS improvement or prove the cause of every live slowdown. See `before.json`, `after.json` and `paired.json` for unfiltered results.

## Changes

- Bake the unchanging floor fracture, halo, soot and pulse-noise fields once during loading into a mipmapped 2048-square RGBA texture. Animation, incident firelight and the molten emission transmitted through blood remain live. No extra gameplay draw call is added; the cache costs approximately 21 MiB including mipmaps.
- Reject completely faded near-camera fire before ray marching.
- Reduce volume samples for distant banks and short silhouette rays while retaining the existing maximum budget for nearby plumes.
- Restore the render target, viewport and scissor state after baking; dispose the cache with the furnace.

## Validation

TypeScript and furnace/blood/weather unit tests pass. The furnace browser test confirms animated fire and floor lighting, stable pause and rewind, correct deck attachment, both quality settings and the existing six furnace draw calls. The weather browser test confirms rain washing and molten cracks remaining visible through dense blood. Both browser checks report no errors. `optimized.png` captures the optimized scene.

Run `node tools/profile-furnace-lag.mjs <label>` for component isolation and `node tools/compare-furnace-performance.mjs 113ecb8` for the paired baseline comparison. The comparison uses temporary reference modules and removes them on completion.
