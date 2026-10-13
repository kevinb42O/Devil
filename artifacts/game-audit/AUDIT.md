# Full game audit — 13 October 2026

**Follow-up status: all five confirmed bugs have been fixed.** See [FIXES.md](FIXES.md) for the changes and passing regressions. The original audit below is retained as the before-fix record.

Reviewed the current working tree, including uncommitted changes. Git HEAD was `75804af`. Other work changed spawn rules and tests during the audit; the first unit run passed 168 tests and the final run passed 173. Browser checks were moved to an isolated temporary copy to avoid hot reload interruptions. No game source, database, or service configuration was changed by this audit. Audit scripts and results are in this directory; existing browser scripts also regenerate screenshots in `artifacts/`.

Five confirmed bugs: one P1, three P2, and one P3. P1 means a game-blocking failure; P2 means incorrect gameplay, feedback, or a missing telegraph; P3 means a cosmetic defect.

## 1. P1 — A crew wipe can crash the game before the death screen

**Location:** `src/centipede-motion.ts:128–129`, called by `World.updatePede` and `World.updateEnemies` in `src/simulation.ts`.

Enemy updates continue after an earlier enemy kills the final living crew member. The subsequent centipede receives `players: []`. Its nearest-player reduction returns `undefined`, and accessing `nearest.x` throws. `stepCrew` never reaches its final transition to `dead`. The exception propagates out of the frame function, before its next `requestAnimationFrame` call.

**Reproduction:** a one-member crew, an active skull overlapping the player, and a hunting centipede later in the enemy array. One `stepCrew` call throws `TypeError: Cannot read properties of undefined (reading 'x')`, leaving the player dead but the world state `playing`. This also applies when a larger crew has only one survivor.

**Fix direction:** stop advancing targeting AI once the crew has no survivors, and guard the centipede's empty player list. Add a regression covering final-player death earlier in the same enemy-update loop, rather than starting the tick with everyone already dead.

## 2. P2 — Tower opening and closing animations never reach the rendered mesh

**Location:** `src/original-enemies.ts:70–71` and `:172`.

Asset preparation disables `matrixAutoUpdate` for the tower crest, jaws, and teeth. `animate()` changes their `position.y` to show the spawning pulse, but never updates their local matrices. Even a subsequent `updateMatrixWorld(true)` uses the stale local matrix. The towers eject their enemies without the intended opening/closing telegraph.

**Browser reproduction:** animate a Squid I at age 3. The crest's position becomes `0.4`, but its local matrix translation and world Y remain `0`, with automatic matrix updates disabled.

**Fix direction:** retain automatic matrix updates on animated tower parts or call `updateMatrix()` after changing their positions. Verify rendered transforms; the current tower pulse unit test only tests the pulse calculation.

## 3. P2 — Projectile floor sweeps miss ricochets at tile boundaries

**Location:** `src/simulation.ts:516–521`.

Floor collision samples only the height at the projectile's endpoint and treats it as the height for the entire swept path. A downward projectile can cross the game's floor collision plane over a higher tile, then finish over a lower tile. The endpoint test reports no collision, so the earlier required ricochet is skipped. The reverse direction can also place a contact using a height from a different tile.

**Reproduction on actual terrain:** tiles `(20,23)` and `(21,23)` have heights `0.0344437079` and `0.0203615890`. Launch from 0.55 m before their boundary with Y equal to the higher floor plus the game's 0.08 m clearance plus 0.0001 m, and velocity `(70,-0.1,0)`. The projectile crosses that clearance plane at X `-11.64`, before the tile boundary at `-11.16`. The step ends over the lower tile and emits no ricochet; `floorBounces` remains zero.

**Fix direction:** split the sweep at tile boundaries and find the earliest valid floor contact within each interval. The blood collision implementation already follows that approach. Check floor contacts against enemy contacts using the same normalized sweep time.

## 4. P2 — Another crew member's death clears the surviving player's audio

**Location:** `src/audio.ts:117–119`, with unfiltered crew effects consumed in `src/main.ts`.

Every death effect calls `Sound.clear()` without checking `shooterId` against the local player. A remote death stops all weapon loops, enemy loops, and active one-shot cues on the surviving player's client, then plays the death cue without a positional source. Loops can restart on the next update, but interrupted one-shot sounds are lost. This also gives the surviving player the global death cue when only their teammate died.

**Reproduction:** select the living host in a two-member world and deliver a death effect with `shooterId: 'guest'`. `Sound.clear()` is called once while the host remains alive. The runnable check instruments the clear call; the observed interruption follows from its implementation stopping all loop and one-shot voices.

**Fix direction:** reserve full audio clearing for the local player's death or the end of the run. Handle remote deaths as positional events. For falling crew members, use the relevant crew member's cause instead of the world's collective cause.

## 5. P3 — Gigapede and Ghostpede legs use ordinary centipede textures

**Location:** `src/original-enemies.ts:154–156`.

The segment builder merges leg meshes into new unnamed meshes before performing the species material replacement. The replacement checks names beginning with `pedeleg`, so it matches none of the merged meshes. Bodies use the correct species texture, but all three leg groups retain the normal centipede materials.

