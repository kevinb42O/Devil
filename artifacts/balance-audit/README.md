# Combat and spawn audit — 20 October 2026

Follow-up: the issues below have now been corrected locally. See [implemented fixes and verification](fixes/README.md). This document retains the original before-fix findings and evidence.

Audited working tree at `d5b0b60`, with history comparisons against `0b50ad6^` (immediately before the enemy remake) and `898f7ae^` (before the preceding creature-scale/weapon changes). This audit adds measurement tools and evidence only. No production gameplay, assets, tests, deployment, or existing trainer changes were modified.

## Finding

The enemy remake was a rules change as well as an art change. Several changes combine to increase pressure: harder-to-reach tower crystals, smaller spider targets, loss of tower damage from upgrade pulses, direct pursuit by tower-emitted Skull II enemies, and towers pushing one another away from their original paths. A separate confirmed collision defect affects the Leviathan and thorn remakes. These are concrete reasons for runs feeling different even though the spawn timetable and enemy HP did not change.

The exact point where this user becomes overwhelmed remains unknown. These probes establish mechanics and regressions; they do not establish a universal survival limit or simulate the user's aiming and decisions.

## 1. High impact: tower crystals moved upward, while their roots kept the old elevated entrance

`src/enemy-presentation.ts:26`, `:62`, `:64`, `:76`; `src/simulation.ts:244–279`; `src/enemy-floor.ts:13–18`.

The remake adds 6/9/13-unit structures above the tower origin and relocates crystals to their crowns. That origin still follows the prior floating creature's entrance and floor-clearance calculation. `armorBottom()` still reads the original baked tower mesh, including for new towers; it is not the bottom of the new telescoping foundation. Consequently, the inherited root height and the new architecture height accumulate.

Controlled probe: seed 71, each tower spawned separately at its normal perimeter location, ten seconds of normal simulation, emissions disabled. The legacy column isolates the immediately preceding tower architecture, retaining the already enlarged creature scale.

| Tower | Crystal world Y before remake | Crystal world Y now | Hit radius before | Hit radius now |
|---|---:|---:|---:|---:|
| I | 5.518 | 11.158 | 1.016 | 0.700 |
| II | 8.322 | 16.965 | 1.016 | 0.800 |
| III | 5.268 | 17.488 | 1.016 | 0.900 |

At a player eye height of 1.7, this increases vertical aim separation substantially. The smaller hit spheres also reduce target area by about 53%, 38%, and 22%, respectively, at equal viewing distance. Actual angular size additionally depends on player position. Looking up to clear a crown competes with tracking enemies at ground level.

This is not evidence that every crown is hidden or impossible to shoot. The 180-angle center-aim probe found that new tower crystals are often *less* occluded than the old imported armor. The principal proven changes here are elevation, target size, and their interactions with other mechanics.

## 2. Confirmed interaction regression: upgrade pulses no longer reach representative towers

`src/simulation.ts:700–718`; `src/upgrade-pulse-tuning.ts:2`.

The pulse still accepts targets only within `6 + targetRadius` vertical units of its origin. It checks the relocated crystal, rather than the grounded tower foundation. For the naturally elevated poses above, moving a tower into the pulse's horizontal radius and triggering hand II produces:

| Tower | Previous architecture damage | New architecture damage |
|---|---:|---:|
| I | 5 | 0 |
| II | 5 | 0 |
| III | 5 | 0 |

The probe directly runs pulse propagation at fixed poses to isolate height from movement and other damage. It does not imply that every possible current tower pose is immune, or that a player cannot hit elevated targets during a jump. It does prove that an existing source of clearing assistance was lost in ordinary standing-player configurations.

This can contribute to a feedback loop: towers live longer, additional emission cycles survive into the next scheduled encounter, and fewer safe collection windows remain. That is a supported gameplay inference, not a measured human survival outcome.

## 3. High impact: spider weakpoints were halved in radius

`src/enemy-presentation.ts:13–14`; `src/simulation.ts:763`; commit `0b50ad6`.

`SPIDER_CRYSTAL_SCALE` changed from 1.8 to 0.9. With the scale used immediately before the remake, the base hit radius dropped from 0.9 to 0.45. Spider size multiplies both: Spider I's mature radius is now 0.7425 rather than 1.485; Spider II's is 1.485 rather than 2.97. This is one quarter of the previous circular target area at the same distance. HP remains 25/200 and rewards remain one gem.

The visible crystal and damage target both use the smaller radius. This is a balance change, not merely a visible gem looking smaller while retaining its former hitbox.

