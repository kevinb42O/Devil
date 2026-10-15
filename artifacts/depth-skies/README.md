# Furnace and Cathedral panoramas

The Furnace and Cathedral Below now use original generated 360° panoramas, at the same source detail and filtering quality as the ash and Cloud Grave textures. The assets are `public/assets/environment/furnace-sky-v1.png` and `cathedral-sky-v1.png`.

The Furnace has layered charcoal smoke with broad copper/rust backlighting. The Cathedral has monumental distant basalt vaults, eroded arches and a bottomless plum-grey void. Both surround the arena above and below, without a ground plane or hard horizon.

## Integration

- Furnace arrival: actual survival/replay time 241–259 s.
- Furnace → Cathedral: 362–380 s.
- Cathedral → Unlit Depth: 454–472 s.
- Each panorama rises from a fixed chapter origin. Fade weights do not alter its travel, so transitions cannot reverse the descent.
- Wrap overlaps are blended continuously, with wrap-aware texture gradients to prevent a thin mip-filtering seam. Dark, narrow polar caps match the cavern and prevent a flat purple patch or pinching at the zenith.
- Generated cathedral architecture takes over from the old rib silhouettes. Furnace arcs remain as restrained accents. Existing volumetric smoke/shafts and coordinated scene lighting remain active.
- Pure Furnace/Cathedral backgrounds skip procedural cloud noise. Crossfades still use one sky mesh and one draw, with no additional render targets or passes.
- The five panoramas are preloaded before renderer preparation. No gameplay, encounter schedule, physics or replay clock is changed by this replacement.

## Verification and preview

`npm run test:depth-skies` runs the shared scene audit in late-chapter mode and an isolated sky test. `audit.json` records real enemies and hand, forward/upward views, entry/exit continuity, wrap samples, pause/rewind, Low quality and isolated sky draw counts. `motion.json` records upward image movement, frozen Reduced Motion, both panorama wrap boundaries, and the dark Cathedral zenith.

The PNG files are actual game-renderer captures. Open `/artifacts/descent/preview.html?time=289` for the Furnace or `?time=380` for the Cathedral. **Into the Furnace · 1×** and **Cathedral arrival · 1×** play their arrivals at normal speed.

Validation passed: production build, scene audit, depth motion/wrap/pole checks, weather wrap regression and `git diff --check`. The build retains its existing large-chunk warning.
