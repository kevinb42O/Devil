# Hand-origin projectile changes — 13 October 2026

Primary and homing daggers now physically spawn at fingertip sockets taken from the original hand OBJ meshes. Shot effects use the same socket positions and capture the firing hand and direction. The former camera-origin spawn and separate floating muzzle position have been removed from new gameplay.

`src/weapon-origin.ts` defines the measured sockets and the shared hand pose. Both the hand overlay and world scene now use the same camera projection. A fixed pose scale preserves the established hand framing at the reference 90-degree FOV and 16:9 viewport; changes to FOV, aspect ratio, and vertical aim keep hand and projectile origins aligned.

The shot ray starts at the camera to find the intended aim point, then each physical dagger travels from its fingertip toward that point, with the existing spread. The closest damageable target under the crosshair supplies the convergence depth; empty-space shots converge at 80 units. Swept collision, damage, shot counts, firing cadence, homing steering, and reserve consumption remain in the simulation.

## Rendering and simulation optimization

- Projectile matrices are written directly into instanced buffers without temporary Three vectors or per-dagger Object3D/Matrix4 work.
- Six projectile texture families retain instanced rendering. Capacity begins at 256 per family and grows geometrically as needed; the previous fixed 2,500 limit no longer silently drops projectiles.
- Upload ranges cover only live instances. Empty batches do not upload matrices.
- Previous simulation positions support fixed-step interpolation, so newly visible daggers begin at the muzzle and blend along their swept path.
- Collision queries use target stamps instead of allocating a Set for every projectile sweep/pass. A shared prior-position scratch vector replaces per-projectile position copies.
- Ghostpede lookup and homing candidate filtering occur once per tick. Nearest-target comparisons use squared distance.
- Projectile survivors and particle survivors compact in place. The homing audio selector retains only its nearest eight candidates instead of sorting the entire projectile population.
- A single small hand-mounted flame batch keeps active fingertips visible between fast projectile samples; it clears on release/flash expiry and adds at most one draw.
- Muzzle particles are smaller and shorter lived. Hand IV stream emissions drop from 42 flame/ember pairs to eight pairs per shot; physical dagger counts remain unchanged.

## Validation

- 49 automated tests cover firing cadence, damage, homing, deterministic replay, shared muzzle coordinates, vertical/horizontal rotation, near-target convergence, interpolation history, and existing game behavior.
- The projectile browser fixture checks 396 combinations of hand level, FOV, aspect, and aim. Maximum socket-to-world projection error was approximately `4.53e-15` NDC.
- Direct instance transforms agree with Three's canonical matrix/quaternion calculations within `2.61e-8`, including reverse and zero velocities.
- All 6,000 same-family test daggers render in one instanced draw, with capacity growing to 8,192. The last dagger's transform and empty-upload behavior are checked.
- In an isolated Chrome CPU transform fixture, 6,000 projectiles measured approximately 0.2–0.3 ms median for the new writer versus 0.6–0.8 ms for the prior allocation-based writer. This is an isolated CPU measurement, not an overall FPS promise.
- Original hand/stream browser checks, gameplay/practice/replay smoke checks, audio browser checks, the dense encounter performance fixture, and the production build are exercised.

Browser data is saved in `artifacts/projectile-audit.json`; per-hand firing-origin screenshots are `artifacts/hand-origin-1.png` through `hand-origin-4.png`.

New runs use replay rules version five. Existing version-four saved replays remain supported and reconstruct their original camera-origin projectile trajectories, so changed shot origins do not silently alter their recorded outcomes. This legacy mode is used only when replaying those recordings.
