# Balance corrections — 20 October 2026

The corrections are implemented in the local game. The new artwork remains in use. Encounter order, spawn times, enemy HP, gem rewards, weapon damage and the compensated primary/shotgun pellet budgets remain unchanged.

## Gameplay corrections

- New towers anchor to their actual terrain rather than adding a tall structure on top of an old floating creature origin. Their rigs use the arena's .62 scale, and their crystals regain the earlier world-space hit tolerance. Visible crown jewels retain their original authored proportions independently of that forgiving hit sphere. Representative mature crowns are approximately 3.8, 5.6 and 8.1 units high rather than 11.2, 17.0 and 17.5. Attached skull outlets, foundations, shot collision, player contact columns and crystal rendering use the corrected transforms.
- Hand-II ground pulses again deal five damage to all three representative tower tiers. The pulse uses physical crystal radii consistently for horizontal and vertical reach.
- Spider and pede bodies return to their earlier proportions. Pede contact offsets/radii and projectile target sizes follow the scaled rigs; segment positions remain independent world coordinates. Spider entrance lift also scales with its legs, preventing floating spiders. Spider crystal hit radii double relative to the unfixed remake, restoring the previous target tolerance.
- Tower separation now stops inward motion at occupied space. It sweeps each requested movement, stays on the original spawn ray, never pushes another tower outward, and never accumulates stopped travel for a later jump. Historical recordings retain the original pushing solver.
- Tower-emitted Skull II returns to wandering target selection. Other skull tiers retain their pursuit behavior and the visible crown launch path.
- Homing chooses a reachable living crystal from the projectile's actual position, checking terrain and intervening armor. An obscured first crystal no longer prevents shots from targeting an exposed alternative.
- Leviathan and thorn projectile armor is baked from the actual remake meshes. The Leviathan collider reproduces its body shader's wing displacement with conservative animated BVH bounds. Legacy baked colliders remain available for previous recordings.

## Compatibility

New solo recordings explicitly save `balanceFixes`; new crew checkpoints save their balance rules. Missing metadata retains historical behavior. An enemy rule marker survives full/delta co-op snapshots and death-analysis playback, keeping guest collision targets and rendered rigs consistent. Network protocol 22 prevents a corrected host from mixing gameplay with an older guest build.

Three compressed solo fixtures and one crew fixture were captured before the gameplay edits. Solo outcomes and backward seeks are checked against those recordings, and the crew fixture checks the exact original checkpoint digests. See `tests/fixtures/before-balance.md` for their provenance.

## Verification

- The full automated suite and TypeScript/production build are recorded in `unit-tests.log` and `build.log`.
- `npm run test:balance` runs the dedicated gameplay regressions, real-renderer rig/target alignment check, and browser armor raycasts. Results are in `balance-validation.log`, `render-alignment.json` and `collider-alignment.json`.
- The armor comparison covers **8,064 rays**, including three animated Leviathan poses: **zero invisible armor hits, zero missing armor hits, and zero impact-distance mismatches above 0.001 units** in the sampled poses.
- Real-renderer checks confirm crystal centers and independently positioned pede segment crystals match their gameplay targets. Tower jewels use compact visual radii of 0.434/0.496/0.558 world units while retaining a 1.016-unit aiming radius; spider and pede gem radii continue to match their targets. `gameplay.png` captures the corrected scene.
- Ground-origin primary fire destroys all crystals on each tower tier. Upgrade-pulse and twenty-shot homing fixtures exercise the actual projectile/damage paths.
- A five-minute persistent tower-backlog fixture retains all 38 scheduled towers and checks that every tower stays on its spawn ray without outward displacement.
- The two pre-existing suite failures are corrected in test fixtures: the environment comparison accounts for the approved Cathedral mist revision, and the local SQL fixture includes the production service role and current registered-run restriction. No production database, migration, leaderboard or authentication settings were changed.

These are automated correctness and controlled gameplay checks, not a claim that every player will reach a specific survival time. The fixes are local; no deployment was performed. Start a fresh run in the updated build to use the corrected rules.
