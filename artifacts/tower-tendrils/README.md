# Articulated squid tendrils and larger spawners

Replaces the previous small rigid tendril rocking with five serial joints per appendage. A phase-delayed curvature wave travels down each tentacle; each appendage has its own phase and the largest tier moves more slowly. Fleshy sucker lips follow the joints. Match-age animation is deterministic across pause and replay seek. Renderer and projectile armor compose the same full ancestor joint chain.

Normal-run scale increases relative to the previous creatures:

| Kind | Increase | Root scale | Measured posed height |
| --- | --- | --- | --- |
| Maw Lantern | 40% | 0.868 | 6.14 world units |
| Bifanged Broodmother | 45% | 0.899 | 8.91 world units |
| Crowned Abomination | 50% | 0.930 | 12.77 world units |

Height varies with breathing and tentacle pose. Historical legacy tower scales retain their old mapping. The enlarged root is shared by visible anatomy, crystal targets, spawn outlets and spacing. Broad-phase radius now includes traveling appendages. Outgoing streams resolve the enlarged hovering body's clearance before descending, including Drakes that subsequently land.

## Evidence

- `towers-in-motion.webm`: fixed orientation studio video, so the appendage motion is visible without model rotation; models use actual gameplay root scales.
- `in-game-after.png`: player-height scene with the enlarged creatures at the same fixture positions as `../tower-creatures/in-game-after.png`.
- `report.json`: 40 sampled poses per tier, 20/30/45 tendril joints, tip travel of 1.76/2.58/3.36 world units. Animated geometry remains inside the collision broad phase. No page or shader errors, crystal hit/reset/destruction passed and maximum target alignment error below 2e-15.

Validation: production build passed with existing bundle advisory; 29 tower, projectile, clearance, movement and Drake regression tests passed; armor browser rays matched visible geometry and impact normals.

Reproduce with Vite on port 5173:

`TOWER_OUTPUT=artifacts/tower-tendrils node tests/tower-redesign-browser.mjs`

The articulated models contain 30/46/67 meshes. They cost more draw calls than the preceding rigid tendrils; no frame-rate improvement is claimed.
