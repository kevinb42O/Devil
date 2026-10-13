# ABYSS / DAGGERS

A playable first build for the Devil Daggers V2 project. Independent of Sorath and its games. The working game title is **ABYSS / DAGGERS**.

This build establishes an arena combat loop and a visual direction. It is not a complete recreation or a certified match to the original physics or Survival spawnset.

The current user target is a **full replica of original Devil Daggers v3.2 Survival**. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) describes the current port and remaining measurement work. [DEVIL_DAGGERS_REPLICA_AUDIT.md](DEVIL_DAGGERS_REPLICA_AUDIT.md) preserves the research audit from before this implementation pass.

The runtime now uses the recovered Survival timeline and arena height field, implements all 22 enemy entries, and includes practice starts, local replays and original audio. Exact native physics, AI, animation and presentation parity remain unfinished.

## Run

Requires Node.js 20.19+ or 22.12+ and a desktop browser with WebGL2.

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Click **Enter the abyss** to capture the mouse. Headphones help with positional cues.

```sh
npm test           # Deterministic simulation and combat checks
npm run build     # Type check, build, and package used assets
npm run preview   # Play the production build
npm run test:browser # With the dev server running
npm run test:replica # Practice, replays, new encounters and original audio
npm run test:enemies # All 22 rendering families
```

The browser smoke uses installed Chrome on macOS, `CHROME_PATH` if supplied, or Playwright's Chromium. Install the latter with `npx playwright install chromium` if needed. The smoke runs against the development build because its diagnostics are intentionally absent from production.

## Controls

| Input | Action |
| --- | --- |
| WASD | Move and air-strafe |
| Mouse | Look |
| Space | Jump; release and press again to hop |
| Left mouse, tap | Release a spread of daggers |
| Left mouse, hold | Stream daggers |
| Right mouse | Spend homing reserve after attunement III |
| Floor-directed burst | Dagger jump |
| Release both fire buttons | Automatically attract gems |
| Escape | Pause and release the mouse |
| R after death | Retry immediately |

One touch from an active enemy ends the run. Falling also ends it. Gems expire after ten seconds. Player attraction is automatic while both fire buttons are released, stops while either button is held, and also stays off on the tick a tap burst fires. Gems already moving retain their drift during firing; bursts push them away. Large spiders hover outside the arena, raise their heads (three seconds for I, nine for II), steal gems, and eject one egg per consumed gem onto the field. Each egg hatches five spiderlings after ten seconds. Continuous hits keep the head exposed; after a one-second gap it folds down. Travel, attraction strength, and animation curves remain prototype tuning.

Attunement II unlocks at 10 collected gems, III at 70. Gems collected after III become homing reserve. IV requires 150 unspent homing. An earned hand level remains unlocked for the rest of a run. Permanent best time does not change combat power.

## What is built

- Momentum controller with ground friction, air steering, timed hops, gravity, and floor-shot boosts.
- Fixed 120 Hz, seeded simulation independent of presentation.
- Moving daggers, swept collision, burst/stream distinction, bouncing projectiles, and guided homing.
- Four attunements, gem expiry/collection/pushback, and separate collection/reserve accounting.
- All four skull tiers and their transmuted forms; three squid tiers; both spiders/eggs; spiderlings; Centipede, Gigapede, Ghostpede; Leviathan/Orb; Thorns.
- Summoner crystal hit zones and per-segment centipede health and gem rewards.
- Original V3 Survival event ledger, accelerating endless waves with every-third-wave Ghostpede substitution, and reference tile sinking shared with collision.
- Original Devil Daggers meshes and textures for all 22 implemented enemy kinds/states, the arena tiles, gems, four hands, daggers, and weapon effects in the local build.
- Procedural abyss sky with drifting cloud bands, sparse stars, an eclipsed moon, and a dark combat horizon.
- Original weapon/enemy/event audio, persistent positional enemy voices and cardinal ambience, optional directional threat markers, and readable gem collection status.
- Start, pause, settings, death summary, instant retry, best-time persistence, practice starts, and replay history/keep/export/seek/top-down playback.

