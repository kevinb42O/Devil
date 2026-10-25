# Light contained within the creature anatomy

Anatomical light masks are authored on the geometry before merging. The data stays attached to the moving tissue through the full tentacle joint chain. No point lights, extra light objects, additive shells or extra draw passes are added.

- Body sacs: lobed transmission patches and raised translucent seams, with dark vein/pigment interruptions.
- Siphons and mouths: recessed luminous wet tissue; the luminous cavity remains occluded by cheeks and teeth.
- Tendrils: narrow underside channels and sucker lips follow the articulation.
- Bone: receiving masks model a restrained amount of absorbed internal light around cheeks, jaws and ribs. Horns and thick bone retain dark silhouettes.
- Tier colors: ember orange, sickly yellow-green and crimson. Crystals retain their existing amber material and hit feedback.
- Light has a restrained traveling pulse driven by the shared match-time clock. `livingLight` is a diagnostic uniform for exact enabled/disabled comparisons.

`blackout-comparison.png` shows the same studio composition without any scene lights, toggling only the tissue emission. `cosmic-before.png` and `cosmic-after.png` use the actual game renderer and player-height camera. Environment tuning is unchanged. The current chapter at 510 seconds is bright, so the literal-blackout test is the strongest dark-readability proof.

## Verification

- Production build passed, with existing bundle-size advisory.
- 29 tower, projectile, movement, floor-clearance and Drake regression tests passed.
- 12,130 browser collision rays matched visible articulated geometry and impact normals.
- `node tests/tower-internal-light-browser.mjs`: all seven scene fixtures at low/high quality; no page/shader errors; tissue with zero authored light remains non-emissive and responds to world light direction.
- All three actual creature models remained readable without crystals or scene lights. Enabled tissue yielded 2,647 / 4,686 / 4,525 visible pixels in the 160x160 diagnostic target; disabled tissue yielded zero. The emitting tissue is a subset of the geometry.
- `TOWER_OUTPUT=artifacts/tower-internal-light/studio node tests/tower-redesign-browser.mjs`: shared materials, animation, collision bounds, crystal positions/hit/reset/destruction all passed. Scene draw count remains 174, equal to the preceding tendril fixture.
