# ABYSS / DAGGERS

A playable first build for the Devil Daggers V2 project. Independent of Sorath and its games. The working game title is **ABYSS / DAGGERS**.

This build establishes an arena combat loop and a visual direction. It is not a complete recreation or a certified match to the original physics or Survival spawnset.

The current user target is an **independent arena-survival remake using licensed free models and sounds, retaining the current bullets**. [FREE_ASSET_REMAKE_PLAN.md](FREE_ASSET_REMAKE_PLAN.md) records the migration. The replica documents below describe historical implementation work. [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) describes the current port and remaining measurement work. [DEVIL_DAGGERS_REPLICA_AUDIT.md](DEVIL_DAGGERS_REPLICA_AUDIT.md) preserves the research audit from before this implementation pass.

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

Choose **QWERTY**, **AZERTY**, **Controller**, or **Mobile** in Options. The choice and sensitivity settings are saved on this device. Keyboard movement follows the letters printed on the selected layout.

Options and your nickname are saved automatically in this browser for the current game address and restored after closing and reopening it. A nickname entered with **Play without publishing** is saved too, and editing your co-op name updates the saved nickname. Use the same browser and address each time; a new temporary playtest hostname has separate browser storage. The development server keeps port 5173 fixed instead of silently switching ports.

Controller mode supports controllers with a browser standard mapping (Xbox / PlayStation style). Connect the controller and press a button to detect it; Options shows its connection status. If you start before the browser detects the controller, the pause screen shows connection instructions and the game continues automatically once it is detected. Return waits for detection instead of briefly resuming and pausing again. Unsupported mappings and blocked browser access are explained on the pause screen, where Settings remains available to switch to keyboard controls. Left stick moves, right stick looks, A / Cross jumps, RT / R2 fires, LT / L2 fires homing daggers, and Start / Options pauses or resumes. Use the D-pad to move through menus, left / right to change selected sliders or choices, A / Cross to select, and B / Circle to go back. In crew spectator flight, A / Cross ascends, LB / L1 descends, and pressing the left stick speeds up flight. Controller mode does not require mouse capture. Disconnecting pauses local controls; reconnect, then press Start / Options to resume. Release jump and fire buttons after starting or resuming before pressing them again. Controller menu navigation remains available when a keyboard layout is selected. Controller sensitivity and stick dead zone are adjustable in Options.

In the pregame courtyard and during combat, hold **Q / E** on QWERTY, **A / E** on AZERTY, or **LB / RB** (**L1 / R1**) on a controller to raise the left / right arm diagonally upward, angled outward to clear the head. Both arms can be raised together; release to lower them smoothly. Emotes show the backs of your open hands in first person and present the palms to the crew. The first-person body stays at the player origin, with connected shoulders through the full 75°–145° FOV range. Looking down in the courtyard smoothly leans the camera forward over the chest, then returns it as you look up; this neck motion is disabled during the run. Local jump/run animation is stabilized at the collar so it cannot add a second shoulder lift into the camera; the third-person jump pose is preserved. Neck leaning stops at courtyard walls and climbing ledges. Gesture inputs clear on pause or lost focus. Controller triggers retain their weapon actions during the run. Gestures are visible to teammates and retained in solo and team replay exports.

Mobile mode uses invisible touch areas across the left and right halves of the arena, with no joystick graphics. Small LEFT HAND / RIGHT HAND hold buttons enable combat gestures. Hold and drag on the left to move; a short stationary left tap jumps. Hold and drag on the right to aim and fire the stream; a right tap fires the shotgun burst. Releasing the right thumb stops firing and lets gems approach. Tap the survival timer to pause and open the run options. Each thumb keeps its original side until release, so movement and aiming work simultaneously. Touch devices default to Mobile and low visual quality unless saved preferences override them. Gameplay requests fullscreen landscape where supported; a rotated landscape layout handles browsers without orientation lock. Interrupted touches pause and release both controls. Mobile mode uses the same simulation, replays, and crew input as the other control choices.