## Architecture

- `src/simulation.ts`: state, tuning, timeline, movement, attacks, collision, enemies, resources. No rendering or browser imports.
- `src/renderer.ts`: Three.js presentation, instanced arena/projectiles/gems, bounded particles, and bloom.
- `src/original-enemies.ts`: original creature asset loading, modular rigs, tentacle deformation, and head/weakpoint animation.
- `src/enemy-presentation.ts`: shared model coordinates and damage-target transforms.
- `src/original-weapon.ts`: original hand selection, textures, viewmodel pass, dagger batches, and mesh-based effects.
- `src/audio.ts`: original WAV recordings, per-enemy voices, positional ambience and tuned voice priority.
- `src/arena.ts` and `src/survival.ts`: reference terrain and infinite spawn schedule.
- `src/replay.ts`: deterministic input recording/playback and IndexedDB run history.
- `src/main.ts`: mouse/keyboard input, fixed-step accumulator, UI, pause lifecycle, settings, and storage.
- `tests/simulation.test.ts`: behavioral tests, including collisions, resource tradeoffs, progression, and reproducibility.
- `tests/browser.mjs`: real-browser end-to-end smoke.

High quality uses bloom and up to 2× pixel density; low uses native density and disables bloom. The 120 Hz simulation is an implementation choice, **not a verified 120 FPS performance claim**. Hardware benchmarking and dense endgame profiling remain to be done. The frame loop retains elapsed simulation time and processes up to 240 steps per frame to catch up after stalls; visual effects use a separately bounded delta. Native replay compatibility and external score verification remain separate work.

## Practice and replays

Expand **Practice an encounter** on the menu to choose a start time, hand and homing reserve. Start at 229 for the six-squid wave, 259 for the Gigapede trio, 350 for Leviathan, or 442 for Ghostpede. Earlier enemies are not carried into a practice start. Practice records stay separate from standard Survival best times.

After death, **Watch this run** opens playback. Use the slider or Left/Right arrows to seek ±3 seconds (Ctrl gives ±10); M toggles top-down view. **Run history & replays** retains ten recent runs. **Keep** retains a run longer and **Export** downloads the port's JSON replay. Replay files are versioned for this implementation, not native Devil Daggers replays.

## Next work

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the complete remaining scope: measured movement/AI/collision, native presentation/lobby/death/upgrade behavior, precise homing and audio calibration, independent rankings and dense endgame profiling.

## Assets and licenses

The local runtime now uses original Devil Daggers sound recordings. Selected Kenney CC0 candidates remain in the source preparation history. The local arena, enemies, and weapon presentation use original Devil Daggers assets; acquisition, mapping, and port limitations are documented in [ORIGINAL_WEAPON_ASSETS.md](ORIGINAL_WEAPON_ASSETS.md) and [ORIGINAL_ENEMY_ASSETS.md](ORIGINAL_ENEMY_ASSETS.md). The prepared Poly Haven floor remains a fallback during asset loading. Quaternius models and pending download-gated assets are not used by this build. Barlow Condensed and DM Sans fonts are bundled under their SIL Open Font Licenses through Fontsource. Build packaging includes license files in `dist/assets/licenses/` and only the selected audio and three required material maps; source archives and provenance pages stay out of the build. The imported original runtime assets are tracked in Git and copied into every production build; those assets are not part of the CC0 set. The build fails if their manifest is missing.

See [ASSET_PREPARATION.md](ASSET_PREPARATION.md) and [ASSET_RESEARCH.md](ASSET_RESEARCH.md) for the asset provenance and provisional sound-role mapping.

## Friends multiplayer

The main menu includes browser-to-browser WebRTC cooperative survival for up to four players. Create a public lobby or join a visible lobby with one click. Every player presses READY, then the host starts the run. Every gem counts for every player. See [MULTIPLAYER.md](MULTIPLAYER.md) for online hosting and validation.
