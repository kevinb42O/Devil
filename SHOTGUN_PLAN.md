# Shotgun redesign

Status: implemented, 15 October 2026. Combat revision 19; network protocol 10.

## Implemented tuning and measured results

The final central packet contains 80% of pellets. Its half-angle is 50% of the
outer angle, capped at 0.14 radians so the last upgrade adds useful concentrated
damage. The remaining 20% fill the broad outer cone. All hands launch within
1 cm of their central socket. Ordinary pellets deal two damage; seeking pellets
retain their existing homing damage. Pellets use dedicated faceted geometry and
copper / gold / crimson / hot pink styles, each with a seeking accent. Beam colors and trajectories remain intact.

The regression probe now samples three seeds and 360 blasts per hand/distance:

| Hand | Contacts at 3 m | Contacts at 5 m | Mean damage at 5 m |
| --- | ---: | ---: | ---: |
| I | 100% | 91.5% | 18.29 |
| II | 99.0% | 87.6% | 35.04 |
| III | 93.2% | 81.8% | 65.46 |
| IV | 88.7% | 71.4% | 85.64 |

At 25 m, the beam wins the measured sustained single-target damage comparison
for all hands. This probe isolates trajectories against a centered stationary
sphere with radius 0.65 m; it is not a universal moving-enemy hit-rate claim.

`npm run test:shotgun` covers geometry, damage, real target contacts, unchanged
beam launches/RNG, sparse network salvos, and old/new solo and crew replay seeks,
plus low/high-quality browser renders and compact projected origins. Browser
results and images are in `artifacts/shotgun/`.

The new database migration keeps revision-18 scores/replays and gives revision-19
crew runs their own rankings. It must accompany deployment of this game build.

Verified: all nine shotgun unit checks; real close-target/crystal/armor contacts;
old/new solo and crew replay playback and seeking; low/high-quality shotgun
browser renders; 396 existing FOV/socket cases; projectile muzzle, impact and
6,000-projectile lighting checks; local crew ranking SQL; TypeScript; and the
complete production bundle, assets and PWA manifest in an isolated output folder.
The broad unit run exposed two assertions for the old muzzle/replay revision and
one CPU-dependent queue fixture; these were corrected and verified by targeted
rechecks. All nine shotgun tests passed in that run. The remaining long
spawn-schedule stress trace was stopped after more than ten minutes, so a full
unit-suite pass is not claimed.

The ordinary `dist` directory was being used by another build, so verification
used `/tmp/abyss-shotgun-production` with the same build and asset/PWA steps.

The sections below retain the design rationale; the final tuning above supersedes
the initial 70% / 55% spread proposal.

## Intended result

A tap releases a compact, forceful packet of hot pellets from the hand. Aimed
shots concentrate damage at 2–5 metres. The packet opens naturally into a broad
scatter at distance. The beam retains its existing colors, geometry, launch,
damage, cadence, and upgrade behavior.

## What the current code actually does

`World.shoot` emits 10/20/40/60 ordinary primary daggers for hands I–IV. Each
deals one damage, travels at 70 metres/second, and uses the same appearance as a
beam dagger. Burst spread is ±0.17/0.21/0.26/0.32 radians on each of two axes.
This samples a square rather than a circular shotgun pattern; its diagonal
pellets are substantially farther from the aiming line.

Bursts have no added launch disc, but use all hand sockets. The maximum socket
separation is approximately 0/2/3.2/17.7 centimetres. Hand IV is therefore the
main case where shrinking the physical starting footprint will matter. For the
other hands, angular distribution and damage are the larger problems.

A read-only trajectory probe used the existing simulation, seed 71, 1,000
bursts per hand and distance, a stationary centered sphere of radius 0.65 m,
and swept ray/sphere contacts. This isolates spread; it does not measure combat
against moving enemies, armor, or individual crystals.

| Hand | Pellets hitting at 2 m | At 3 m | At 5 m | At 10 m | At 25 m |
| --- | ---: | ---: | ---: | ---: | ---: |
| I | 100% | 96% | 46% | 11% | 1.8% |
| II | 99% | 78% | 30% | 7% | 1.2% |
| III | 90% | 52% | 19% | 5% | 0.9% |
| IV | 71% | 35% | 13% | 3% | 0.6% |

At 5 m the last two hands each land about 7.7 pellets despite hand IV firing
20 more. At 3 m both land about 20.8. This is a concrete upgrade problem.

Tap fire happens on release, with a 0.5-second recovery; holding transitions
to stream after 16 ticks. Preserve these controls in the first implementation
so a spread/damage improvement can be evaluated independently.

## Physical launch and spread

1. Add an explicit projectile kind (`stream` or `shotgun`) and a shotgun launch
   pattern. Do not infer kind from pellet count, age, energy, or surviving shots.
2. Anchor the shotgun to the central firing socket, with a 1 cm launch radius
   at every hand level. Keep the existing eye-to-crosshair convergence and
   obstruction checks. Use the same anchor for the visible pellet packet and
   its glow; do not let the renderer fan it back out to every fingertip.
3. Use a circular pattern in the aim-perpendicular plane, preserving the same
   footprint when aiming level, upward, or straight down.
4. Put 70% of pellets in a central cone whose half-angle is 55% of the current
   burst half-angle. Put the remaining 30% throughout the full outer cone.
   Preserve current axial outer angles: 0.17/0.21/0.26/0.32 radians.
   Use stratified angular/radial samples with seeded rotation and bounded
   jitter, avoiding random empty centers and visible fixed spokes. No pellet
   receives a permanently exact crosshair trajectory.
5. Pellets travel along straight paths. A small origin plus angular divergence
   provides the requested near-to-far expansion. Do not introduce a delayed
   sideways acceleration or a target-dependent spread reduction.

