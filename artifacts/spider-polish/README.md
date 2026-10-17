# Spider anatomy and presentation

The Brood Weaver, Armored Matriarch and Skitter now use project-authored arachnid geometry in `src/spider-anatomy.ts`, replacing the shared community spider mesh.

- Eight tapered, segmented limbs with alternating gait, curved tarsi, keratin spurs and small cuticle bristles.
- Overlapping dorsal shields; matriarch horns and reinforced limbs; lean juvenile abdomen.
- Recessed copper eyes, dark mouth, hooked fangs and paired pedipalps.
- Stable anatomical surface coordinates, waxed chitin and fine growth striations.
- Head anatomy follows the existing combat pivot. The compact dark-jade crystal retains its combat position and hit feedback; its visual radius and damage radius share the same reduced size.
- Juvenile inspection models retain detail. Instanced gameplay meshes use bounded-error simplification and one draw per swarm.

Run `node tests/spider-polish-browser.mjs` against Vite on port 5173 for screenshots, shader validation, animated-pixel checks, head/crystal alignment through multiple poses, and a 400-spiderling gameplay stress scene. Results are in `report.json`.
