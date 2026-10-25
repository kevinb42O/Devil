# Stronger creature tier hierarchy and smaller gems

The new lineup separates tiers by height and silhouette rather than body bulk:

- Tier I retains its taller narrow body. Visible crystal radius decreases from 0.70 to 0.52.
- Tier II authored outlet height increases from 10 to 13. Its forked crest becomes taller and more swept. It retains the slim abdomen from the preceding pass. Visible crystal radius decreases from 0.80 to 0.60.
- Tier III authored outlet height increases from 13 to 18. Its mantle has a pinched waist, narrower ribs, slimmer radial necks and heads, and three taller swept horns. Its radial anatomy, crystal centers and siphons move inward together. Visible crystal radius decreases from 0.90 to 0.66.

The balanced damage sphere formula remains unchanged, preserving forgiving targeting. All anatomy, crystals, outlets, collision and low hover follow the new shared coordinates. Spawning has no special spin; slow idle rotation and death spin/sink remain.

Measured gameplay-scale posed bounds:

| Tier | Previous height | New height | Previous width | New width |
| --- | --- | --- | --- | --- |
| I | 7.67 | 7.67 | 4.10 | 3.97 |
| II | 9.64 | 12.79 | 6.35 | 6.04 |
| III | 12.77 | 18.41 | 9.38 | 7.57 |

Bounds depend on animated tentacle pose. Tier I's body width is unchanged; its slightly smaller total bounds reflect its reduced gem.

`hover/after.png` shows all three at player height, at the same positions as `before.png`. `towers-in-motion.webm` uses gameplay root scales and a fixed body orientation to expose appendage movement. Individual studio panels normalize height and should not be used for relative-scale comparison.

Validation: production build; 31 tower/projectile/movement/clearance/Drake/lifecycle tests; shared material and crystal hit/reset/destruction checks; target alignment within 1.8e-15; animated collision bounds; and 192 exact-vertex floor-clearance poses with gaps about 0.295–0.412 units. Browser armor and death spin/sink checks also passed.
