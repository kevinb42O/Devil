# Cosmic opening validation

The new presentation adds 30 seconds before the entire existing environment route. Live simulation time, encounters, replay rules and recording formats are not shifted. The generated panorama supplies the distant galaxy; a world-space volumetric nebula crosses the arena from below to above. The arrival blends at 21–30 seconds; the original opening starts at 30 seconds and Cloud Grave at 69 seconds.

Open `/artifacts/descent/preview.html` on the Vite server. **Cosmic opening · 1×** plays the complete opening through the first cloud chapter. The preview displays survival time and derived environment time separately.

## Verification

- `npm test`: 380 tests passed in the shared working tree, including legacy solo replay and crew reconstruction checks.
- `npm run build`: passed; Vite reports the existing large-bundle advisory.
- `npm run test:descent`: passed, including real practice entry, pause, settings persistence, death replay and replay seeking.
- `npm run test:mist`: passed, including depth clipping, entrance mist, High/Low, reduced motion, emissive lighting and disabling both mist draws.
- `npm run test:cosmic-nebula`: checks actual cold floor pixels, nonzero volumetric contribution and upward motion of the isolated foreground nebula.
- `npm run test:cosmic-performance`: latest richer-nebula measurement exceeds the original 0.5 ms target during the transition. See `performance.json`; the earlier procedural-draft pass is superseded.

The original sky and mist evaluator outputs were captured from Git into `tests/fixtures/environment-before-cosmos.json`. A regression test compares every original field at 15 checkpoints against the new output at time + 30. The new time fields and cosmic parameters are evaluated separately. Gameplay source, replay format and rules are not part of this feature.

The pixel check during the cosmic phase reproduces the same image after pause and backward seeking. The mean byte difference across the 29.999–30.001 second join was 0.00253, with no visible discontinuity. See `integration.json` and `play.json`.

Existing replay compatibility is covered by automated reconstruction and render integration tests. No user's saved replay archive was imported for this check.

## Performance scope

The benchmark alternates the original shaders and the new shaders in one WebGL context, using fixed scene depth. It measures the isolated sky plus both fog draws with GPU timer queries: 15 warm-up and 35 measured samples per mode/case. The latest measurement under the current desktop load exceeded the 0.5 ms target, particularly at 25 seconds. Do not use the earlier draft’s 0.381 ms result for this version. Further performance work and a controlled hardware comparison remain outstanding. No passes or render targets were added.

This is an isolated rendering measurement on one machine. It does not establish the full-frame p95 target on a separate lower-power device. Fenced wall times in the report are a proxy and must not be interpreted as GPU time.

The Milky Way uses a generated panorama from `public/assets/environment/cosmic-galaxy-v1.png`, loaded before gameplay preparation. In pure space the sky bypasses the atmospheric noise shader. The nebula uses the existing quarter-resolution volume and reconstruction passes, at the original 40/20 sample counts. Density samples are reused for gas illumination. Large banks use the actual 32³ lattice scale, rise at approximately 1.3 m/s, and retain a clear zone close to the camera. Travel coordinates remain independent of fade weights. Warm lighting is removed from both the shared material path and the separate player floor-light shader.

## Current captures

`nebula-0.png`, `nebula-8.png`, `nebula-16.png`, `nebula-21.png`, `nebula-25.png`, `nebula-30.png` and `nebula-up.png` show the generated panorama, cold stone and real foreground volume. `nebula.json` records its rendered contribution, cold floor pixels and upward movement with all geometry and sky hidden. During the 0/8/16 s probe, the volume's vertical light centroid rises from approximately 252 to 287 to 434 pixels in bottom-origin screen coordinates.

`direction.json` verifies upward background travel, a black zenith and frozen travel under reduced motion. `integration.json` and `play.json` verify the normal renderer and replay paths.
