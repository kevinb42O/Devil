# Furnace environment

The furnace uses two photographed flame recordings, prepared as GPU flipbooks. Flames, smoke and embers surround the arena below its rim. The floor carries broad copper reflections, a warm stone response, and depth-aware heat distortion across the field. The playable surface stays visually clear; this environment introduces no collision, damage, or hazard logic.

## Timeline and composition

`src/furnace.ts` follows the existing descent clock: fire arrives at 241–259 seconds, remains through 362, and recedes into the cathedral by 380. Stone warms from 236–266 and cools through 410. All animation derives from match time, so pause and rewind reproduce the same image. Reduced motion freezes fire/smoke/embers and disables heat distortion.

Twenty-four deterministic emitters form two rings, with independently phased footage and drift. Flame cards begin below the deck and their conservative horizontal extent remains over 6 metres beyond the platform during the furnace. Smoke and airborne embers stay outside the arena. Floor heating combines turbulent incident light, footage-driven rough mineral reflections, fine drifting pale ash, and convection haze. It is a material and atmosphere treatment, with no glowing cracks or local fire patches suggesting damaging terrain.

## Sources and preparation

- Mixkit, “Mesmerizing close up of flames over a black background”: https://mixkit.co/free-stock-video/mesmerizing-close-up-of-flames-over-a-black-background-52312/
- Mixkit, “Intense flames on black background”: https://mixkit.co/free-stock-video/intense-flames-on-black-background-3758/
- Mixkit Stock Video Free License: https://mixkit.co/license/modal/videoFree/
- Terms: https://mixkit.co/terms/

The selected pages advertise the Free License, including commercial use. The saved source pages, license and per-source hashes are in `assets/provenance/furnace/`. Original recordings stay in ignored `assets/_sources/furnace/`; the game ships two prepared WebP atlases, approximately 1.8 MB combined. No original stock video is served by the game.

`node tools/build-furnace-flipbook.mjs` prepares the main recording; add `--secondary` for the second. Each atlas holds 64 frames in an 8×8 grid, sampled at 12 fps, with a short loop crossfade and black padding to prevent frame bleeding. The shader interpolates adjacent frames and phases/speeds each emitter independently.

## Rendering and validation

Fire, smoke and embers use three instanced draws. A continuous subterranean glow and a batch of low convection wisps bring the complete effect to five draws. High uses 24 fire/smoke cards, 520 embers and 56 convection wisps; Low uses 16, 180 and 24. Wisps follow the actual shrinking tile surface and remain noninteractive. Heat distortion shares the existing mist composite, adds no render target or draw, and rejects foreground depth boundaries. Distortion is absent when mist is disabled. Both texture atlases occupy approximately 42 MB including mipmaps on the GPU.

A paced WebGL GPU timer test at 1280×720 on the development machine measured High at 10.76 ms baseline / 14.22 ms enabled. The Low pair was noisy (6.99 / 6.00 ms), so it does not establish a reliable overhead figure. These are local fixture measurements, not universal frame-rate guarantees. See `artifacts/furnace/performance.json`.

Validation: `tests/furnace.test.ts` covers timelines, conservative clearance, source manifests and asset hashes. `tests/furnace-browser.mjs` checks actual texture loading, animation, visible contribution, pause, rewind, Low quality and draw count. `tests/furnace-performance.mjs` measures paced GPU time. `tools/record-furnace-film.mjs` records live renderer output and the existing chapter ambience; its recording-only gain is +10.1 dB for preview audibility and does not alter gameplay volume.
