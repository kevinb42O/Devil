# The Cathedral Below — atmosphere and transition plan

Status: implemented. Existing gameplay and environment timing remain unchanged.

Implementation: `src/cathedral-state.ts` shares seven apertures between the platform, mist and dust; `src/cathedral.ts` adds textured instanced stone ribs/arches, a cold limestone floor response, architectural illumination and suspended dust. The renderer exposes diagnostics and prewarms the stone/dust shaders. Furnace fill now cools out by 410 seconds. The departure closes the light apertures, fades the ribs through the panorama transition and retains a faint overhead silhouette and cool floor response in the depth.

High uses 826 stone blocks and 1,600 GPU dust sprites; Low uses 413 and 500. Two additional draws, no new render target, light or shadow map. The existing volumetric pass receives the shared aperture model. The first paced GPU fixture at 1280×720 measured 14.34 → 16.81 ms High and 5.84 → 6.40 ms Low. These are local measurements, not a universal frame-rate guarantee.

Validation includes exact chapter envelopes, geometry clearance outside the arena, actual browser rendering, visible platform contribution, camera parallax, pause/rewind, reduced motion/Low with mist disabled, and furnace/rain regression checks. Reports and rendered views are in `artifacts/cathedral/`. The film is recorded by `tools/record-cathedral-film.mjs`, using the shipped ambience and a disclosed recording-only +10.1 dB gain.

## What is actually next

Inspected `src/descent.ts`, `src/sky.ts`, `src/mist-state.ts`, `src/opening-mist.ts`, environment lighting and the shipped audio manifest. Captured current renderer frames at 356, 380, 410, 440, 454, 472 and 490 seconds in `artifacts/cathedral-plan/`.

- Cathedral landmark buildup begins at 356 seconds.
- Furnace → Cathedral visual/audio crossfade: 362–380.
- Cathedral chapter: 380–472, with the outgoing crossfade beginning at 454.
- Furnace floor heat currently persists until 410. Shared furnace lighting has a separate, longer envelope that can retain warmth until 472; reconcile that during this treatment.
- The outgoing crown motif begins at 440, before Cathedral → Unlit Depth at 454–472.
- Existing cathedral audio is distant resonant bells plus filtered wind. Depth uses geological rumble and a slow pulse.

The current scene has a detailed distant panorama, violet atmosphere and analytical shafts. The floor stays largely unchanged. The existing exit loses most architectural detail into an almost black background. These are the main gaps to address.

## Creative direction

An abandoned cathedral of impossible scale, suspended around a descending stone platform. Cold, weighty, almost still. Bone-grey masonry, deep aubergine shadows, narrow silver-lilac light, sparse suspended limestone dust. Warm enemies and combat effects retain their colour and become the liveliest things in the scene.

The signature image: a distant arch and its luminous opening, a visible shaft descending through dust, and a broad, broken band of light landing on the player's stone. All three must describe the same space.

## Environment and scale

Retain the panorama as the farthest depth layer. Add a sparse middle layer of actual rib/pier/arch geometry outside the maximum playable footprint, using a few repeated, varied modules. Strong silhouettes and convincing stone response matter more than small ornamental detail. Stage foreground-facing ribs, deeper arches and fog-separated recesses, with vertical scale revealed by slow apparent ascent as the arena descends. No looping or respawning architecture in view.

The ribs remain fixed in world azimuth and produce restrained parallax during movement. Their feet disappear into the abyss; their tops disappear into height haze. No decorative objects on the deck, accessible-looking doors, or geometry that suggests new cover. The playable edge stays readable.

Use a common opening definition for architecture, mist shafts, floor light and shadow. Audit the existing analytical shaft/rib alignment: an absolute sine mask can produce twice as many lobes as a seven-opening layout. A single shared aperture model prevents unrelated floor patterns and beams.

## Platform treatment — first implementation priority

1. Cool the existing stone into weathered limestone while retaining texture, tile relief and combat readability. Darken recesses and mortar; introduce restrained chalk/mineral variation. No replacement tiled overlay that swims across the original stones.
2. Project broad cathedral light through the shared openings. Arched silhouettes and rib shadows must fall across actual tile surfaces, with distance-softened edges and gradual intensity variation. Prefer material-space analytical masks or a small shared light cookie over a new full-resolution shadow system.
3. Break the light into stone grain and tiny mineral glints at grazing angles. Rough, dry highlights; no mirror-like wetness or rain puddles.
4. Carry a thin layer of cool floor haze through the darker recesses. Sparse pale dust hangs in lit volumes, becoming less visible in shadow. Most particles should be neutral, non-emissive, slow and very small.
5. Apply coherent cold fill to hands, enemies and exposed tile sides. Preserve warm enemy/gem/projectile identification. Fade the old furnace fill with the furnace cooling rather than allowing the cathedral to remain amber.