| Input | Action |
| --- | --- |
| WASD (QWERTY) / ZQSD (AZERTY) | Move and air-strafe |
| Mouse | Look |
| Space | Jump; release and press again to hop |
| Left mouse | Left hand: tap for a blast, hold for a beam |
| Right mouse | Right hand: tap for a blast, hold for a beam |
| Middle mouse (press scroll wheel) | Spend homing reserve after attunement II |
| Floor-directed burst | Dagger jump |
| Release all fire buttons | Automatically attract gems |
| Escape | Pause and release the mouse |
| R after death | Retry immediately |
| 1–7 / numpad 1–7, inside the solo arena | Select a weapon tier for an unranked test run |

Single-player deaths automatically replay the final five seconds with a smooth third-person camera following the killer, a ghost of your player, and a countdown to impact. The final view holds briefly before results appear. Falling deaths follow your descent. Press **R** or tap **Retry** at any point to start again; **Escape** / **Results** skips playback, and **Space** / **Pause** freezes it. **Watch death** on the results screen plays it again. Co-op uses free-flight spectating and a 15-second teammate respawn countdown; a team wipe ends the run.

One touch from an active enemy ends the run. Falling also ends it. Gems expire after ten seconds. Player attraction is automatic while all fire buttons are released, stops while any fire button is held, and also stays off on the tick a burst fires. Gems already moving retain their drift during firing; bursts push them away. Large spiders hover outside the arena, raise their heads (three seconds for I, nine for II), steal gems, and eject one egg per consumed gem onto the field. Each egg hatches five spiderlings after ten seconds. Continuous hits keep the head exposed; after a one-second gap it folds down. Travel, attraction strength, and animation curves remain prototype tuning.

Attunements II–VII unlock at 10 / 70 / 200 / 350 / 550 / 800 lifetime collected gems. Homing unlocks at II; later gems add reserve independently of upgrade progress. Combat uses the same Quaternius Demon arms/hands as the multiplayer prelobby; V–VII aim both hands. Existing projectile colors, origins and firing rules are retained. At V–VII, left and right mouse buttons fire their respective hands independently; holding both shares the existing total firing budget. Earlier tiers start with the left hand and fire with LMB (RMB also fires the single weapon). Only the firing hand recoils, opens its fingers, glows, and emits muzzle sparks. A short tap fires a shotgun blast on release. Holding starts a clean beam after 133 ms, with no opening shotgun blast. Each hand has its own 500 ms shotgun recovery; the other hand and beam fire remain available. Middle click fires homing daggers. IV’s floor-launch ceiling stays intact. An earned tier remains unlocked for the rest of a run. Practice offers all seven tiers; pressing 1–7 in solo combat makes the run unranked. [HANDS_5_7_PLAN.md](HANDS_5_7_PLAN.md) records implementation and validation details.

## What is built

