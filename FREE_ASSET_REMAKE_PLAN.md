# Free-asset remake plan

Prepared 17 October 2026. Status: combat hands, the complete first model pass, and all runtime sound/music replacements are implemented locally on GitHub base `f9abc5b`. Historical spawn/arena data, remaining collision migration, final art/audio tuning, and deployment remain pending.

## Intended result

Turn the current project into an independently presented arena survival game, replacing the enemy/environment assets, first-person hands, effects outside the retained bullets, sounds, and music. User revision on 17 October: keep the current bullets exactly as they are; use the existing multiplayer prelobby character's arms/hands in combat; retain its gestures and make them usable during real gameplay.

The bullet exception includes existing projectile geometry, textures/materials, flight appearance, trails, collision, damage, timing, spread, homing, and upgrade behavior. Weapon sounds remain in the audio replacement scope. Do not redesign the bullets to match the proposed environment. Inventory the exact assets and shared dependencies needed to preserve them rather than retaining the whole original archive.

The retained bullets currently depend on extracted Devil Daggers assets. This revised scope therefore cannot honestly be described as containing zero extracted assets. Record their provenance and unresolved reuse license explicitly; user preference to retain them does not itself supply a license. Every other distributed asset must have a recorded source and a license permitting its intended use, or be newly authored for this project.

The recommendation is to preserve useful engineering—controls, rendering infrastructure, networking, replays, settings, and accessibility—while changing the recognizable creature designs, weapon presentation, world, naming, encounter script, and branding. The desired fast movement, crowd pressure, resource collection, and co-op remain the design foundation. Code and data provenance still need review; existing code is not automatically cleared merely because the art changes.

This is feasible with zero asset purchase cost. Free assets still require selection, conversion, animation, material work, audio editing, and testing. A pack listing establishes a candidate's published license, not final quality or complete provenance assurance. Do not promise that changing assets eliminates every possible dispute or audience comparison.

## Original migration inventory

Historical evidence from before implementation (the live renderer and audio paths have since been replaced):

- `assets/provenance/original-weapons.json` records Sorath ownership, `reuseLicenseFound: false`, 439 rendering files, and 275 original WAV files. These are recorded import counts, not a fresh count of all live dependencies.
- `vite.config.ts` requires the extracted manifest and copies the entire `assets/original/devil-daggers/` directory into production.
- `src/original-enemies.ts` and `src/original-weapon.ts` load the extracted creatures, hands, projectiles, gems, and effects.
- `src/renderer.ts` loads the original tile texture. `src/blood-renderer.ts` and `src/player-death-burst.ts` load original blood geometry.
- `src/audio.ts`, `src/menu-audio.ts`, and `src/music.ts` load the original recordings, including menu music and ambience. Audio replacement must cover the entire application, not just combat.
- `tools/build-projectile-colliders.mjs` derives collision data from original enemy meshes. Audit the entries and replace those belonging to replaced enemies; preserve projectile behavior while updating target geometry. Do not change retained bullets' own collision behavior.
- `src/arena.ts`, `src/spawn-placement.ts`, and `src/survival.ts` depend on the recovered data in `src/survival-data.ts`.
- `tools/build-pwa.mjs` explicitly packages/caches the original asset paths.
- `assets/provenance/crew-countdown.md` says no explicit redistribution license was identified for the Myinstants countdown. Replace it too.
- There are already 17 selected Kenney audio candidates, Poly Haven rock materials, and a four-monster Quaternius pack locally. The selection manifest marks the sounds as not auditioned. They are starting material, not approved final content.
- The crew Demon has CC0 provenance in `assets/licenses/quaternius-demon.txt`. Existing courtyard props, football assets, fonts, sky panoramas, icons, and effect sprites need individual review before reuse. Generated skies have local generation records; retaining them is a scope decision, not a third-party CC0 claim.

## Recommended creative direction

Working concept: an abandoned celestial foundry, with fractured stone platforms, tarnished metal, cold teal energy, and warm amber danger cues. This is a proposed theme, not a cleared commercial title.

