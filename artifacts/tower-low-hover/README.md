# Low creature hover

The earlier height rule anchored the legacy tower root above the floor, even though the creature's visible tendrils already ended above that root. The new rule subtracts the current articulated underside height, placing the lowest tissue just above the arena.

`armorBottom` now evaluates downward support of the same transformed part bounds used for projectile armor, including all tentacle joints and breathing. The 0.28-unit base clearance receives only a 0.04-unit lift and ±0.025-unit bob. Root position, crystals, spawn mouths and armor move together. Geometry and creature size are unchanged.

The browser check sampled 64 poses for each of the three creatures, over 44 seconds and alternating ordinary and raised-tile positions. Exact rendered vertices gave these visible floor gaps:

| Creature | Minimum | Maximum |
| --- | --- | --- |
| Maw Lantern | 0.299 | 0.393 |
| Bifanged Broodmother | 0.298 | 0.426 |
| Crowned Abomination | 0.295 | 0.350 |

`before.png` and `after.png` use identical camera, scene time, pose and positions, changing only the root altitude rule. No page/shader errors.

Validation: production build; 31 tower/projectile/clearance/movement/Drake/lifecycle unit regressions; rendered underside check; death spin/sink and animated armor browser checks.

Reproduce: `node tests/tower-hover-browser.mjs` with Vite on port 5173.
