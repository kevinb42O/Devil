# Combat hands — first remake milestone

17 October 2026. Based on GitHub `f9abc5b` after pulling 13 commits from `origin/main`. Changes are local; no commit, push, or deployment was made.

- First-person combat uses the existing Quaternius CC0 Demon rig from the multiplayer prelobby. The extracted hand models and skins are no longer requested.
- Left/right/both gestures work in combat. Keyboard: Q/E (QWERTY), A/E (AZERTY). Controller: LB/RB (L1/R1), preserving the latest courtyard controls. Mobile: LEFT HAND / RIGHT HAND hold controls.
- Network snapshots, interpolated remote poses, and solo/team replay encoding preserve gesture flags. Gestures do not modify movement or projectile gameplay.
- New upstream basketball/pencil poses, hand recoil calculations, projectile behavior, and solo upgrade timing were retained through the merge.
- Existing unrelated guest-performance work was preserved and reconciled with upstream's owner-based projectile prediction and drawing baseline data. The full pre-pull working state remains in the stash named `Preserve local work before upstream sync 2026-10-17 combat hands`.

Validation:

- `npm test`: 550 passing, zero failures.
- `npm run build`: passes; Vite reports the existing large-bundle warning.
- `node tests/combat-hands-browser.mjs`: 84 tier/FOV/pitch combinations, first-person visibility lifecycle, all four control schemes, and 42 projectile comparisons against pinned commit `f9abc5b`. Maximum difference in projected sockets and rendered projectile transforms: zero. No original hand asset requests before loading the comparison fixture; no page errors.
- `node tests/courtyard-emotes-browser.mjs`: passes, including current controller shoulder bindings and courtyard neck/shoulder regressions.
- `node tests/crew-demon-browser.mjs`: passes for teammate aiming, shared geometry, independent rigs, muzzle placement, replay bodies, and death ghosts.
- `node tests/projectile-muzzle-browser.mjs`: passes, including visible flight, hidden overlapping launch meshes/halos, and retained recoil calculations.
- `npx tsx --test tests/courtyard-emotes.test.ts tests/combat-gestures.test.ts`: five passing after the final control-fixture update.

Images: `tier-1.png`, `tier-5.png`, and `gestures.png`. Machine-readable browser results: `report.json`.

Pending: enemy/environment/effect asset replacements and the complete audio migration described in `FREE_ASSET_REMAKE_PLAN.md`. Original asset packaging is still present until those migrations are complete.
