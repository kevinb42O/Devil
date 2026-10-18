# Blood spray and persistent floor stains

Enemy damage emits a small directional spray at the contact point. Destroyed
segments emit more droplets; deaths emit 24–60 droplets depending on enemy
radius. Large segmented deaths distribute those droplets over at most eight
body positions captured before the enemy is removed. Armor impacts keep their
existing sparks. Blood uses cosmetic event identities and its own seeded random
generator, leaving gameplay randomness, damage, and replay rules unchanged.

`src/blood.ts` advances ballistic droplets at 60 fixed cosmetic steps per second.
Sweeps split at tile boundaries to catch raised tiles and fast downward motion.
The first floor contact consumes the droplet and paints an irregular splatter;
underground emitters are suppressed and off-arena droplets fall into the void.
The active pool is capped at 768 droplets, with oldest pool slots replaced under
extreme load. No particle or stain history grows with the length of the run.

`src/blood-renderer.ts` renders airborne liquid in two instanced batches. Settled
blood lives in a 2048 × 2048 RGBA data texture (16 MiB of CPU pixels and 16 MiB on
the GPU, without mipmaps). Red stores coverage; green and blue store the most
recent landing time in quarter-second units; alpha stores liquid depth. The floor
shader composes blood after the arena surface effects and darkens fresh stains
over time. The
top-surface mask keeps blood off vertical tile faces, and stains move downward
with shrinking tiles without adding decal meshes or settled draw calls.

Texture updates happen only when landings change the field or a run is cleared.
Small splashes upload the changed portions of at most 192 rows; larger batches
use one full upload to bound GPU command count. Dirty ranges remain accumulated
until the renderer actually uploads the texture. Coverage addition saturates,
and landing timestamps use the newest value, so batched processing does not
make older droplets refresh stains.

Replay seeks feed skipped damage events and time steps into the blood system.
Backward seeks clear it before rebuilding. Multiplayer uses the existing
confirmed reliable effect stream, with bounded duplicate protection for blood
event identities; no individual droplets or stain textures are transmitted.
The current multiplayer lobby prohibits joining an active run. If late joining
is introduced, it will need a blood-field checkpoint alongside world catch-up.
Pause freezes blood, and retry/menu clears the pool and field.

The landing mask comes from TobiasM's CC0 “Blood splat,” downloaded from
https://opengameart.org/content/blood-splat. The unchanged source and provenance
are in `public/assets/effects/`. A generated jagged mask is available if loading
the image fails. The loaded sprite's silhouette and color detail become a small
32 × 32 stamp mask; rotations and stretched shapes vary the landings.

## Validation

- `npm test` includes physics, void landings, tile boundaries, bounded storage,
  duplicate delivery, frame cadence, source capture, gameplay RNG isolation,
  and replay seek hooks.
- `npm run test:blood` (with the Vite server on port 5173) checks 70 actual kills,
  low/high shader compilation and screenshots, reset, duplicate suppression,
  persistent stains while tiles shrink, and partial texture updates.
- Browser results and screenshots are saved to `artifacts/blood-audit.json`,
  `artifacts/blood-floor-low.png`, and `artifacts/blood-floor-high.png`.

The browser fixture verifies two extra draw calls for airborne blood and zero
extra draw calls for settled blood, with zero texture updates on unchanged
frames. CPU advancement timing is recorded separately from total GPU rendering
cost; it is a local reference measurement, not a cross-device frame-rate promise.


## Airborne liquid revision (2026-10-18)

The enemy death pass no longer renders eleven batches of unlit polygon chunks
or reuses the 32 × 32 floor-stain sprite on floating cards. The floor physics,
landing mask, stain shader, texture and upload rules are unchanged.

`src/blood-material.ts` wraps subdivided parameter grids into closed 3D liquid
surfaces. Surface derivatives supply curved normals to Three.js physical lighting,
including the arena's hemisphere, directional and local lights, fog and tone
mapping. A wet clearcoat gives small, view-dependent reflections. The dark red
material has a small emissive floor to retain readability in the darkest arenas.
This is a procedural liquid approximation, not a fluid solver or ray tracing.

Droplets orient in world space along ballistic velocity, rather than facing the
camera. An irregular subset of the carriers renders a curved ligament extending
back toward the source. Its neck narrows and separates into beads, fading between
160 and 320 milliseconds. Nine beads per enemy carrier vary in size, speed and
spread: a rounded heavy core, intermediate droplets and fine trailing spray.
Ligaments inherit the impact direction as render-only pressure metadata, giving
the initial jet a coherent direction. Random lengths and missing ligaments
break up the radial pattern. Pressure does not modify the landing velocities.