For hand IV, the initial radius is 0.01 m; the central cone half-angle is
0.176 radians and the outer half-angle stays 0.32. In a muzzle-centered plane,
their approximate radii are 0.54/1.00 m at 3 m, 0.90/1.67 m at 5 m, and
4.46/8.29 m at 25 m. These are geometric envelopes, not predicted hit rates.
The square's extreme diagonal corners are intentionally removed.

Keep physical launch offsets within the 1 cm disc. Stratification needs the
original total pellet count in the immutable launch description: reconstructing
it from surviving pellet indices would change a partly consumed shot.

## Damage and balance

Initial tuning candidate: two damage per ordinary shotgun pellet, retaining
10/20/40/60 pellets. Maximum direct blast damage becomes 20/40/80/120. Treat
this as a candidate to validate, not a claimed final balance result.

The shotgun currently sacrifices sustained fire and accuracy without adding
individual pellet damage. Two damage gives it a clear close-range role. At
long distance, ordinary geometric dilution still reduces damage delivered to
one target. Start without an additional distance-based damage rule; compare
effective damage against the beam before deciding whether one is necessary.

Use a separate damage field or kind-based rule; current primary damage is
hardcoded to one, and `energy` belongs to existing homing behavior. Armor,
crystal exposure, and swept collision rules still apply. Test actual per-crystal
health rather than treating total tower HP as a single damageable body.

Keep homing damage, reserve costs, speed, seeking, and final-hand explosions.
Homing tap shots receive the shotgun identity and compact launch pattern, with
a distinguishable seeking accent; they do not inherit the two-damage primary
rule. Preserve shotgun jumping, floor rebound, and gem push.

## Visual and sound identity

- Use compact faceted pellets or short pointed shards, visibly shorter than
  beam daggers. Give them a bright core and restrained red-orange shell.
- Give each hand a distinct hot shotgun color: copper, gold, crimson, then hot
  pink, with a related seeking accent for each hand. Choose final linear RGB values in
  rendered gameplay, checking separation from orange gems, blood, and scenery.
- Apply the same shotgun palette to physical pellets, glow, floor spill,
  launch sparks, and ricochet/armor sparks. Keep blood's existing appearance.
- Preserve every entry in `PROJECTILE_COLORS` and existing beam material paths.
  Add dedicated shotgun styles rather than recoloring shared beam emitters.
- Keep the aiming line readable: one compact flash, brief sparks, no large
  opaque flame sheet. Check pellet visibility inside the current hand-clearance
  region; excessive suppression could hide the useful close-range packet.
- Retain existing burst audio and bounded recoil initially. Evaluate their
  synchronization with the stronger blast before changing sound or camera kick.

Use instanced pellet geometry and the existing batched glow/field. No lights or
individual meshes per pellet. The visual shape does not enlarge collision.

## Implementation sequence and integration

1. Add isolated shotgun tuning, projectile identity, damage, and a deterministic
   launch pattern in `weapon-tuning.ts`, `simulation.ts`, and
   `projectile-launch.ts`; retain the legacy burst path for saved runs.
2. Carry kind, launch-pattern version, and original pellet count through compact
   shot descriptions, explicit projectile updates, baselines, prediction,
   reconciliation, snapshots, and crew checkpoints. Update decoder bounds and
   bump the network protocol when the format changes. Cover sparse survivors,
   homing, bounced shots, and late-joining clients.
3. Advance the combat revision from 18 and retain revision-18 simulation for
   saved solo and crew replays, including replay seek/checkpoint restoration.
   Audit revision validators and replay export/import rather than changing only
   the recorder constant. Preserve historical RNG consumption in the old path.
4. Add pellet instances and shared style selection in
   `projectile-presentation.ts`, `original-weapon.ts`, and
   `projectile-lighting.ts`. Propagate identity to relevant impact effects.
   Update local socket projection to support the compact shotgun anchor across
   FOV, aspect ratio, recoil, and movement.
5. Compare baseline and candidate in the same deterministic scenarios, tune
   concentration first, then damage, then presentation. Record final numbers
   and screenshots instead of approving the change from a static muzzle image.

## Acceptance criteria

The following are goals to verify, not results already obtained:

- All physical launches stay within 1 cm of the central shotgun anchor.
- Against the probe's 0.65 m radius target, each hand averages at least 85%
  pellet contacts at 3 m and 45% at 5 m over multiple seeds. Effective damage
  increases with every hand upgrade at both distances.
- At 25 m, the pattern retains its intended broad envelope and the beam beats
  repeated ordinary shotgun taps in sustained single-target damage at each
  hand level. Measure with actual input cadence, not just blast damage.
- Aimed close blasts reliably kill appropriate small threats; armor blocks
  them correctly, and elevated crystal targets reward accurate aim. Compare
  moving skulls, exposed spider gems, tower crystals, and centipede segments.
- Stream colors and trajectories remain identical for the same input and seed.
- Host and predicted launches match; pellet kind and appearance survive both
  compressed shots and explicit updates, including post-bounce corrections.
- Old replay final states remain unchanged; new solo/crew recordings match
  direct play and remain correct through pause, seek, and import/export.
- Low/high quality, narrow/wide FOV, portrait/landscape, and steep aim show a
  compact visible packet and readable targets. Shotgun identity must remain
  clear without relying only on hue.
- Dense crew shotgun fire stays within the existing pooling and performance
  budget, with only bounded additional style batches.

Run focused launch/damage/network/replay tests, existing projectile movement,
collision, muzzle, FOV, lighting, and camera-feedback browser checks, followed
by the complete unit suite and production build. Perform a short gameplay pass
to judge whether the measured close-range improvement feels decisive.
