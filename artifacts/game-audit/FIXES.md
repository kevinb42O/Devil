# Audit fixes — 13 October 2026

All five confirmed findings in `AUDIT.md` are fixed and covered by regressions. Existing unrelated working-tree changes were preserved.

| Finding | Corrected behavior | Verification |
| --- | --- | --- |
| Crew-wipe crash | Enemy targeting stops when there are no survivors. Current and legacy centipede updates also guard empty player lists. The final-player death completes the transition to `CREW LOST`; later ticks do not advance the clock. | Unit regression with one player and a four-member crew with one survivor |
| Frozen tower animation | Animated tower parts refresh their local matrices after opening/closing movement. | Browser regression checks open and closed world transforms for all three tower tiers |
| Missed floor ricochets | Downward sweeps split at tile boundaries and find the earliest floor contact. Enemy hits earlier on the same path still win. Nonexistent floor tiles do not produce contacts. | Actual-terrain regressions for higher-to-lower and lower-to-higher paths, plus enemy/floor ordering |
| Remote death clears local audio | A teammate's death plays a positional cue without clearing the surviving player's sounds. Local death and crew wipe still clear audio. Death events carry their cause so a remote fall remains identifiable before its snapshot arrives. | Unit ownership/cause checks and a real browser audio regression retaining both a local stream and one-shot voice |
| Wrong pede leg textures | Species materials are assigned before leg meshes are merged. | Browser regression checks all three leg materials for Centipede, Gigapede and Ghostpede |

New recordings use combat revision **10**. Recordings from revision 9 and earlier retain the previous endpoint floor-collision behavior, so this fix does not silently change their trajectories. The replay file format remains version 6.

The corrected ricochets slightly increased traffic in the existing four-shooter bandwidth fixture. Removing a redundant empty effects field from snapshots keeps it within its existing 100 KB/s limit: approximately **99.8 KB/s per guest including repair packets**. Actual effects continue to use the reliable event channel; decoded snapshots still expose an empty effects array.

The controller and production smoke tests now finish the entrance before asserting combat behavior. Audio/projectile browser scripts honor `GAME_URL`, and the projectile renderer runs on an isolated blank page. The audio inactivity fixture now actually buries the body instead of expecting a tower's synthetic status alone to disable contact.

## Final verification

- `npm test`: **180 passed, zero failed**.
- `npm run build`: passed; the existing large-bundle warning remains.
- `git diff --check`: passed.
- Tower and species-material browser regressions: passed.
- Audio browser: passed, including decoding all 275 original WAVs and preserving surviving players' voices on remote death.
- Controller and controller edge browser checks: passed.
- Production startup, entrance and gameplay smoke: passed.
- Single-player browser smoke: passed through movement, jump, firing, pause, settings, death, retry and persistence.
- Mobile controls and mobile death browser checks: passed.
- Projectile browser: passed 396 muzzle checks and the 6,000-dagger rendering fixture.
- Local WebRTC transport: passed guest input, 2,000-projectile fragmented snapshots, restart epochs, quick taps and disconnect.
- **Four-player public lobby: passed**, including discovery, all three guest joins, readiness/unready, simultaneous start, guest movement/fire and disconnect. The previous audit timeout did not recur on the final check.

Logs are saved in `fixes/`. Original audit results remain in `reproductions.json` and `render-reproductions.json`; corrected results are in `fixed-reproductions.json` and `fixed-render-reproductions.json`.

The reproduction scripts now assert corrected behavior. The permanent regressions are `tests/game-audit.test.ts`, `tests/game-audit-browser.mjs`, and the added remote-death checks in `tests/audio-browser.mjs`. Run the rendering regressions with `npm run test:audit-rendering` while Vite is running.
