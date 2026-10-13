# First playable build history — 13 October 2026

For current replica implementation status, see [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). The sections below preserve the earlier prototype history.

The user authorized implementation after the pre-production research, asking for improved graphics and gameplay. The latest request changes the target to a **full replica**. See [DEVIL_DAGGERS_REPLICA_AUDIT.md](DEVIL_DAGGERS_REPLICA_AUDIT.md) for the current audit and priorities; the direction below records the initial prototype choices.

## Product direction

The project is an independent survival arena shooter with working title **ABYSS / DAGGERS**. The first executable build uses TypeScript, Three.js, and Vite in a desktop browser. This makes local playtesting quick while leaving simulation independent of the eventual presentation or packaging technology.

The initial gameplay improvement hypothesis is **better threat information with the same collection pressure**: physical spawn portals, crystal hit confirmation, distinct bone silhouettes, short positional warnings, optional nearby-threat direction markers, and explicit firing/collection state in the HUD. Direction markers can be disabled in settings. These changes require player testing before being described as proven improvements.

No health bar, sprint, automatic resource collection during fire, or automatic hopping was added. The run retains lethal enemy contact and falling, tap/hold attack choice, and collection windows. Motion blur and compulsory camera shake are absent.

## Fidelity versus prototype tuning

The prototype uses the research's 10/70 gem upgrades, 150 reserve threshold, ten-second gem expiry, base enemy health values, three-second summoner offspring delay, twenty-second repeat interval, and 25 three-HP centipede segments. Other behavior remains provisional. The opening schedule is original and explicitly marked in code; it does not claim to reproduce Survival.

Movement dimensions, arena scale, speeds, jump physics, input timing, spread, projectile velocity/bounce, collision radii, resource attraction, spider behavior, and shrink timing are development values. Skull II currently pursues rather than following the reference's random-position movement. Spider I now has a simplified exposure/fold state machine, and Squid II now has independently damaged crystals. Centipede path following is simplified and has no burrow behavior. Homing target exceptions and Level IV splash are not implemented. The replica audit measured regular stream rates of 17.13/34.26/68.52/85.65 daggers per second over 100 seconds, including startup, versus reference rates of 20/40/80/106.666; floating cooldown rounding and the Level IV batch size cause the discrepancy.

Eight simulation entity kinds are included. Higher skull/summoner tiers, transmuted variants, Spider II, Gigapede, Ghostpede, Leviathan, Orb, and Thorn remain future implementation work. This is a first playable foundation, not a full sequel or fidelity certification.

## Technical boundaries

- The seeded simulation advances in 1/120-second steps. Rendering randomness only affects decorative particles and audio pitch.
- Swarm separation uses a local spatial hash. Projectile collision uses swept line/sphere intersections, choosing the first hit along a step.
- Arena, daggers, and gems use instanced rendering. Creature parts are merged by material while leaving movable limbs as separate groups. Centipede segment geometry is reused.
- Projectiles are capped at 2,500, visible gems at 1,200, particles at 1,600, and simultaneous sounds at 28. These caps are prototype safeguards, not a proven endgame budget.
- High/low quality, FOV, mouse sensitivity, volume, and directional cues persist locally. Storage failures do not prevent play.
- Pointer-lock loss, window blur, or a hidden tab pauses the simulation. Death freezes its clock, releases the mouse, and exposes an immediate restart.
- Fonts and used assets are bundled locally; the built game does not depend on remote font services.
- Best time and last-run summary are local only. Input replay recording and online submissions are not implemented.

## Verification

The 13 October replica audit reran the current suite: 23 tests passed, including five asset-format tests and eighteen simulation tests. Coverage includes deterministic stepping, opening timing, burst/stream transitions, swept collision, protected summoner bodies, collection and expiry, reserve-based upgrades, homing expenditure, jumping/falling, contact death, spider head/egg behavior, independent crystals, and segment damage/rewards. These tests validate prototype behavior, not original-game fidelity.

A real Chrome smoke checks initialization, asset loading, pointer lock, movement, jumping, firing, pause-clock freeze, settings, death, retry, and persistence. Production compilation and browser rendering are checked separately. These checks establish technical behavior, not subjective game feel or frame-rate performance on a target machine.

## Original weapon replacement

On 13 October, the user rejected the initial hand and particles and requested the original four hands and weapon effects. The local build now uses the original meshes and textures, replaces point particles with original effect geometry, and includes a resource importer. The imported arm axis was corrected after visual feedback. See [ORIGINAL_WEAPON_ASSETS.md](ORIGINAL_WEAPON_ASSETS.md) for sources, mapping, verification, and remaining renderer/particle differences. The earlier procedural hand description above describes the first build, not the current weapon renderer.

## Gem steering and sky update

On 13 October, player gem attraction was made explicit for both fire buttons and the actual shot tick, including tap bursts fired on release. Idle gems now steer toward a bounded target velocity rather than accumulating acceleration, reducing overshoot while following a moving player. Firing preserves existing drift and burst pushback; contact pickup remains possible. The changed steering strength is prototype tuning. Three regression tests cover both buttons, the burst tick, and following a moving player.

The black background now includes a procedural sky: slowly drifting dark clouds, sparse world-anchored stars, and an eclipsed moon. A camera-centered sphere prevents translational parallax, and the horizon fades to black to preserve enemy contrast. It has no remote texture dependency, scene fog, depth writes, or changes to world lighting. Both high and low quality render the sky.
