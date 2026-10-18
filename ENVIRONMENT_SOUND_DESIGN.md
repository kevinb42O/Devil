# Descent environmental sound

The arena has seven stereo environmental beds, tied to `descentAt(world.time)` rather than elapsed wall time or a player's respawn. Each contains 120 seconds of evolving source material, delivered as 192 kbps AAC in M4A. The seven runtime files total approximately 19 MB. Wind combines three offset passes of the long recording to cover the source’s 18–20 second silent gaps between gusts. Only the current environment and its neighbour near a transition are requested during play.

| Environment | Run clock | Sound |
| --- | --- | --- |
| Cosmic Expanse | 0–30 s; handover at 21–30 | Broad, deep waves of cosmic pressure, distant resonant motion |
| The Last Sky | 30–69 s; storm arrives at 51–69 | Long polar wind gusts with restrained low air pressure |
| The Cloud Grave | 69–144 s; veil arrives at 126–144 | Strong stereo wind, recorded rain and rolling thunder |
| The Bruised Veil | 144–259 s; furnace arrives at 241–259 | Unsettled electric waves under hollow wind |
| The Furnace | 259–380 s; cathedral arrives at 362–380 | Recorded burning fire, low subterranean rumbles |
| The Cathedral Below | 380–472 s; depth arrives at 454–472 | Distant resonant mystery bells and filtered air through stone |
| The Unlit Depth | 472 s onward | Super-low geological groans and a slow ominous pulse |

Chapter transitions use the same smooth weights as the sky, converted to equal-power gains. Two media streams per bed overlap the last four seconds of each recording, avoiding a silent end/restart. Recordings stay stereo and non-positional: the whole sky surrounds the player. Weapon, enemy and footstep cues retain their own positioning. Beds bypass the arena reverb, since they already carry their own sense of scale, and feed the existing effects master and limiter. The effects volume controls them independently of music.

The mixer stops its streams on pause, death/menu, hidden tabs, clearing a run, and effects mute. Solo and crew replays reconstruct the chapter from the replay clock and seek the recording on timeline jumps. Individual crew deaths do not restart the shared environment. Streams are not slowed or pitch-shifted with weapon upgrade feedback.

## Sources and game-use rights

Six selected two-minute excerpts from the Sonniss 2021–2023 GDC bundle:

- **344 Audio — Haunting Ambiences Vol. 2:** Strong Wind Gusts, Arctic, Polar, Icy, Endless; Super Low Rumbles, Apocalypse, Underwater, Groans.
- **Systematic Sound — Tonal Elements Obscurum / Dark Drones:** Dark Drone Deep Waves Of Darkness; Dark Drone Intensive Electric Waves.
- **Justsoundeffects — Cinematic Drones:** Mystery Bells; Slow Pulse Drone.

