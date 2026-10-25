# Floating spawner creatures

Replaces the previous architectural tower pass with original creature geometry. Original Devil Daggers screenshots and the project's local reference captures were inspected for anatomy; no original enemy meshes or textures are loaded by this implementation.

- Maw Lantern: a narrow flayed torso, one skull maw, curved horns and four hanging tendons.
- Bifanged Broodmother: broad paired faces, a swollen brood sac, exposed ribs and six tendrils.
- Crowned Abomination: three radial skulls, a heavier mantle, a crown of horns and nine tendrils.
- Bases, plinths and terrain-stretched foundations are completely removed. Lower bodies taper into suspended viscera and tentacles.
- New-run spawners hover at a match-age-dependent altitude above the existing floor clearance. Crystal targets and emission positions follow the simulation root.
- Breathing, jaw opening and independent tentacle articulation are deterministic. Projectile collision applies exactly the same transforms as the renderer, including normal transforms.
- The material integration retains the old stone/metal/interior IDs for compatibility, but their visible finishes are now dermis, keratin and mouth tissue.
- Crystal local coordinates, outlet coordinates, radii and spawn cadence are preserved. Body armor and visible silhouette are replaced.

## Previews

- `all-towers.png`: studio inspection views normalized to panel height, not relative scale.
- `in-game-after.png`: actual game renderer at player height.
- `towers-in-motion.webm`: studio rotation at relative world sizes with breathing, jaws and tentacles. Studio hover is illustrative of the simulation bob.

Recreate using the Vite server on port 5173:

`TOWER_OUTPUT=artifacts/tower-creatures node tests/tower-redesign-browser.mjs`

## Verification

- Production build passed, with the existing bundle-size advisory.
- 24 tower, movement, clearance and projectile regression tests passed, including free projectile space underneath and deterministic hover.
- Browser armor check: 9,384 rays, 3,332 matching contacts, 37 emitted children; rendered triangles and impact normals agree.
- Creature browser preview: no page/shader errors, shared materials, crystal hit/reset/destruction, crystal positions within 1.8e-15 world units, all authored armor vertices inside the broad phase, and absence of foundation/plinth nodes.
- Templates contain 18/28/40 meshes, primarily due to independent appendage articulation. The three-enemy scene fixture has 117 total draw calls. No FPS claim is implied.