- Momentum controller with ground friction, air steering, timed hops, gravity, and floor-shot boosts.
- Fixed 120 Hz, seeded simulation independent of presentation.
- Moving daggers, swept collision, burst/stream distinction, bouncing projectiles, and guided homing.
- Seven attunements, synchronized dual hands at V–VII, gem expiry/collection/pushback, and separate collection/reserve accounting.
- All four skull tiers and their transmuted forms; three squid tiers; both spiders/eggs; spiderlings; Centipede, Gigapede, Ghostpede; Leviathan/Orb; Thorns.
- Summoner crystal hit zones and per-segment centipede health and gem rewards.
- Original V3 Survival event ledger, accelerating endless waves with every-third-wave Ghostpede substitution, and reference tile sinking shared with collision.
- All 22 enemy entries now render with Quaternius CC0 creatures or project-authored models, using a shared mineral palette, lightweight swarm geometry, new crystals/capsules/convoy segments/spires, and procedural limb motion. Arena tiles, pickups, gore and non-projectile fragments also use replacements. Existing licensed courtyard props remain. First-person combat uses the prelobby CC0 character with dorsal-up aiming and combat gestures. Current bullet visuals and all combat rules are retained; audio and historical collision/spawn data remain for later migration.
- A 30-second cosmic opening with a generated galactic panorama, stars and rising volumetric nebula banks. Cool directional light softens into the ash sky during 21–30 s, followed by the six-stage descent, with generated 360° panoramas for ash, Cloud Grave, the Furnace and Cathedral Below, then unlit depths. At 8:02 the descent reverses into an eight-second escape with accelerating world-space speed streaks, passing pressure shells, debris, a launch shockwave, a downward camera load and acceleration rumble scaled by the screen-shake setting, and a licensed CC0 rocket-booster roar through the earlier skies and space; by 8:18 combat continues in The Throne Above Creation: a white-and-gold sanctuary with a colossal radiant throne, three celestial halos, eight gates, floating terraces and hanging foundations. The arena becomes ivory stone with gold inlays; the staged reveal includes a threshold bell and a mastered CC0 ethereal choir recording by deadrobotmusic from Freesound (see assets/provenance/heaven-audio/CREDITS.md). Each arrival releases 50 collectible gems over 2.5 seconds without an enemy kill, shared as one shower in co-op. After a twelve-second hold, it descends through space and the environments again, repeating every 8:30 while survival time and combat keep advancing. The arena stays stable, with a minimum visibility fill in the depths; reduced motion suppresses the rush visuals. The ascent sound sources and licenses are recorded in assets/provenance/ascent-audio/CREDITS.md. These changes affect presentation; encounters and replay timing stay unchanged. Existing replays show the new environment. Low quality, mist off and reduced motion are supported; the menu retains its own scene.
- Original weapon/enemy/event audio, persistent positional enemy voices and cardinal ambience, optional directional threat markers, and readable gem collection status.
- Start, pause, settings, death summary, instant retry, best-time persistence, practice starts, and replay history/keep/export/seek/top-down playback.

## Replacement model review

`npm run test:remake-models` captures all 22 replacements in `artifacts/remake-models/`, checks crystal positions and forbidden old-model requests, and exercises a 1,000-enemy fixture. Open `http://127.0.0.1:5173/artifacts/remake-models/index.html` while the dev server is running to review the gallery. `npm run test:combat-hands` checks upright combat wrists across all tiers/FOVs and exact retained bullet transforms.

Source GLBs are in `public/assets/models/remake/`; licenses and exact source hashes are recorded in `assets/provenance/remake/models.json`. Run `python3 tools/import-remake-models.py --check` to verify the copies. Production packages only the 12 retained projectile meshes and seven textures from the old rendering archive, plus existing audio until its replacement milestone.

## Architecture

- `src/simulation.ts`: state, tuning, timeline, movement, attacks, collision, enemies, resources. No rendering or browser imports.
- `src/renderer.ts`: Three.js presentation, instanced arena/projectiles/gems, bounded particles, and bloom.
- `src/remake-enemies.ts` and `src/remake-model-library.ts`: licensed model loading, palette conversion, bounded-error swarm mesh reduction, authored attachments, and weak-point animation. `src/original-enemies.ts` is a compatibility export.
- `src/enemy-presentation.ts`: shared model coordinates and damage-target transforms.
- `src/original-weapon.ts`: preserved projectile launch transforms, dagger batches, and mesh-based effects.
- `src/audio.ts`: original WAV recordings, per-enemy voices, positional ambience and tuned voice priority.
- `src/arena.ts` and `src/survival.ts`: reference terrain and infinite spawn schedule.
- `src/replay.ts`: deterministic input recording/playback and IndexedDB run history.
- `src/main.ts`: mouse/keyboard input, fixed-step accumulator, UI, pause lifecycle, settings, and storage.
- `tests/simulation.test.ts`: behavioral tests, including collisions, resource tradeoffs, progression, and reproducibility.
- `tests/browser.mjs`: real-browser end-to-end smoke.

High quality uses half-resolution bloom and up to 1.25× pixel density; low disables bloom. Both cap the drawing buffer at 1.6 million pixels and reduce rendering resolution when frames stay slow. The 120 Hz simulation is an implementation choice, **not a verified 120 FPS performance claim**. Hardware benchmarking and dense endgame profiling remain to be done. The frame loop admits at most 100 ms of elapsed time and processes at most 12 simulation steps per frame after stalls; visual effects use a separately bounded delta. Long stalls therefore slow the run clock instead of creating a prolonged catch-up freeze. Weapon and enemy assets load concurrently, and gameplay shaders compile before Start becomes available. Audio warms opening cues on the first gesture and loads later recordings on demand. Native replay compatibility and external score verification remain separate work.