These use the [Sonniss GDC bundle licence](https://sonniss.com/gdc-bundle-license/), version 2 effective 27 August 2026, retrieved 18 October 2026. Runtime edits are incorporated into this game. Original recordings/excerpts remain in the ignored private `assets/_sources/studio-audio/environment/` directory and must not be redistributed as a sound library.

Two CC0 field recordings by Joseph SARDIN / BigSoundBank:

- [Rain and Thunder #2, 0740](https://bigsoundbank.com/rain-and-storm-2-s0740.html), stereo XY, 48 kHz / 16 bit.
- [Big branching fire #3, 0989](https://bigsoundbank.com/big-branching-fire-3-s0989.html), 48 kHz / 16 bit.

Exact download URLs, byte ranges, dates, hashes and source identities are in `assets/provenance/environment-audio/sources.json`. Layer weights, filtering, peak/RMS measurements and runtime checksums are in `public/assets/audio/environment/manifest.json`. No bulk bundles were downloaded. Soundimage tracks were researched but are not used.

## Rebuilding and verification

`python3 tools/build-environment-audio.py` retrieves only the eight selected recordings/excerpts and rebuilds the game beds. It requires Python with NumPy/SciPy and macOS `afconvert`. The masters use 44.1 kHz stereo, source-specific filtering, DC removal, stereo-linked slow source levelling, transient compression, an approximately 0.08 RMS bed level, a 0.4 soft peak ceiling, and 25 ms edge fades under the runtime overlap. Runtime beds use a restrained 0.18 mix gain, with the rain/storm bed reduced further to 0.095 (about 5.6 dB below the wind chapter) (the opening space bed is approximately 15 dB quieter than the initial implementation). Content-hashed M4A filenames prevent cached first-pass masters from surviving the update.

`npx tsx --test tests/environment-audio.test.ts tests/descent.test.ts` checks all seven assets, complete chapter coverage, transition continuity and the unchanged descent curves. With Vite running, `node tests/environment-audio-browser.mjs` measures actual browser audio output for every bed and checks overlapping playback, continuous traversal of all six chapter crossfades with per-bed output meters, scrubbing, pause, mute, visibility, and the normal entrance/countdown/game lifecycle. Its report is written to `artifacts/environment-audio/browser-report.json`.

## Visible storm

`src/storm-rain.ts` follows the same Cloud Grave envelope: rain arrives at 51–69 seconds, holds through 126 seconds, and clears by 144 seconds. Wetness accumulates over 32 seconds, persists into the Bruised Veil, and dries by 229 seconds. Timeline seeks reconstruct the same rain and surface state without saved particles.

Three bounded GPU batches provide slanted streaks, expanding impact rings, and short ballistic microdroplet splashes. They sample a nearest-filtered height texture built from actual arena tiles, updated four times per simulation second while raining. Drops stop at the surface and do not splash in the void. A chained floor shader adds a damp film, irregular connected puddle masks, sampled reflections of the actual storm panorama, Fresnel water response, and fine waves that distort reflected normals. It preserves existing gem, blood, projectile and upgrade floor shading. The sky reflection reuses the existing panorama texture and does not require a reflection render pass. It reflects the environment rather than local enemies.

High quality uses 7,200 seeds per batch; low quality uses 3,000. Eighty percent use fixed positions across actual arena tiles, including the far edges, and twenty percent add camera-near detail with a soft boundary. Camera movement cannot drag the global rain volume across the world. Reduced sky motion suppresses airborne streaks and slows the subtle ground effects while retaining wetness transitions. There are three extra scene draw calls during rain, no additional lights, reflection targets, downloads, or per-drop CPU objects. The weather hides outside the storm.

`npx tsx --test tests/storm-rain.test.ts` checks the storm envelope, drying, reduced motion, rewind and tile contact heights. `node tests/storm-rain-browser.mjs` compiles the actual shaders, compares enabled/disabled pixels, checks animation/pause/rewind, measures draw calls and GPU-complete frame times, and saves screenshots plus a report in `artifacts/storm-rain/`.

## Film and GPU budget

The polished floor shader evaluates four neighbouring ripple cells on High and one on Low. Rain drift includes slow coherent gusts, distance attenuation, soft density transitions, and smaller streak widths. Ripple normals and two expanding impact fronts replace the original bright ring outlines. Every quality preset keeps whole-field coverage and all three weather batches.

`node tests/storm-rain-performance.mjs` measures paced full-frame GPU timer queries with weather disabled/enabled on High and Low; CPU submission time is reported separately. Results are saved in `artifacts/storm-rain/performance.json`. This is a local fixture measurement, not a universal hardware FPS guarantee.

`node tools/record-storm-film.mjs` records the actual renderer and `EnvironmentAudio` mixer into a 1280×720 H.264/AAC MP4. The edited 86-second showcase includes unaccelerated space-to-wind, wind-to-rain, and rain-to-veil transitions, a whole-arena shot, and a low surface tracking shot. Letterbox bars, labels, and brief shot fades belong only to the recording. Preview audio is lifted approximately 10 dB for listening; the quieter runtime mix remains unchanged. `node tools/inspect-storm-film.mjs descent-storm-film.mp4 8 30 46 55 73` verifies video/audio decoding and saves review frames.
