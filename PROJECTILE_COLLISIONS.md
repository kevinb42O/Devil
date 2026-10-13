# Projectile impacts

Enemy and tower contact ends a primary or homing projectile at its first swept impact. Tower armor produces three short sparks through the existing capped particle batches. Physical daggers, procedural glows, and floor light splats all disappear together. Damageable targets retain their health, weak-point rewards, and level-dependent homing damage; a homing shot now stops at the first target instead of piercing several targets.

Floor contacts alone ricochet. The simulation resolves the floor crossing before any later enemy contact, reflects and damps velocity, and spends the remainder of the fixed tick on the reflected trajectory. Primary daggers fall under gravity after their first floor bounce. Both rendering systems sample the same contact path, including its direction, so interpolation does not draw a straight shortcut across the bounce.

Tower armor uses shared, prebuilt local mesh BVHs behind the existing spatial grid. Rotations and emergence scale follow the renderer. Squid I/II tentacle queries invert the original arm deformation; short chords approximate pitched sweeps. The arm shader and collision queries share simulation time. Raster vertex snapping may move a visible edge by up to one 1/16-unit grid step relative to the mesh surface.

The bake includes all three squid tiers, Leviathan, and Thorn. Existing damage spheres cover other enemies and pede segments; destroyed segments absorb shots without damage. Shielded spiders absorb shots in their body collider. No new point lights or per-impact meshes are created. Impact fragments share the existing 1,600-fragment limit.

Rebuild the mesh data after changing original tower geometry or its rig transforms with `npm run assets:colliders`. The generated data is `src/projectile-colliders.json`; the bake is `tools/build-projectile-colliders.mjs`.

Validation: `npm test`, `npm run build`, `npm run test:projectiles`, `npm run test:projectile-lighting`, and `npm run test:projectile-impacts`. The impact browser audit checks all tower tiers, dagger/glow removal, floor interpolation alignment, short impact animation, and 1,000 simultaneous armor contacts across eight towers. Measurements are saved in `artifacts/projectile-impact-audit.json` and depend on host load.
