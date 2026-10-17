# Tower materials

All three tower tiers now use shared physically lit surface materials, replacing the flat unlit colors on their masonry, bands, inlays and exhausts.

- Stone: staggered courses with individual block shading, recessed mortar, beveled and chipped edges, mineral flecks, pores, fine cracks and soot.
- Metal: engraved lozenges and border rails, inset stud details, directional scratches, mottled oxidation and worn copper/brass/gold finishes.
- Exhausts: dark, rough soot.
- Crown crystals: polished amber facets, inclusions, luminous cores and bright hit feedback.

Procedural surface fields drive color, relief normals, roughness and metalness in one render pass. Surface density follows mesh scale, including the foundation's terrain adaptation. No texture downloads, new geometry, extra lights or additional draw passes are needed. Materials are shared between tower clones. Geometry, crown movement, weak-point coordinates, projectile collision and spawn behavior are unchanged.

Implementation: `src/tower-material.ts` and the tower material selection in `src/remake-enemies.ts`.

Validation:
- `npm run build`: passed, with the existing Vite bundle-size advisory.
- `npx tsx --test tests/remake-towers.test.ts`: four tests passed, including shooting crystals, armor collision, skull emission and historical replay behavior.
- `node tests/tower-materials-browser.mjs`: all tiers rendered without page or shader errors; scene draw count was 117 before and after. Maximum weak-point position difference was less than 0.000001 world units. Crystal hit/reset/destruction behavior passed for all tiers. No GPU frame-time claim is implied by the draw-count comparison.

- `node tests/remake-models-browser.mjs`: all 22 enemy models and the actual renderer passed with no errors or original enemy asset requests; the 1,000-enemy swarm remained batched at 10 draw calls.

`all-towers.png` compares the three finishes. `squid.png`, `squid2.png`, `squid3.png` show the individual towers under fixed studio lighting. `in-game-before.png` and `in-game-after.png` use the actual renderer and player-eye camera. `report.json` contains the measurements.