The player uses the existing CC0 Quaternius Demon arms/hands already visible in the multiplayer prelobby, adapted to first-person combat. Preserve their identity, fingers, skin selection, and open-palm gestures. Retain the existing bullets and all seven combat upgrade stages; adapt hand aiming, recoil, and upgrade presentation around those constraints. A separate gun or relic-emitter model is no longer planned. Threats are corrupted guardians, flying scavengers, walking brood vessels, and articulated constructs. Common materials, restrained texture resolution, strong silhouettes, and shared lighting should unify adapted assets. Avoid recreating the original skull/squid/spider silhouettes and then only recoloring them.

### Combat hands and gestures

- Reuse `public/assets/models/crew-demon.glb` and the rig/presentation in `src/crew-avatar.ts`, rather than downloading another hand model. Use the actual rigged arms/hands, with connected shoulders and appropriate camera framing.
- Preserve independent left/right arm raises, both-arms gestures, wrist orientation, open fingers, smooth release, and first-/third-person agreement. Make them available in solo and co-op combat, with remote players, spectators, death views, and replays displaying the same pose.
- The original audit found entrance-only input in `sampleEmotes` in `src/main.ts` and courtyard-only pose gates in `updateCrewAvatar` in `src/crew-avatar.ts`. The first milestone removes those combat restrictions while retaining pencil and basketball pose behavior.
- Keep keyboard gesture keys Q/E for QWERTY and A/E for AZERTY. The current GitHub build uses LB/RB (L1/R1) for prelobby gestures; keep those bindings in combat too. LT/RT retain combat homing/fire and courtyard foot actions. Mobile combat has LEFT HAND / RIGHT HAND hold controls.
- While a gesture is held, it owns that arm's visible pose; releasing smoothly restores combat aiming. Firing, bullet origin, hit detection, spread, damage, and cadence remain unchanged. Keep visual launch feedback aligned with the preserved projectile origin rather than moving gameplay shots with a raised hand.
- Cover all seven upgrade stages, dual-hand firing, camera FOV extremes, jump/run motion, pause/focus loss, death, respawn, and arena transitions. Existing input arm flags must survive multiplayer and replay paths in combat; verify and version formats only if encoding changes are needed.

Use one monster collection as the primary source. Test its style in the actual arena before committing to the complete roster. Quaternius assets are stylized; lighting and material work can make them ominous, but they will not automatically become detailed realistic horror models.

## Verified internet shortlist

Pages checked 17 October 2026. These are source-level verifications; new files have not been downloaded, animated in this project, rendered, or auditioned during this pass. Use only the free packs identified below, not optional paid bundles.