Multiplayer teammates and third-person replay/killcam bodies use Quaternius's CC0 Demon. The 301 KB GLB has no textures, keeps three locomotion clips, and shares geometry between players. The same CC0 character supplies first-person combat arms and hands. Its right arm aims forward in combat, and V–VII aim both arms; held hand gestures override each arm independently. Extracted hand meshes and skins are no longer loaded. Animation follows simulation/playback time so pauses freeze poses. Provenance and trimming instructions are in `assets/licenses/quaternius-demon.txt`; verify with `node tests/crew-demon-browser.mjs` and `npm run test:combat-hands`.

## Practice and replays

Expand **Practice an encounter** on the menu to choose a start time, hand and homing reserve. Start at 229 for the six-squid wave, 259 for the Gigapede trio, 350 for Leviathan, or 442 for Ghostpede. Earlier enemies are not carried into a practice start. Practice records stay separate from standard Survival best times.

After death, **Watch this run** opens playback. Use the slider or Left/Right arrows to seek ±3 seconds (Ctrl gives ±10); M toggles top-down view. **Run history & replays** retains ten recent runs. **Keep** retains a run longer and **Export** downloads the port's JSON replay. Replay files are versioned for this implementation, not native Devil Daggers replays. History also supports compressed export, importing earlier JSON exports, and sharing up to three hosted replay links. New published bests automatically attach a compressed replay to the leaderboard; Watch downloads it once and caches playback locally. Existing highscores need their matching local recording attached from history. See [LEADERBOARD.md](LEADERBOARD.md) for ownership, upload limits and storage budgeting.

After a team wipe, **Watch team replay** opens the full authoritative crew run, and **Watch final moments · 10s** opens its ending. Individual deaths keep the usual spectating/respawning flow. Each player watches independently with first-person, follow-player, free-flight, and top-down cameras, teammate selection, 0.25×–2× speed, event markers, and frame stepping. Space pauses, Left/Right seeks ±3 seconds (Ctrl gives ±10), comma/period steps while paused, M toggles top down, and Escape returns. Free flight uses the existing spectator controls; mobile adds separate UP/DOWN buttons. Replay preserves the finished match and crew connection; returning to the lobby closes the old viewer. A guest who has downloaded the full replay can finish watching after the host leaves. Leaderboard playback uses this same viewer. Run `npm run test:crew-replay` for recording, transfer, real host/guest, controller, and touch checks; `npm run test:crew-replay-performance` profiles long recordings and dense seeking.

## Next work

See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for the complete remaining scope: measured movement/AI/collision, native presentation/lobby/death/upgrade behavior, precise homing and audio calibration, independent rankings and dense endgame profiling.

## Assets and licenses

The runtime uses Quaternius CC0 creatures and project-authored enemy parts, towers, arena blocks, pickups and fragments. Audio uses the complete verified bank of **275 original Devil Daggers recordings**. Gameplay, menu feedback, menu music and ambience resolve through `src/original-audio-manifest.json`; Hands 5, 6 and 7 layer original hands 1+2, 2+3 and 3+4 respectively, including their upgrade sounds; game-specific events reuse suitable original cues. The current dry and wet footsteps retain their recordings, gains and gait. Environment-specific soundscapes, ascent and heaven audio layers remain in place.

The user-selected projectile visuals and original audio retain extracted Devil Daggers assets. The original audio remains Sorath material; its presence here does not grant a redistribution license. Production excludes old enemy/hand/floor/gore rendering assets, raw studio recordings, source archives and provenance downloads. The former studio bank remains archived; only its current footsteps are active.

