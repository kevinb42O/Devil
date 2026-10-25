# Skull IV, spiders and eggs — horror anatomy pass

Implemented locally on 25 October 2026, following the Skulls I–III pass. New geometry is authored for this project. Retained original meshes are used only in the development reference captures; no original enemy mesh or texture is loaded by the production renderer.

## What changed

- Skull IV and Transmuted IV now use a broad cranial vault, deep sockets, projecting tusks and massive lateral curled horns with growth barbs. The former dragon membrane geometry and decorative transmuted halo are removed. Both variants use one merged material and one instanced draw. Their six-unit width is retained; the bottom of the anatomy sits at local Y -1.28, just above the existing collision floor.
- Both adult spiders have embedded cranial bone above the feeding crystal, deep ember sockets, larger curved feeding tusks, temporal horns and dorsal barbs. Existing eight-legged articulation, gait attributes, head pivot and crystal transforms are preserved. The matriarch retains a substantially heavier silhouette.
- Spiderlings share the bone-faced brood identity with shorter biting claws. Their inspection geometry has 3,142 triangles; the production swarm mesh has 1,099 and remains one draw.
- Eggs use closed, asymmetric brood-shell geometry with raised longitudinal ribs and recessed splits. Egg II adds organic overlapping scutes and keratin ribs. The equatorial ring and crystal tip are removed. Both retain their existing vertical clearance envelopes and use one instanced draw each.
- Eggs and spiderlings no longer receive floating glow sprites or the previous green floor-light spill. Small lit regions are part of the mesh; the egg material has a restrained ambient depth floor for readability. Adult feeding crystals keep their green material and hit feedback. A subsequent proportions fix separates visual size from the forgiving combat radius: Spider I uses a compact crystal and Spider II scales it with its larger feeding face. Lower facial bone is trimmed to keep both crystal centers exposed.

Movement, collision radii, HP, targeting, floor rules, spawn cadence, hatching rules, head exposure and replay/network formats were not changed by this pass. Towers, snakes, bosses and Skulls I–III were not redesigned.

## Review artifacts

Open `index.html` through the local Vite server. It contains the final family, before/after views, original reference assemblies, arena captures and a nine-second simulation clip.

- `before/current-*.png`: previous models, captured before editing.
- `before/reference-*.png`: retained original meshes under clay shading. Original joint transforms are unavailable; spider references include body/feeding components without reconstructed legs. These are approximate reference assemblies, not certified reproductions of the original renderer.
- `after/current-*.png`: final front, side and three-quarter studio captures. Each model is individually framed; these are not scale comparisons.
- `storm-gameplay.png`, `furnace-gameplay.png`, `depths-gameplay.png`: controlled fixtures through the actual arena renderer. The browser check rejects non-finite camera projections and blank scene captures.
- `brood-in-motion.mp4`: real simulation of grounded skull pursuit and both egg types hatching. Camera placement and initial conditions are authored for review. `film-report.json` records the resulting ten hatchlings, zero remaining eggs and decoded video dimensions.
- `dense-gameplay.png`: 500 spiderlings, 120 eggs and eight tier-IV skulls.
- `report.json`: finite geometry, instance budgets, target alignment, egg damage/hit restoration, hatching and stress-scene measurements.

## Verification

- Production build passed, including asset packaging; the existing Vite large-chunk advisory remains.
- 31 focused simulation checks passed: ground movement, floor clearance, body contact, spider formations and replay rules, gem consumption/egg conversion, head exposure, and five offspring per egg.
- `tests/drake-browser.mjs` passed: both variants retain six-unit width, grounded clearance, rigid anatomy, correct semantic regions, no retired membrane mesh and a one-draw geometry budget under 2,400 triangles.
- `tests/spider-polish-browser.mjs` passed: all three types visibly animate, the matriarch remains substantially larger, juveniles remain instanced, and held crystal centers track exposed/folded poses. Results are in `spider-check/`.
- `tests/spider-presentation-browser.mjs` passed after updating its old studio setup to use the production rig scale and current visual crystal radius. The lighted fixture compares the same resting-green pixel mask through the hit pulse, and verifies green dominance, visible brightening, material isolation, restoration and damage.
- `tests/brood-horror-browser.mjs` passed: all seven changed variants, 24 adult head/yaw combinations with maximum target error below 1e-14, both hatch types, egg hit/restoration/death, no floating brood glow anchors, real environment captures and 628 stress-scene instances.
- Skulls I–III render regression, generic enemy hit-flash, multiplayer presentation and replay-feedback browser fixtures passed.
- Impeccable's detector returned no findings for the changed anatomy, material and lighting modules. Scoped whitespace/diff checks passed.

The broader 51-test simulation selection had 48 passes and three failures outside the art changes: gem steering while firing, tap-release gem push, and tower spin/drift expectations. The focused enemy selections passed separately. Simulation/weapon/tower logic was left untouched. This is not a claim that the full repository test suite passes.

## Geometry and performance

| Kind | Inspection triangles | Swarm triangles | Instanced draws per kind |
| --- | ---: | ---: | ---: |
| Skull IV / Transmuted IV | 2,034 | 2,034 | 1 |
| Spider | 16,440 | Individual rig | — |
| Spider II | 22,752 | Individual rig | — |
| Spiderling | 3,142 | 1,099 | 1 |
| Egg I | 884 | 884 | 1 |
| Egg II | 1,316 | 1,316 | 1 |

Adult mesh costs remain close to their previous counts (16,668 and 23,300). Skull IV and egg geometry are more detailed than before; their material batches are consolidated. The stress scene remains below 1.5 million submitted triangles and 80 scene draws; actual values and synchronized render timings are in `report.json`. Local timings are diagnostics, not a hardware-independent FPS guarantee or a controlled before/after benchmark.

## Recreate

With Vite on port 5173:

```sh
node tests/drake-browser.mjs
SPIDER_OUTPUT=artifacts/brood-horror/spider-check node tests/spider-polish-browser.mjs
node tests/spider-presentation-browser.mjs
node tests/brood-horror-browser.mjs
node tools/capture-brood-horror.mjs after
node tools/record-brood-horror.mjs
node tools/create-brood-horror-gallery.mjs
```

Do not run the `before` capture against the new code: it would overwrite the saved incumbent evidence. Working-tree source snapshots in `before/` preserve the previous anatomy and material stages for inspection; production does not import them.