| Need | Source | Published license | Planned use and remaining work |
| --- | --- | --- | --- |
| Main enemy collection | [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | CC0 | Publisher lists 50 animated monsters. Select a small cohesive set; inspect actual meshes, clips, skeletons, and export formats before assigning specific characters. |
| Available fallback models | [Quaternius Animated Monster Pack](https://quaternius.com/packs/animatedmonster.html) | CC0 | Four animated monsters; a local copy already exists. Suitable for conversion and animation proof, not automatic coverage of every enemy role. |
| Combat arms/hands | Existing `public/assets/models/crew-demon.glb`, from [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html) | CC0; local provenance in `assets/licenses/quaternius-demon.txt` | Required choice: reuse the multiplayer prelobby arms/hands, gestures, and selected skin. No replacement gun or separate anatomical-hand download. |
| Stone floor and sides | [Rock Tile Floor](https://polyhaven.com/a/rock_tile_floor), [Rock 01](https://polyhaven.com/a/rock_01) | CC0 under [Poly Haven's asset license](https://polyhaven.com/license) | Both already have local prepared files. Establish one consistent material treatment and use web-sized texture variants. New arena geometry must be independently constructed. |
| Impacts, landings, breakage | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | CC0 | Audition existing candidates first. Edit several variations for stone, metal, and weak-point feedback. |
| Weapon, pickup, upgrade layers | [Kenney Digital Audio](https://kenney.nl/assets/digital-audio) | CC0 | Existing candidates are electronically styled. Use selected layers with impacts and processing; replace candidates that sound out of place. |
| Menu feedback | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 | Select a handful for focus, confirm, back, slider, and reward cues. |
| Creature vocals | [80 CC0 creature SFX — rubberduck](https://opengameart.org/content/80-cc0-creature-sfx) | CC0 | Candidate source for bug sounds, breath, grunts, feeding, hurt, and roars. Select only files needed for named roles. |
| Alternate creature vocals | [Monster Sound Effects 2 — Ogrebane](https://opengameart.org/content/monster-sound-effects-2) | CC0 | Page lists 17 WAV files. Audition a few as alternatives where the primary source lacks a useful cue. |
| Menu/entrance music candidate | [EmptyCity: Background Music — yd](https://opengameart.org/content/emptycity-background-music) | CC0 | Page describes dark background music. Must audition, check its supplied files, and test looping before adoption. Combat should leave space for threat cues. |

No exact replacement model or recording is approved merely because its pack is listed here. Missing specialist shapes should be adapted from these licensed sources or built as simple original geometry. If a required high-detail model cannot be obtained or produced to the needed standard, simplify its design and make that limitation explicit.

## Model coverage

The current code has 22 enemy entries. All must have explicit replacements during migration, even if the final game later consolidates variants. Existing internal identifiers can survive temporarily to reduce migration risk; player-facing names and final encounter designs should change.

| Existing entries | Replacement design brief | Implementation requirement |
| --- | --- | --- |
| Four skull tiers and four transmuted variants (8) | Distinct flying scavenger/guardian forms from the selected monster family | Readable silhouettes and size differences, not color alone; shared animation where appropriate; affordable swarm rendering. |
| Three squid tiers (3) | Floating gatekeepers with rotating mechanical cores | Adapt selected bodies and independently authored attachments; replace spawn/weak-point presentation and animation. |
| Two spiders (2) | Walking or hovering brood vessels | Select suitable models before committing to anatomy. Build new attack/exposure/feeding cues and attachment points. |
| Two eggs and spiderling (3) | Incubation pods and small scavengers | New pod mesh, hatch effects, small-body locomotion, and readable collision. |
| Centipede, Gigapede, Ghostpede (3) | Articulated construct convoys with distinct head/tail shapes | Independently built modular segments or inspected licensed parts; original motion presentation, segment damage, and optimized batching. |
| Leviathan, Orb, Thorn (3) | Colossal guardian, unstable energy heart, and arena hazards | New silhouette, reveal, attack warnings, hit/death effects, and geometry. These are specialist work, not an established fit from the shortlist. |
| Player and combat hands | Existing CC0 prelobby Demon arms/hands | First-/third-person alignment, gestures usable in real combat, all seven upgrade states, remote-player firing and gestures. |
| Bullets | Keep current bullets unchanged by explicit user instruction | Preserve visuals and gameplay; document the retained extracted assets and license status. |
| Pickups, arena, debris | New energy capsules, fractured platforms, and metal/stone fragments | Independently authored geometry, new materials, fresh target colliders, and coherent impact effects outside retained bullet presentation. |

## Sound coverage

Make a cue inventory from actual call sites and event paths before editing the mixer. Map every live cue to an approved replacement or deliberately retire the event. The 275 imported recordings do not imply that 275 newly recorded sounds are necessary: selected sources, variations, and edited layers can serve a smaller, designed cue set.

- Weapon: stream, burst, guided fire, idle/charge loops, ricochets, piercing, ground boost, all upgrade levels, and synchronized dual fire.
- Player: arrival, jump, landing, falling, death, pickup, reserve/upgrade feedback, and co-op return.
- Every threat family: presence/idle loop where needed, spawn, attack/feeding, damage, weak-point break, and death. Small threats need short high-frequency signatures; large threats need distinguishable lower cues. Do not mask urgent attacks with constant ambience.
- World: arena transition, wind/drones, positional warnings, hazards, breakage, and boss arrival.
- Application: menu controls, high score/rewards, entrance interaction, multiplayer countdown, football feedback, music, replay playback, and pause/resume behavior.
- Replace the undocumented countdown recording with an independently synthesized tone sequence. If a spoken voice is desired later, select a licensed voice source separately.

Keep audio positional behavior, priority limits, mute controls, visibility handling, and replay rate support. Rebuild gains and loop metadata from the new recordings; do not retain extracted loudness tables. Process source files offline, remove clicks, match perceived volume, test repeated playback, and provide codec variants where the supported browsers require them. A pitch-shifted original-game sample is not an acceptable replacement.

## Delivery sequence

1. **Inventory and provenance foundation.** Build a complete asset dependency list, including public assets and generated/derived data. Assign replace/verified-reuse/review status. Record creator, source page, source filename, download date, exact license, license evidence, SHA-256, edits, destination, and role. Review copied code/shaders and data separately from art. Establish an isolated implementation branch and save visual/performance baselines when implementation starts.
2. **One playable look-and-sound sample.** First bring the prelobby arms/hands and gestures into real combat while preserving current bullets. Add one small enemy and one large enemy, pickup, arena material, impacts, creature vocals, and ambience into a 60–90 second local encounter. Include a model gallery and audio audition page. Judge readability, hand/gesture behavior, unchanged bullets, and sound balance together. This is the point to refine the creative direction before scaling it across 22 entries.
3. **Complete visual migration.** Cover every enemy entry and upgrade state, first-/third-person presentation, arena, blood/debris, particles outside retained bullet effects, pickups, courtyard/replay views, HUD, and icons. Replace enemy mesh-derived collision shapes to fit the new enemies while preserving bullet behavior. Verify combat gestures locally, remotely, and in replay. Keep practical low-quality options; profile swarms and segmented enemies before importing more complex models.
4. **Complete audio migration.** Cover the full cue inventory, replace menu and entrance recordings/music, rebuild mixing/loop configuration, and exercise later encounters and co-op. Nothing may silently fall back to the extracted directory. Listen to the new mix directly as well as checking browser diagnostics; do not mark sounds auditioned based only on file metadata.
5. **Independent game identity.** Replace recovered arena heights and spawn tables with new authored/seeded content. Give enemy roles, timing, progression, weapon effects, UI language, and branding a coherent independent design. Retain useful mechanics while tuning distinctive encounters. Version the rules and replay formats, and create a separate leaderboard season so different rules do not share rankings. Document whether old replays are unsupported or require a separately retained local version; do not ship the old asset archive for compatibility.
6. **Clean release verification.** Build from an empty output directory using an explicit asset allowlist, with the retained bullets listed as an unresolved-license exception. Remove the whole-archive import requirement and extraction scripts from the supported release workflow. Remove replaced extracted files and derived data from the release source tree after migration. Inspect bundles, public copies, manifests, service-worker precaches, offline packs, URLs, and all network requests. Produce credits and a source manifest, then capture a complete playthrough and browser checks before a public release. Do not describe this build as zero extracted assets while the current bullets remain.

This is a substantial conversion across several milestones. Asset acquisition can cost €0; adaptation and tuning are the main effort. Estimate duration after the first playable sample demonstrates actual model/animation fit and performance. Neither a full 22-entry conversion nor polished bespoke horror art should be promised in a single pass.

## Release acceptance

- All 22 migration entries, seven weapon states, late encounters, death effects, co-op bodies, menus, and replays have reviewed replacements or an explicit final design change.
- Every distributed model, texture, audio file, font, icon, and data artifact has a provenance entry, with the current bullets explicitly identified as a retained exception with unresolved reuse rights. Credits reflect actual files and edits, including any CC BY obligations.
- No extracted Devil Daggers content remains beyond the exact dependencies required for the retained bullets. Replace all original enemy/hand/world assets, recordings, recovered arena/spawn data, and replaced-mesh-derived colliders. Renaming or re-encoding those files does not satisfy this requirement.
- The current bullets match the baseline in appearance and behavior. Prelobby hands replace the original first-person hands; independent left/right/both gestures work in real combat, remote views, and replays without altering bullet gameplay.
- An allowlist and known-original hash comparison complement path/content scans; scans alone cannot establish provenance of transformed files.
- Production network traces contain no unexpected original-asset requests beyond the explicit bullet dependency allowlist, and no failed replacement requests. Missing assets are surfaced in validation rather than hidden by fallback.
- The new version's service worker removes obsolete app caches and a previously installed client is tested through the update. Inspect hosting for leftover old files; a new build directory alone does not remove old server URLs. CDN/host removal is a deployment step when authorized. Published repository history, old downloadable builds, and existing forks need a separate distribution review; this plan does not silently rewrite Git history.
- Collision/readability tests, deterministic simulation/replay checks under the new rules, co-op synchronization, controls, audio lifecycle, offline update behavior, and representative dense-scene performance pass. Set numerical performance budgets from the actual baseline and intended target hardware.
- A short credits page and a downloadable asset manifest make the use of free community assets transparent. Describe the game as built with licensed community assets and project-authored work; do not imply every model or sound was made from scratch.

## First implementation milestone

Deliver the inventory, license manifest, local model/audio review gallery, and the small playable sample described in step 2. Hands are already selected: use the current multiplayer prelobby Demon arms/hands and enable their gestures in combat. Keep the existing bullets unchanged. Resolve specialist creature designs through the sample, then complete the roster after it establishes a convincing shared style.

Implementation progress: combat uses the prelobby arms/hands with corrected dorsal-up wrist orientation, independent gestures, and multiplayer/replay support. All 22 enemy entries, loose pickups, arena tiles, gore, and non-projectile fragment meshes now use licensed community models or authored geometry. Existing licensed courtyard props remain. A 22-model gallery and 1,000-enemy fixture pass without old enemy/hand/floor/gore requests. Bullet sockets/transforms match the GitHub baseline in 42 comparisons, and production includes exactly the retained 12 projectile meshes and seven textures. Original audio and historical collision/spawn data are still present; this is a model milestone, not a completed asset/legal migration. Nothing has been deployed.

### Follow-up: mirrored combat hand and spawner architecture

The left combat hand now mirrors the right finger joints, including the thumb, before independent gesture overrides. All three spawners use original tower geometry (Rift Obelisk, Twin Foundry, Crown Citadel) instead of creature bodies; opening crowns retain the existing spawn cadence, outlet heights, and weak-point centers. Browser checks verify mirrored finger rotations/positions, tower architecture/opening, unchanged bullet transforms, and the existing courtyard gestures. Build and both remake browser suites pass. Updated captures are in `artifacts/remake-models/` and `artifacts/combat-hands/`.

### Follow-up: hand separation and grounded tower scale

Combat upper arms spread outward while wrists keep their forward orientation. Spawners now rise 8/12/18 units above their moving roots, with a foundation anchored to the arena floor. Crystals and their damage targets are at crown height, enemies eject from the new top outlets, and authored core collision replaces old tower armor for current runs. Optional tower-rule metadata preserves old solo/team recording physics, including team checkpoint digests. The player-eye-height comparison is `artifacts/remake-models/tower-scale.png`.

Tower-height tuning: lowered current crown outlets from 8/12/18 to 6/9/13 units above the moving roots (about 25–28% lower), retaining ground anchoring and moving crystals, core collision, and ejection outlets together.

### Complete audio migration — 17 October 2026

All 175 runtime cues/tracks now resolve through `src/remake-audio.ts` and `public/assets/audio/remake/`. 105 CC0 source recordings supply authored effects, creature voices, five-second spoken countdown, courtyard feedback, menu music and entrance ambience. Sources are Kenney, rubberduck, SkyleTheFrench, congusbongus and Rosa-Orenes256. Exact per-cue recipes, source hashes, saved license pages and archive URLs are in `assets/provenance/remake/audio/`. No runtime fallback to extracted audio remains. Production and offline packaging exclude the old archive and unlicensed Myinstants countdown. The new audio totals 15,341,875 bytes, about 97% smaller than the former 502,960,648-byte archive. The composed listening preview is `/artifacts/remake-audio/index.html`. Automated checks cover decoding, rendered mix levels, loop seams, gameplay events, music/mobile transitions, countdown synchronization, source integrity and offline audio ranges. A human listening review is still useful for subjective creative tuning; passing metadata or playback checks is not evidence of subjective audition.

### Studio sound replacement after creative rejection

The first generic CC0 sound set was rejected by the user. The active bank now uses 38 professional Sonniss GameAudioGDC recordings plus five CC0 countdown words and one CC0 whistle source. 175 cues/tracks remain compatible with the mixer, with detailed 48 kHz effects, physical impacts, real creature performances, restrained energy attacks and cinematic stereo soundscapes. Studio sources have the Sonniss royalty-free commercial game/media license, not CC0. Raw originals are private/ignored; only edited cues ship inside the game. A synchronized gameplay capture replaces the standalone sound catalog. Exact sources, excerpt byte ranges and licenses are recorded in `assets/provenance/remake/audio/pro/`. Prior bulk-download cancellation remains respected.