`python3 tools/prepare-original-audio.py` verifies the original import hashes and prepares runtime files and cue mappings. All 275 native recordings ship as byte-identical WAVs, without gain normalization or transcoding. Extra-hand composites blend the requested source pairs at fixed 50/50 weights. Native effects use recorded levels and one shared output-headroom stage; the original engine’s HDR mixer is not claimed to be reconstructed. Footsteps retain their isolated existing mix. The event-routing corrections and remaining native-engine limits are documented in `ORIGINAL_AUDIO_ROUTING_AUDIT.md`. `npm run test:original-audio` checks the full source/runtime bank, preserved footsteps and browser decoding/playback in Chromium and WebKit. The former studio-generation tools and provenance remain for the archived bank.


## Public leaderboard

Open **Public leaderboard** from the menu to see the top 100 shared solo Survival scores. Choose your nickname before the first run and enable automatic publication, or publish manually from the death screen. Every run shows its score status; failed saves remain queued for retry. Supabase stores solo bests separately from the Multiplayer tab, which ranks two-, three-, and four-player parties and shows every teammate’s recorded name. Each player can enable public party scores/replays in the lobby; confirmed parties can publish their best after a wipe, with automatic host publication as an option. Watch opens the exact hosted recording with free flight and top-down inspection. Crew recordings also persist in local history with keep/import/export and upload retry. Practice and disconnected runs remain locally replayable. See [LEADERBOARD.md](LEADERBOARD.md) for deployment, database access and score-verification limits.

The bottom-right HUD shows a gem icon and the total gems collected in the current run, in both solo and co-op. Spending homing reserve does not reduce this total. Validate desktop and mobile placement with `npm run test:gem-hud`.

## Friends multiplayer

The main menu includes browser-to-browser WebRTC cooperative survival for up to six players. Create or join a room to enter the shared courtyard immediately; friends can keep joining while the pit is closed. Walk through the right-hand passage into the separate football room, with a 36 × 50-meter grass pitch, full markings and two nine-meter goals. Kick the existing in-game skull, with dedicated prelobby illumination, synchronized scoreboards above both goals and a short goal whistle. Hold **left mouse** to charge a left-foot kick, then release; full power takes 1.2 seconds. Right mouse charges a right-foot kick; controller **LT / RT** kicks with the left / right foot. A ball fully over a field boundary returns to the exact center without changing the score. Face a friend and raise opposite hands for a high-five. Press **F** to ready/unready on keyboard; mobile players tap **Ready up**. **Room & crew** contains invitations, appearance choices, skull reset, and run history. Mobile has separate hold-to-raise hand buttons.

The **basketball court is immediately to the right of the spawn area**, through its own entrance at the back of the lobby. It does not require crossing football or the drawing court. Six loose basketballs share one hoop. Walk close and press **E / G**, controller **X / Square**, or the touch pickup button; a primary-fire tap also picks up a nearby loose ball. Hold **left mouse / LT / L2** to charge, aim upward, and release to shoot. **Right mouse / RT / R2** performs a slam dunk while carrying a ball close to and facing the basket: a short approach and jump bring the ball over the rim before the downward finish. Hold-to-repeat is disabled, and distant dunk attempts keep the ball in your hands. The right stick uses finer aim while carrying the ball. Touch players hold the right aiming area and lift to release. A thin trajectory and impact marker use the same collision solver and release position as the real shot. The scoreboard is mounted at the center of the left wall when facing the hoop; the drawing-court sign and courtyard plaques also have fixed orientations. A bent-elbow set shot raises the ball, extends the shooting arm, drops the guide hand, and finishes with a wrist follow-through. First-person basketball hands are 28% opaque while holding or releasing the ball so the guide remains visible; other players remain opaque. Retrieve the ball yourself after each attempt; balls stay on the court. Everyone has individual points, made shots, and attempts on the shared scoreboard: **2 points**, or **3 points from beyond the painted arc**. The hoop uses a proportionate orange rim, support bracket, and tapered diamond-weave net on the downloaded backboard and stand. Rim, backboard, floor, and boundary rebounds run on the host; ownership, charges, flight, and scores synchronize to guests and late joiners. A fresh courtyard resets the game. Downloaded [Poly by Google basketball and Innerscene hoop credits](public/models/basketball/LICENSE.md) ship alongside the local GLBs. Run `npm run test:basketball` to check physics, networking, direct access, retrieval, keyboard/controller controls, and touch layouts.

