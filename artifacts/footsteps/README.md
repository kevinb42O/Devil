# Recorded stone footsteps

Twelve individually mastered gestures from Joseph Sardin's **Fast Steps on Concrete**, downloaded as lossless mono 48 kHz / 24-bit BWF from [BigSoundBank](https://bigsoundbank.com/fast-steps-on-concrete-s1318.html). CC0 permits redistribution and commercial use. The original, archived source page, author, license, source and derivative hashes, and per-step extraction recipes are retained in the repository. Runtime bank: 230,928 bytes total, 48 kHz / 16-bit mono PCM.

Compared source candidates included Phil25's Stone Steps and Fission9's Hiking Boot Footsteps on Stone on Freesound, plus Fantozzi's pack on OpenGameArt. The selected recording supplies a lossless original, distinct physical heel/toe gestures, and outdoor acoustics that leave room treatment to the game's shared reverb. Freesound's original download requires login; no preview-quality recording was substituted.

`FootstepGait` measures horizontal distance from presented player positions, gated by actual velocity and ground contact. Contacts follow a fixed 2.4-unit step distance shared with the 4.8-unit movement-animation cycle; there is no special early first contact. Cadence follows travel speed, weight follows movement speed, and foot sides alternate. Each actor draws from a shuffled twelve-sample bag with no immediate repetition across bag boundaries; recordings play at native pitch with no artificial alternating loud/soft accent. Physics, replay files, networking and simulation RNG are unchanged.

First-person steps play directly through the existing effects volume/limiter. Other players play from foot height through HRTF, inverse-distance attenuation and a smooth envelope that reaches exact silence at 20 arena units. Six-player remote energy is bounded. Very low body reflections and no diffuse tail keep attacks clear and subtle. Higher-priority combat sounds can displace footstep voices in the existing 48-voice pool.

Entrance and multiplayer courtyard explicitly update footsteps; combat, solo/crew replays, and death-analysis playback use `Sound.update`. Gait resets on sound clear/pause, world replacement, actor removal, long gaps and discontinuities. Air travel, actual landing frames, stationary input against walls, and large teleports produce no step. Packet-spaced remote positions preserve stride accumulation.

Validation:

- `npx tsx --test tests/footstep-audio.test.ts tests/audio.test.ts tests/spatial-audio.test.ts`: 23 passed, including asset hashes, licensing metadata, cadence across 30/60/120/144 FPS, diagonals, packet motion, wall pushing, jumping, landing, pauses and teleport rejection.
- `node tests/footstep-audio-browser.mjs`: Chromium and WebKit decode all twelve WAVs, produce first-person playback and remote HRTF voices, exhaust a shuffle bag without repeats, remain silent when idle/airborne, and enforce native pitch and low voice gain. Reports are saved alongside this file.
- `npm run build`: TypeScript and Vite production build pass.

All samples now align their main impact within the first 15 ms and end at 200 ms with a 40 ms fade. The first implementation incorrectly trimmed to quiet preliminary scuffs, delaying some impacts by 55–160 ms. This has been corrected. Catalog gain is .015, reduced a further 15 dB from .085 after listening feedback. The .70 sample peak ceiling is unchanged. Regression checks inspect the actual PCM impact timing and bound effective peak/RMS output.

Rebuild samples with `python3 tools/build-footstep-audio.py` (NumPy and SciPy required). Original source: `assets/_sources/footsteps/joseph-sardin-1318.wav`. License: `assets/licenses/footsteps-CC0.txt`.

## Rain / wet footsteps

Twelve additional gestures come from Joseph Sardin's [Shoes in the Water](https://bigsoundbank.com/shoes-in-the-water-s0690.html), a CC0 recording of shoes walking through water after a storm. The lossless 48 kHz / 16-bit mono original, source page, author, source/derivative hashes and extraction positions are retained. Rebuild with `python3 tools/build-wet-footstep-audio.py`. The wet bank adds 230,928 runtime bytes.

`rain-state.ts` holds the exact wetness curve previously defined in `storm-rain.ts`; both the floor shader and footstep material selector now consume this one curve. Contact timing remains unchanged. Dry and wet recordings share a shuffled contact index and aligned impacts. Their linear amplitude weights sum to one: the transition cannot double the signal level. Full wetness uses only the wet recording. No pitch changes or extra reverb were added.

Material fades in with the storm, remains wet while the floor stays wet after rain stops, then dries before the furnace. Courtyard footsteps stay dry. Arbitrary practice/replay times and rewinds reconstruct the correct material without waiting for a timer. The wet bank preloads eight seconds before the rain transition; cold seeks use a dry contact if its wet recording has not decoded yet, with no deferred wet voice that could double that step.

The approved .015 catalog gain and .70 sample peak ceiling apply to both materials. Measured wet-bank mean RMS is .0513, below the dry bank's .0700. The same short body reflection and zero diffuse tail apply to both banks. The earlier reductions to jump and touchdown level are preserved.

Validation: 26 focused tests pass across the audio catalog, actual PCM attack timing/levels, footstep cadence, wet/dry blend, courtyard exclusion, weather rendering state and environment audio. The browser fixture also checks both materials in Chromium and WebKit, including full storm, blended onset, drying floor, dry chapter and rewind; paired material gains must stay within the existing dry voice ceiling.
