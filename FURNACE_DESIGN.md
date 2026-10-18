# Furnace environment

The furnace renders fire as ray-marched 3D participating media. Photographed flipbooks remain only as a rough floor-reflection source. Flames, smoke and embers surround the arena below its rim, with smaller decorative fires rooted on the platform. The floor becomes scorched stone with irregular incandescent fissures, copper reflections, and depth-aware heat distortion across the field. The playable surface stays visually clear; this environment introduces no collision, damage, or hazard logic.

## Timeline and composition

`src/furnace.ts` follows the existing descent clock: fire arrives at 241–259 seconds, remains through 362, and recedes into the cathedral by 380. Stone warms from 236–266 and cools through 410. All animation derives from match time, so pause and rewind reproduce the same image. Reduced motion freezes fire/smoke/embers and disables heat distortion.

Twenty-four deterministic fire volumes form two rings outside the platform. Their conservative horizontal extent remains over 6 metres beyond the platform during the furnace. Each volume integrates emission and absorption through an advected 3D turbulence field, with a hot core, orange outer combustion, wispy edges and darker soot above. The field is sampled in volume coordinates, so moving around a flame reveals the same curls from another angle rather than rotating a flat image. A shared deterministic 64³ R8 noise texture adds 256 KiB of GPU data. High takes up to 40 integration steps per ray; Low takes 24, with early exit through opaque cores.

Forty-eight small deck fire volumes (28 on Low) follow actual tile heights as the platform shrinks. Near-camera fire fades to preserve the view. One third of the ember batch now rises from deck fires; the rest rises beyond the rim. The nearest eight deck fires contribute flickering light to the stone material. World-space fissures use warped cellular seams, narrow molten cores and diffuse red heat, with scorched mineral grain, rough reflections and convection haze. These effects introduce no collision or damage logic.

## Sources and preparation

- Mixkit, “Mesmerizing close up of flames over a black background”: https://mixkit.co/free-stock-video/mesmerizing-close-up-of-flames-over-a-black-background-52312/
- Mixkit, “Intense flames on black background”: https://mixkit.co/free-stock-video/intense-flames-on-black-background-3758/
- Mixkit Stock Video Free License: https://mixkit.co/license/modal/videoFree/
- Terms: https://mixkit.co/terms/

The selected pages advertise the Free License, including commercial use. The saved source pages, license and per-source hashes are in `assets/provenance/furnace/`. Original recordings stay in ignored `assets/_sources/furnace/`; the game ships two prepared WebP atlases, approximately 1.8 MB combined. No original stock video is served by the game.

`node tools/build-furnace-flipbook.mjs` prepares the main recording; add `--secondary` for the second. Each atlas holds 64 frames in an 8×8 grid, sampled at 12 fps, with a short loop crossfade and black padding to prevent frame bleeding. The floor reflection shader interpolates adjacent frames; visible flames do not sample either atlas.

## Rendering and validation

Surrounding fire, deck fire, smoke and embers use four instanced draws. A continuous subterranean glow and a batch of low convection wisps bring the complete effect to six draws. High uses 24 surrounding fire volumes, 48 deck volumes, 24 smoke cards, 520 embers and 56 convection wisps; Low uses 16, 28, 16, 180 and 24 respectively. Wisps follow the actual shrinking tile surface and remain noninteractive. Heat distortion shares the existing mist composite, adds no render target or draw, and rejects foreground depth boundaries. Distortion is absent when mist is disabled. Both texture atlases occupy approximately 42 MB including mipmaps on the GPU.

The paced WebGL GPU timer test at 1280×720 records current local measurements in `artifacts/furnace/performance.json`. These are fixture measurements, not universal frame-rate guarantees.

Validation: `tests/furnace.test.ts` covers timelines, conservative clearance, source manifests and asset hashes. `tests/furnace-browser.mjs` checks actual texture loading, animation, visible contribution, pause, rewind, Low quality integration steps, grounded deck placement and draw count. It captures close and side views for visual inspection. `tests/furnace-performance.mjs` measures paced GPU time. `tools/record-furnace-film.mjs` records live renderer output and the existing chapter ambience; its recording-only gain is +10.1 dB for preview audibility and does not alter gameplay volume.