Everyone must finish loading and mark ready before the host can hold **Open pit**. Controller players tap **Select / View / Share** to ready up; the host holds it for five seconds to open the pit with a visible countdown. Stand clear of the cover while it opens, then jump in: the arena starts together only after every crew member has dropped. The host can cancel; unreadying or a disconnect also restores any dropped players safely before closing the pit. After a wipe, **Return to courtyard** resets readiness and the toy while keeping a last-descent and crew-best summary. Survival time, weapons, and scoring stay inactive in the courtyard.

Continue through the passage beyond the football pitch to the **Scribble Court**: a giant 24-metre drawing board with **8 × 8 squares**, two physical pencils and a giant eraser. Stand beside a free tool and **left click**, press **E / G**, or controller **X / Square** to pick it up; E/G/X returns a held tool. Aim anywhere across the entire field and hold either mouse button or trigger for unrestricted freehand drawing. The paper starts blank; **H** toggles the optional 8×8 grid. **1–8** selects colors and **[ / ]** adjusts brush size; controller D-pad left/right changes color and up/down changes size. Rounded, antialiased strokes use finer positioning and merge straight continuations to save capacity. Touch players use the pencil button and right-side aim/draw control. Each tool has one owner; marks and ownership are shared with the crew and late joiners. The host can **Clear board** with **T**, controller **Y / Triangle**, or the on-screen button; returning to a fresh courtyard resets it. The board uses house rules rather than automatic turns or win detection. Use the giant eraser with the same draw controls to scrub away nearby marks without deleting the rest. Anyone can walk up to the giant red wall button and press E/G/click/X to clear all lines. Drawings support 16,384 segments (32× the old limit), with packed recovery and incremental network updates. Multiplayer protocol 18 requires everyone to reload after this update. Run `node --import tsx --test tests/courtyard-drawing.test.ts` and `node tests/courtyard-drawing-browser.mjs` for state/ownership tests and controller/keyboard drawing over real WebRTC.

Every gem counts for every player. Dead players respawn after 15 seconds beside a living teammate, keeping weapon progression and gaining three seconds of protection from enemies. A full crew wipe ends the run. The solo entrance retains its seal. See [MULTIPLAYER.md](MULTIPLAYER.md) for online hosting and validation; `npm run test:courtyard` checks the new room, and `npm run test:courtyard:six` runs ten six-player return cycles.

The menu plays the complete CC0 “Dark Place” theme by SkyleTheFrench, streamed as AAC with fades between screens. The entrance uses a layered studio soundscape. Menu taps use a shared dark stereo room reverb; rebuild the theme and room with `python3 tools/build-menu-theme.py`. Arena play and replays are silent apart from game sounds. Music starts after a click, tap or key press, pauses while the tab is hidden, and has its own saved Music volume setting. Run `npm run test:music` against the development server to verify playback and transitions.

The solo entrance plays a replacement positional seal call, selecting its normal, bronze, silver, gold, devil, or 1,000-second variant from the locally saved best time. Entering the arena uses the licensed countdown and spawn-release cue. Entrance cues are prepared before crossing and use Sound volume independently of Music volume.

## Crown of the Abyss

The current first-place solo Survival record holds the Crown of the Abyss. Everyone sees the crowned dagger shrine on the main menu and the champion’s throne above the leaderboard. The holder’s browser profile receives a special frame and title, with a brief coronation at the altar once per observed reign. Crew lobby seats with the champion’s published nickname show the same crown, matching the leaderboard’s existing nickname identity model. This is entirely cosmetic.

The crown follows the server’s leaderboard ordering, including tied times. Rankings refresh on menu startup, every minute while menus are visible, on reconnect or tab return, and after a successful score publication. Narrow menus show the seal and shrine together in the scrolling menu, with one shared centre line and proportional sizing; reduced motion disables its animation. Empty rankings show an unclaimed crown, and failed ranking requests remove champion honours until a successful refresh. Former-champion history and in-arena character effects are not included. Verify with `npm run test:champion`; test ranking responses are intercepted locally and never publish scores.