**Browser reproduction:** both Gigapede and Ghostpede segment rigs contain `pedeleg1.png`, `pedeleg2.png`, and `pedeleg3.png`; their bodies correctly use `pedeblackbody.png` and `ultrapedebody.png` respectively.

**Fix direction:** choose the species leg material before grouping/merging, or preserve an explicit material-to-species mapping when building each merged mesh.

## Verification and coverage

Source review covered the simulation, terrain and spawn rules, all enemy families, projectile and armor collision, weapons and progression, input and mobile controls, menu/pause/death transitions, replay recording and seeking, death analysis, rendering and resource handling, lighting and blood, audio/music, multiplayer prediction/reconciliation/transport/discovery, local storage, score queuing, leaderboard client and SQL migrations, and the production asset/server path.

| Check | Result |
| --- | --- |
| Latest `npm test` | 173/173 passed |
| Latest `npm run build` | Passed; large-bundle warning remains |
| `npm audit --json` | Zero reported advisories |
| Single-player browser smoke | Passed: entrance, movement, jump, firing, pause, settings, death, retry, persistence |
| Mobile browser | Passed in isolated copy; an earlier concurrent run failed a timing assertion |
| Mobile death browser | Passed: missing Pointer Lock API, both orientations, touch cleanup, death/retry/home/pause/blur |
| Preferences browser | Passed: settings and nicknames survive reload and full browser restart, including legacy nickname storage |
| Audio browser | Adapted isolated fixture passed: all 275 WAVs decoded, streams/bursts/homing, mixer state and audibility; original fixture incorrectly expects a tower's synthetic `burrowing` status alone to make it inactive |
| Projectile browser | Adapted isolated fixture passed: 396 muzzle projection checks, interpolated transforms, 6,000 rendered daggers, reverse/zero-velocity orientation, capacity growth and empty-upload behavior |
| Death-analysis browser | Passed: killer/fall playback, pause, impact, skip/retry, final stats isolation |
| Standard controller browser | Original fails because it fires while still on the entrance; adapted temporary copy that enters the arena passed |
| Controller edge browser | Original fails its homing assertion while on the entrance; adapted temporary copy passed on retry; one earlier short-delay assertion was intermittent |
| Production browser | Original times out waiting for the combat HUD while on the entrance; adapted temporary copy that walks into the arena passed |
| Local WebRTC transport | Passed: guest input, 2,000-projectile fragmented snapshots, crew state, epoch restart, quick tap, disconnect |
| Four-player public lobby | Incomplete: isolated run timed out joining the third guest; the earlier live-tree run was interrupted by hot reload |
| Startup/render budget | Passed: ready in 782 ms, first frame after Start in 28.1 ms, drawing buffer below 1.6 million pixels, adaptive resolution decreased and recovered |
| Targeted bug reproductions | All five reproduced; machine-readable results saved alongside this report |

The death-history benchmark retained clips for 300 and 1,000 enemies within its 16 MiB cap. At 1,000 enemies it reduced sampling to 15 Hz and measured capture P95 at approximately 0.6 ms in this environment. These are headless-browser measurements, not a claim about real-device endgame frame rates. The startup test's stall check occurred on the entrance, so it does not establish dense-combat stall behavior.

## Test gaps and limits

- Update `tests/controls-browser.mjs`, `tests/controls-edge-browser.mjs`, and `tests/production-browser.mjs` to finish the entrance before making combat assertions. Tests that currently fail for this reason cannot detect actual combat regressions reliably.
- `tests/audio-browser.mjs` and `tests/projectile-browser.mjs` hardcode port 5173 and ignore `GAME_URL`, which defeats isolation. The projectile fixture was moved to a blank page in the temporary copy to avoid both the normal game's render loop and external font-path restrictions caused by the temporary dependency symlink. The audio inactivity fixture was updated only in the temporary copy to actually bury the body, rather than only assigning a status to a tower.
- Replay compatibility tests often generate their expected recordings with the same current implementation used for playback. Keep fixed recordings from earlier revisions to detect unintended historical changes.
- The temporary copy's full unit run was not a valid final baseline: it omitted importer fixtures/tools and caught spawn-rule/test edits mid-change. The final complete workspace run passed all 173 tests; transient copy failures were excluded from the bug list.
- Public internet multiplayer, TURN-dependent networks, broker failover interoperability, and long sessions on real mobile hardware remain unverified. The third-guest timeout does not by itself prove a code defect.
- The leaderboard SQL review found bounded arguments, authenticated score submission, restricted table access, and ownership checks for personal lookup. No live score submissions or database mutations were performed. Deployed schema/auth configuration was not independently verified.
- The leaderboard trusts client-reported results and case-insensitive nicknames. Forged scores and nickname impersonation remain the documented design limitations in `LEADERBOARD.md`, rather than newly discovered bugs. Local eligibility checks do not provide server verification.
- The current production bundle is roughly 3.56 MB before compression. The build warning and headless startup result do not establish acceptable loading or endgame performance on slower devices.

## Runnable evidence

From the project root:

```sh
node --import tsx artifacts/game-audit/reproduce.mjs
# With the Vite development server running:
GAME_URL=http://127.0.0.1:5173 node artifacts/game-audit/render-reproduce.mjs
```

The scripts have now been converted to assert the corrected behavior. The original before-fix JSON evidence is retained, with corrected results saved separately. They do not submit scores or modify the database.
