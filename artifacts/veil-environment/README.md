# The Bruised Veil

A dedicated post-rain chapter, active during the existing 126–144 s arrival and 241–259 s Furnace handover. Encounter timing, floor collisions and arena shrink remain controlled by the existing simulation.

## Surface

`src/veil-environment.ts` extends the existing stone material without another floor mesh or render target. It adds view-dependent parallax relief (12 layers on High, five on Low), the existing stone normal and roughness maps, per-tile mineral variation, chipped/recessed joints, irregular still pools and rough grazing reflections. Water and sky use the same radiance function and panorama. Selected seams carry restrained violet light, strongest around the outer cut stone; sparse angular veins are evaluated near the rim. Distant seam emission fades before it can become a bright grid.

The height texture is a 1024 px, quality-94 JPEG derivative of the existing `assets/materials/rock_tile_floor/2k/textures/rock_tile_floor_disp_2k.png`, produced with macOS `sips` for a 257 KiB runtime download instead of the 6.3 MiB source. It is sampled as data with no color-space transform. Existing normal and roughness maps retain their original resolution. The rock faces reuse the existing entrance rock texture.

## Surroundings

The chapter has a dedicated generated full-sphere panorama, ten distant monoliths split into 30 fractured pieces, 160 suspended rock fragments (64 on Low), and 320 slowly rising motes (100 on Low). All rock dressing stays outside the shrinking platform. The cooler, clearer mist retains the existing continuous chapter interpolation. Motion follows the survival clock and freezes under reduced motion; pausing and seeking require no accumulated state.

The sky texture was made with the built-in imagegen tool. The exact generation prompt and asset provenance are recorded in `assets/provenance/veil-sky/prompt.md`. The runtime asset is `public/assets/environment/veil-sky-v1.png`; it is copied into the project and packaged with the game.

## Preview

Open `http://127.0.0.1:5173/artifacts/descent/preview.html?time=180`.

The preview includes **Veil arrival · 1×**, **Veil floor** and **Veil opening** controls. The PNGs in this directory are real game-renderer captures, including enemies, gems and the hand, rather than concept images.

## Verification

- `npm run build`
- `npx tsx --test tests/veil-environment.test.ts tests/descent.test.ts tests/mist-state.test.ts tests/storm-rain.test.ts tests/furnace.test.ts` — 17 tests.
- `node tests/veil-environment-browser.mjs` — High/Low captures, neighboring rain/Furnace views, all four transition boundaries, pause, rewind, reduced motion, three additional environment draw calls, and no WebGL/browser errors. See `report.json`.
- `node tests/veil-performance-browser.mjs` — local 1280×720 GPU timings and draw counts, with atmosphere and the same Veil sky in both baseline and enabled cases. See `performance.json`. These are local fixture measurements, not a frame-rate guarantee for dense combat or other hardware.

No new ambient audio was needed: the existing environmental audio system already crossfades from the rain recording to the Veil wind/resonance bed on these same chapter boundaries.
