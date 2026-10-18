# Single-player pregame sanctuary

The solo courtyard now uses its own generated basalt/limestone texture on 165 staggered, bevelled slabs. Roughness and fine relief derive from the mineral surface; a recessed mortar bed and thin aged-bronze approach inlay complete the material. The former unlit full-strength arena floor is no longer used here. Seal and lantern light produce local warm reflections; cool directional and hemisphere light retain cool stone detail away from the gateway. The seal's stroke emission and floor marker were restrained to keep the gateway legible.

`src/solo-sanctuary.ts` adds the same galaxy panorama as the Cosmic Expanse, shared without duplicating its GPU texture, sparse motes, wind-shaped hanging cloth, and instanced stone coping/side benches. The scanned fort, rock and lantern assets remain the architectural foundation. A single-player-only branch in the environment loader adds two quiet rear lanterns. Solid props remain beyond the existing walking bounds; movement, seal contact and run timing are unchanged.

The existing mist pass gets a solo-only cool ambient treatment and moon scatter. Its style is reset on every update, so multiplayer and gameplay retain their own atmosphere. Solo mist uses the courtyard's visual clock while survival time stays zero. Reduced motion freezes sky, banners, motes and the entrance pulse. Low reduces mote count from 180 to 70. Floor lighting, mineral relief and roughness remain active with mist disabled.

The sanctuary is constructed only in `SinglePlayerEntrance`; the multiplayer courtyard receives none of its decoration or material replacement. `loadEntranceEnvironment` preserves the existing multiplayer branch. The renderer precompiles the solo scene during preparation. Low room fog is bounded to the courtyard and preserves the immediate floor and gateway.

The built-in image-generation tool created the dedicated 1254×1254 base colour texture, saved in `public/assets/materials/solo-sanctuary/`. Its exact prompt, source method and checksum are recorded in `assets/provenance/solo-floor/generation.json`. The PNG is unmodified; game-native geometry and shading produce paving joints, bevels, roughness and relief.

The same-view captured floor sample changed from mean encoded RGB 172.8 to approximately 29.5; the fraction above 200 fell from 11.1% to zero. These are image-sample values, not physical luminance measurements. Local illumination near the seal remains deliberately brighter.

Validation:

- `tests/solo-sanctuary-browser.mjs`: actual floor brightness, dedicated texture, bevels and surface height, repeat-frame/pause and rewind consistency, animation, reduced motion with Low/mist off, solid-prop clearance, multiplayer decoration isolation, and frozen survival state.
- `tests/entrance.test.ts` and `tests/multiplayer-entrance.test.ts`: movement, seal contact, courtyard prediction and frozen combat timing.
- `tests/browser.mjs`: real menu → entrance → arena lifecycle, pointer capture, movement, pause/resume, weapons, death/retry and settings persistence.
- Production TypeScript/Vite build.

Visual evidence is in `artifacts/solo-sanctuary/`. `tools/inspect-solo-entrance.mjs` captures matching views; `tools/record-solo-sanctuary.mjs` records the actual renderer and the existing ritual audio at 50% effects volume with no recording gain boost. This change does not alter game audio or multiplayer presentation.
