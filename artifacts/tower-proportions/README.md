# Taller, leaner first and second spawners

Tower I outlet height increases from 6 to 8 authored units, extending the torso and hanging anatomy while preserving its body radii and head width. Its measured posed gameplay height changes from 6.14 to 7.67 units (about 25%).

Tower II outlet height increases from 9 to 10 units. The abdominal radii are reduced by about 30%, shoulders and heads are narrower, and crystal centers move from ±3.5 to ±2.85. Siphons, tissue seams, tentacles, collision and spacing follow the narrower anatomy. Measured posed height changes from 8.91 to 9.64 units (about 8%); overall width changes from 7.52 to 6.35 (about 16% narrower).

Tower III is unchanged. Height/width measurements use the same sampled animation pose in the browser preview, so curled tentacle extents can vary across frames. The first tower's body is not widened.

`hover/after.png` is the actual game renderer at player height and the established low hover clearance. `before.png` is the preceding proportions at the same camera. `all-towers.png` normalizes each model to panel height for anatomy inspection; use the gameplay view or motion clip for relative scale.

Validation:
- Production build passed with the existing bundle-size advisory.
- 31 tower, projectile, movement, clearance, lifecycle and Drake regression tests passed.
- All 192 exact-vertex hover poses remained clear of the floor: gaps 0.299–0.393, 0.299–0.411 and 0.295–0.350 units by tier.
- Shared materials, crystal hit/reset/destruction, target position alignment and animated bounds checks passed without page/shader errors.
- Browser projectile armor and death spin/sink checks passed.