## 4. High impact: an earlier size increase consumed more of the same arena

`src/enemy-presentation.ts:6–8`; `src/simulation.ts:246`; `src/pede-contact.ts`; commit `898f7ae`.

Before the remake, `CREATURE_SCALE` had already changed from 0.62 to 1. The simulation scaled tower/spider/pede body radii and pede contact offsets/radii by `1 / .62`, approximately 1.613. The arena's `WORLD_SCALE` remained 0.62, and the player's speed and contact radius did not receive a matching arena-size adjustment.

For example, a gigapede segment's lethal sphere radius grows from 0.93 to 1.50 before adding the player's capsule radius. This increases space occupied by hazards in the same encounter layout. It must be considered alongside the subsequent remake rather than attributing everything to the latest textures. This factor does not apply uniformly to every enemy: the swarm's collision radii are not multiplied by that same expression.

## 5. Confirmed collision defect: Leviathan and thorn use armor from their old models

`src/projectile-collision.ts:1–32`; `src/projectile-colliders.json`; `src/remake-enemies.ts:98–105`.

Current tower armor is constructed from the same procedural geometry as its visible structure. Leviathan and thorn armor still come from the old baked `leviorb`/`leviskull`/tentacle and `thorn` meshes, while the renderer builds a dragon-based Leviathan and a new cluster of procedural spires.

A browser probe loaded the actual remake assets and compared two-sided visible-armor raycasts with `sweepArmor()` at the same pose. Jewels were excluded from visible armor. It sampled 24 heights and 48 azimuths per enemy, 1,152 rays each.

| Enemy | Collision with no visible armor hit | Visible armor with no collision hit | Both hit, but impact distances differ by >0.05 |
|---|---:|---:|---:|
| Tower I | 0 | 0 | 0 |
| Tower II | 0 | 0 | 0 |
| Tower III | 0 | 0 | 0 |
| Leviathan | 212 | 0 | 909 |
| Thorn | 0 | 140 | 1,007 |

These are fixture counts, not probabilities during play. The Leviathan wing shader's animation is excluded from mesh raycasts. The thorn is procedural static geometry, and all tower controls matched exactly. Together with the source references, the results confirm that the remade late enemies' apparent surfaces cannot be trusted to predict projectile contacts.

Leviathan starts at 350 seconds in the unchanged schedule. Thorns occur later; they are a further late-game defect rather than an explanation for an early wall.

## 6. Spawn timetable is intact; tower movement after spawning is materially different

`src/survival.ts`; `src/spawn-placement.ts`; `src/tower-movement.ts:13–45`; `src/simulation.ts:451–476`.

The remake did not modify the survival spawn data, schedule generator, placement-angle functions, arena shrink data, or enemy stat table. The existing tests passed for both original replay schedules, combat-independent seeded placement, practice skips, simultaneous spawns, and solo/co-op placement consistency.

The new movement solver reserves mature tower footprints, pushes overlapping pairs apart, and may expand the entire group to clear residual overlap. It runs before emissions and player contacts. It does not constrain the resulting positions to original spawn rays or impose a per-tick displacement-speed limit. New towers can therefore displace older towers, and the point you later see is no longer necessarily on the original radial path.

Controlled pressure test: seed 71, full schedule for 300 seconds, retain every tower but remove other enemies. There are 38 surviving towers in each case. Maximum deviation from the unobstructed entrance path was 0 with the previous architecture and 24.875 world units with the new solver. This deliberately represents a backlog of un-killed towers, not a typical skilled run. It demonstrates the mechanism behind shifted apparent spawnpoints; it does not establish a normal 25-unit error in every match.

Every new run also receives a fresh cryptographic seed in `src/main.ts:162`. Exact locations are only expected to repeat with the same seed. Schedule times remain fixed.

## 7. Tower-emitted Skull II changed from wandering to pursuit

`src/simulation.ts:630–690`; commit `0b50ad6`.

New tower launches start vertically and turn toward the player. More significantly, `pursuingTowerStream` excludes emitted tier-II skulls from their former wandering target selection. Their goal becomes the player. Nominal tier speeds and HP were not increased by this branch, but target behavior changes pressure.

Same seed, tower at `(20,5,0)`, stationary invulnerable player at `(0,1.7,0)`, one Skull II child: after five seconds its horizontal distance from the player was 16.465 with old tower rules versus 0.117 with the new rules. The Skull III/IV controls already pursued under the former rules; their new high launches alter arrival paths and timing rather than introducing pursuit for the first time.

## 8. Homing can spend its entire packet on a hidden first crystal

