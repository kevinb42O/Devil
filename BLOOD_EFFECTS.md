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

`src/blood-renderer.ts` renders airborne flecks in one instanced batch. Settled
blood lives in a 1024 × 1024 RGBA data texture (4 MiB of CPU pixels and 4 MiB on
the GPU, without mipmaps). Red stores coverage; green and blue store the most
recent landing time in quarter-second units. The floor shader blends blood into
the stone before the existing lighting and darkens fresh stains over time. The
top-surface mask keeps blood off vertical tile faces, and stains move downward
with shrinking tiles without adding decal meshes or settled draw calls.

Texture updates happen only when landings change the field or a run is cleared.
Small splashes upload the changed portions of at most 48 rows; larger batches
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

The browser fixture verifies one extra draw call for airborne blood and zero
extra draw calls for settled blood, with zero texture updates on unchanged
frames. CPU advancement timing is recorded separately from total GPU rendering
cost; it is a local reference measurement, not a cross-device frame-rate promise.
