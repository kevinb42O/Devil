# Combat arm materials

Seven procedural surface treatments for the first-person demon rig:

1. Awakened: charred hide, fine scales and pores.
2. Kindled: emberstone with broken glowing fissures.
3. Ascendant: blackened steel, worn facets and fine scratches.
4. Unbound: ancient bronze with recessed molten seams.
5. Twinflame: blood obsidian on both arms.
6. Dominion: amethyst alloy with polished edges.
7. Eclipse: ivory mineral plates, gold seams and layered grain.

The surfaces use bind-pose coordinates so they follow the animated skin. Color, roughness, metalness, relief normals and emission share the same plate field. Subpixel relief fades with distance. Existing fire, upgrade and replay feedback stays intact. Courtyard mode disables the surface treatment and restores the existing player skin.

Implementation: `src/combat-arm-surface.ts` and `src/combat-hand-feedback.ts`; the courtyard reset is in `src/crew-avatar.ts`.

Validation: production build passed; six gesture/upgrade unit tests passed; combat browser suite passed 84 tier/FOV/pitch combinations and 42 projectile comparisons (zero position difference). `node tests/arm-materials-browser.mjs` captured each tier at high quality, found no page or shader errors, confirmed the courtyard/combat lifecycle, and measured the same 20 scene draw calls, 73 geometries and 38 textures at every tier. These are allocation/draw checks, not a GPU frame-time benchmark.

`all-tiers.png` compares the seven in-game views. Individual captures are `tier-1.png` through `tier-7.png`; `report.json` records the material checks.