`src/simulation.ts:793–795`, `:861–866`, `:922`.

`weakPoint()` selects the first living crystal in array order. Homing chooses an enemy using that point and steers toward it; it does not select another exposed crystal or route around intervening armor. Armor consumes the shot.

Frozen-pose probe, hand III, player 20 horizontal units opposite crystal zero: new Tower II has another accessible crystal, but all 20 homing daggers hit armor, deal zero damage, and consume their ammunition. Tower III also takes zero damage despite two other accessible crystals. The old Tower III fixture exhibits the same zero-damage behavior, so this is a pre-existing targeting weakness with a demonstrated current consequence, not a wholly new remake regression.

## 9. Wider primary spread alone is not a sufficient explanation

`src/weapon-tuning.ts:5–12`; `src/weapon-levels.ts:7–10`; commit `898f7ae`.

Hand II–IV spread doubled, but salvo counts grew from 2/4/8 to 6/16/24. Shotgun counts also tripled. A probe that compares only the cone width would wrongly report a blanket damage nerf.

The launcher sampling probe includes those historical counts and the focused lanes. Against a stationary radius-0.45 target at 20 units with perfect center aim, expected hits per second were approximately 22.32/22.44/28.24 before versus 22.64/23.18/28.09 now for hands II/III/IV. Thus it does not establish a primary-DPS collapse in that fixture. Fewer individual pellets hit, which can make the stream look less reliable, but that is distinct from total delivered damage. These results are not moving-target or whole-run measurements.

## Why existing checks missed this

- The new tower shootability test places a stationary projectile directly inside the crystal. It proves damage registration but does not prove the player can hit it from a normal ground position.
- The tower pulse test explicitly uses `legacyTowerArchitecture:true`, leaving the new crown-height interaction uncovered.
- Spawn consistency tests discard enemies after each step. They correctly verify initial event placement but cannot exercise crowded tower displacement.
- Existing armor geometry tests validate imported meshes; they do not compare every new visible enemy against its actual gameplay collider.
- Tower replay metadata preserves some previous behavior. It does not by itself preserve the pre-remake spider radius or every preceding global tuning change. Future fixes need explicit rules compatibility rather than assuming the tower flag restores the complete old game.

## Validation and limits

- `npm test`: 632 tests, 630 passed, 2 failed on the unchanged production code. The failures are the descent mist expectation at 350s (`0.065` actual versus `0.08` expected), and the isolated SQL fixture missing the `service_role` role. Neither failure is evidence of broken spawn timing. Full output: `unit-tests.log`.
- `npm run build`: passed, including TypeScript. Existing bundle-size warnings remain. Output: `build.log`.
- Headless simulation probes: completed; raw results in `measurements.json` and `target-access.json`.
- Browser collider probe: completed with no page errors; raw results and example rays in `collider-alignment.json`.
- No live deployment, human play session, user's death replay, real WAN co-op match, or end-to-end FPS benchmark was used. Existing environment/Furnace performance reports identify rendering costs, but they are not a fresh measurement of this user's current experience.

## Recommended correction order

1. Correct Leviathan/thorn armor to match the visible remake, with a regression probe using actual rendered geometry.
2. Reconcile new tower base/crown geometry with the old entrance root. Restore ground-player target accessibility and intentional pulse damage together; changing a radius alone leaves the height interaction unresolved.
3. Restore the previous spider target tolerance, or explicitly approve and compensate the new smaller target as a difficulty change.
4. Make homing select an accessible live crystal so an exposed tower does not consume an entire packet on a hidden array-first point.
5. Bound tower separation movement and anchor its outcome to intended encounter placement. Avoid replacing predictable paths with unrestricted pushing under backlog pressure.
6. Re-evaluate the 1.613 creature collision scale and emitted Skull II pursuit against the intended difficulty. Preserve the new art while treating these as independent gameplay decisions.
7. Add ground-origin shooting/pulse fixtures and persistent crowded-spawn tests, then version any resulting combat changes for replay compatibility.

Slowing every spawn or increasing weapon damage first would mask several independent problems and make the results harder to assess. The measured targeting, collision, and placement issues should be addressed before a broad difficulty retune.

## Reproduce

From the repository root with dependencies installed:

```sh
npx tsx tools/audit-combat-balance.ts > artifacts/balance-audit/measurements.json
npx tsx tools/audit-target-access.ts > artifacts/balance-audit/target-access.json
```

With the local Vite server running at `http://127.0.0.1:5173` and Google Chrome installed:

```sh
node tools/audit-remake-colliders.mjs
```
