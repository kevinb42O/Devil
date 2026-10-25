# Tower geometry rebuild

Implemented in `src/tower-geometry.ts`, `src/tower-material.ts`, and `src/enemy-presentation.ts`.

- Rift Obelisk: paired tapered basalt cheeks, a split crown and a braced single crystal socket.
- Twin Foundry: two separate hollow stacks, a low bridge, pressure collars and two outward crystal braces.
- Crown Citadel: three hollow bastions, an open center, sloping radial buttresses and three opening crown sections.
- Materials: fractured basalt and forged iron replace brick courses and engraved gold bands.
- Crowns use the existing emission pulse with tier-specific lift. Historical tower crown travel remains unchanged.
- Crystal centers, crystal sizes, outlet coordinates, spawn cadence and tower radii are preserved. Projectile armor follows the new visible triangles, including the open spaces between chambers.
- Static meshes are merged by material within each transform group. The three templates now contain 8, 10 and 12 meshes, versus 21, 31 and 44 before. In the same scene fixture total draw calls decreased from 127 to 61; this is not an FPS measurement.

## Preview

`all-towers.png` shows separate studio views normalized to panel height; it does not compare world scale. `in-game-after.png` shows the actual game renderer at player height. `towers-in-motion.webm` shows the real meshes at their relative sizes, rotating in studio lighting with the shared crown animation. The studio rotation is accelerated for inspection.

Recreate the previews with a Vite server on port 5173 and `node tests/tower-redesign-browser.mjs`.

## Validation

- `npm run build`: passed (existing bundle-size warning).
- 23 unit/regression tests passed across remake towers, clearance, movement and projectile collision regression.
- `node tests/tower-armor-browser.mjs`: 9,036 rays matched visible triangles and impact normals; 37 emitted children present.
- `node tests/tower-redesign-browser.mjs`: no page or shader errors; crystal hit/reset/destruction and shared materials passed. Every visible armor vertex remains within the collision broad phase. Maximum crystal world-position error: 1.8e-15.