The existing pool still has 768 physical landing carriers. Render storage is
fixed at 6,912 droplets and 768 ligaments across two draw calls; a settled field
adds no draw calls. The extra beads are visual and disappear with their carrier
at contact, so landing coverage, positions and timing remain unchanged. The floor
image is loaded solely for landings. Airborne materials work even if that image
fails. Player death has its own separate gore pass.

References consulted for this revision:

- Epic Games, [Rendering Techniques in Gears of War 2, GDC 2009](https://cdn2.unrealengine.com/Resources/files/GDC09_Smedberg_RenderingTechniques-1415210295.pdf),
  especially page 40: world-space blood particles and lighting on liquid sprites.
- Three.js [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html)
  and [ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html).

No third-party asset pack was imported. Browser evidence for this revision is
under `artifacts/blood-liquid/`, including single-kill frames at 33, 100, 200 and
400 milliseconds, low/high floor captures and `audit.json`.

`node tools/preview-blood.mjs` records `liquid-motion.mp4` at quarter speed in
cosmic, furnace and cathedral lighting, with matching stills and a motion audit.
The physical surfaces use more triangles than the previous flat sprites; two
draw calls do not imply identical GPU cost. The browser stress check continues
to verify bounded storage and zero settled draw calls.

Enemy death bursts use a 1.6× visual size multiplier for liquid beads, ligament
width and ligament length. Fine spray spreads 1.6× wider, and the brief pressure
jet travels 1.25× farther. Hit-only droplets and physical floor landings retain
their existing scale. The larger burst keeps the same particle counts and lifetime.


## Pooled floor blood revision (2026-10-18)

Floor impacts now combine a filled, irregular liquid core with the existing
splatter mask and two small satellite impacts. Main stain radius is 2.55 times
the landing carrier's size (previously 1.6); impact angle controls elongation.
Overlapping coverage and liquid depth accumulate separately. The alpha channel,
previously unused, stores depth. Footprints stop at raised or missing tiles.

`src/blood-floor.ts` composes the blood after all floor environment layers and
before output conversion and fog. Packed landing timestamps are decoded before
bilinear filtering. Central-difference depth normals blend continuously to avoid
square highlight artifacts, with only brief, subtle capillary motion after
landing. Deep cores absorb the mineral pattern; thin edges show a brighter red.
Fresh pools reflect the existing sky textures and directional key light; the
reflections and red pigment darken as the pool dries. The wet surface is an
analytic shading approximation, not geometry, ray tracing or fluid flow.

The renderer uses a 2048-square field for sharper puddle edges. This increases
field memory from 4 MiB to 16 MiB on both CPU and GPU. Sparse uploads cover up to
192 dirty rows; unchanged frames do not upload. Settled blood still adds zero
draw calls. The airborne effect's scale, count and trajectories are unchanged.

`node tests/blood-floor-browser.mjs` checks filled cores and depth, compares fresh
and dried blood under identical lighting, and captures cosmic, furnace, cathedral,
side and grazing views in `artifacts/blood-floor-liquid/`. Unit tests cover pool
area, additive depth, age refresh and raised-tile boundaries. Material references:
[Epic's physically based material guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/physically-based-materials-in-unreal-engine)
and [Three.js material documentation](https://threejs.org/docs/pages/MeshPhysicalMaterial.html).


## Airborne visibility in the Unlit Depth

The airborne material now has a brighter red albedo and a shared diffuse fill
term driven by the scene hemisphere light, with a small minimum fill. A wrapped
normal response preserves the curved shading between wet specular highlights.
This fixes droplets whose bodies disappeared between highlights in the dark
chapters. It adds no lights, draw calls or particle storage and does not modify
the floor stain material or field.

`node tests/blood-visibility-browser.mjs` checks a fixed kill in cosmic and Unlit
Depth lighting, including low and high quality. It compares a blood-free frame
to the visible burst, verifies red-body visibility thresholds and saves frames
and measurements in `artifacts/blood-visibility/current/`. The recorded before
and after fixtures showed mean Unlit Depth burst contrast increasing from about
17 to 34 display-channel levels, with floor and background held fixed.


## Enemy-size rule for airborne deaths

Kill events already carry the enemy's collision radius in `amount`. A render-only
`sprayScale` stores `(radius / 0.65) ^ 1.15`, with no upper-size plateau. The
standard skull retains the existing spray dimensions; double radius gives about
2.2 times the dimensions, and radius 4 gives about 8 times. Droplet widths,
secondary spread and ligament dimensions use this multiplier. Brief pressure jets
also gain reach with its square root. Particle counts and lifetimes stay bounded.

This metadata is not used by floor physics or stamping. Hit-only effects and the
separate player death effect retain their existing scale. Unit tests verify
monotonic scaling, the actual kill-event radius and byte-identical floor output
when the new metadata is removed. `node tests/blood-size-browser.mjs` compares
actual skull, skull IV and orb kills at the same camera distance, saving evidence
in `artifacts/blood-size/`.