Avoid glowing runes, bright circles, glowing cracks and localised flashing floor patches: those imply mechanics. The floor communicates the architecture through illumination and material, without new hazard language.

## Atmosphere, movement and sound

Concentrate volumetric illumination in a few strong shafts and retain dark negative space between them. Depth-test against the scene, clear the nearest fighting space, soften fog at silhouettes and prevent bright halos around enemies. Dust gives the beams scale; dense smoke would obscure the architecture.

Motion should be slow: dust drifting through mostly stable light, distant haze moving in layers, ribs gradually rising past the horizon. No global exposure breathing or rhythmic flashing. Reduced motion retains the composition, material treatment and static light with particles and drift substantially reduced or frozen.

Retain the existing restrained cathedral bed as the foundation. Review bell proximity and reverberant scale against the new visuals. Keep resonances distant and environmental; no frequent stingers or spatial cues resembling enemy tells. Preserve combat priority and the quiet ambience level. Any additional audio needs source and licence verification before integration.

## Temporal choreography

| Match clock | Visual and atmospheric beat |
| --- | --- |
| 356–362 | Tall ribs become legible behind smoke; a first cool opening appears above the remaining warmth. |
| 362–380 | Architecture, mist and bell air emerge together. Fire recedes below the rim. The first broad cold light crosses the deck while warm incident light loses strength. |
| 380–410 | Full cathedral composition. The last heat distortion and copper reflection dissipate; cool limestone and architectural light take over completely. |
| 410–440 | Quiet monumental plateau. Clear light/shadow composition across the platform, suspended dust, deep layered arches and sparse environmental motion. |
| 440–454 | Begin the loss of the cathedral. Upper openings become increasingly occluded as the arena descends below the lit interior. Dust and floor illumination respond to the shrinking apertures. |
| 454–472 | Cathedral → Unlit Depth. Shafts shorten and narrow; their floor footprints contract and lose energy. Nearer ribs become silhouettes and disappear through deep haze. The last pale floor highlight and bell resonance carry the exit. |
| 472 onward | Establish the next atmosphere with a faint overhead crown/rim silhouette, distant depth cues and a low, cold readability floor. The void should have scale and pressure rather than appear to be an unloaded backdrop. Detailed Depth treatment remains a separate chapter task. |

Existing chapter timing stays authoritative; these are presentation envelopes inside it. Early crown/occlusion should follow the existing 440-second motif, not add an encounter event.

## Implementation sequence

1. Build stateless cathedral state and a shared aperture/shaft/light model. Prove floor light, grain, cold fill and cooling handover in a normal first-person view.
2. Add sparse instanced middle-distance architecture; align openings and floor projections, then verify all player-facing angles.
3. Shape mist and add one bounded dust batch. Tune contrast in live combat before increasing density or brightness.
4. Choreograph arrival and exit as a single continuous scene. Reconcile old furnace light, mist and heat envelopes; preserve existing audio timing and levels.
5. Capture and compare actual gameplay frames and video. Polish silhouette, material and transition problems before adding ornament.

Likely code: new `src/cathedral.ts` with pure state/geometry/material integration; shader hooks in the floor and environment lighting; shared opening parameters in sky/mist; renderer lifecycle and diagnostics integration. Preserve existing rain, furnace and cosmic hooks and cache keys.

## Performance and acceptance

Target two or three additional draws: instanced stone modules, dust, and an optional bounded atmospheric detail layer. Reuse the existing volumetric pass. No new full-screen pass, dynamic shadow map, per-particle simulation or per-opening real-time light by default. Low quality reduces module/dust counts and shaft detail while keeping the defining floor illumination. This is a target, not a measured result.

Measure paced GPU time in actual High/Low scenes at 720p with isolated on/off pairs and warm shaders. Aim for roughly 2–3 ms additional High cost; simplify geometry, overdraw or sampling if measurements exceed the budget. Test the 362–380 transition too, where fire and cathedral overlap.

Acceptance checks:

- Cathedral is identifiable from a floor-focused first-person view with the sky cropped out.
- A shaft, its opening and its floor light agree in position and direction.
- Motion reveals architectural depth rather than camera-following cards.
- Enemies, shots, gems, hands and the platform edge remain readable during busy combat.
- No apparent new hazard, collision, cover, door or safe-zone mechanics.
- Floor effects follow shrinking tile heights and do not float over dropped tiles.
- Arrival, cooling and exit have no pop, exposure jump, abrupt particle reset or silent audio hole.
- Pause, rewind, practice skips, reduced motion, Low quality, mist off and menu transitions reconstruct correctly.
- Earlier rain/fire/cosmic treatments still render correctly.

Delivery should include normal-speed recordings of 356–386 and 440–480, plus a platform-focused shot during the full cathedral. Record game ambience with the same disclosed preview gain; use a native-compatible MP4 and verify audio and video decoding. The camera, colour and lighting in the preview must be the actual game renderer.
