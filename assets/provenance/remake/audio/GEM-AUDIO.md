# Crystal and gem audio

Retrieved 17 October 2026. These are edits of downloaded professional
recordings, with no AI audio generation or oscillator layers. Originals are
private working files under `assets/_sources/studio-audio/`. Runtime edits ship
only inside the game. Source URLs, sizes and SHA-256 hashes are recorded in
`pro/selected-sources.json`; exact runtime hashes are in the runtime manifest.

| Role | Recording / publisher | Runtime treatment |
| --- | --- | --- |
| Attached crystal hit | Bluezone Corporation, Broken Glass: `Bluezone_BC0274_glass_impact_break_small_014.wav` | One real small-glass contact trimmed to the first 180 ms before loose shards, three subtle speed variations, band limited 350–8000 Hz. No ceramic or added bell. Diffuse stereo reverb (550 ms reflection window, wet level .42), gain .36. Priority 3, 80 ms per-enemy cooldown, spatial reference distance 8 and maximum distance 48. Separate from destruction. Rebuild with `python3 tools/build-remake-audio.py --only gem-hits`. |
| Crystal disconnect / destruction | SKYES Audio / Chris Skyes, Shards Broken Glass (96 kHz): small bright crack, small window fracture and fine clinking shards; Raconteur Sound, Crystal Glasses: Tall Narrow Musical 01 (192 kHz) | Updated 18 October 2026. Immediate separation snap, three edited shard articulations and a restrained real crystal ring. 1.48-second mono cues, softened 3.8 kHz presence and preserved high-frequency detail. Shared arena reverb supplies stereo reflections after HRTF/distance attenuation. Gain .65, priority 4, reference distance 8, maximum distance 48. Rebuild with `python3 tools/build-remake-audio.py --only gem-breaks`. |
| Loose gem chatter | CB Sound Design, Dreamcatcher: `Enchanting_Bells_4.wav` | Crossfaded recorded shimmer with diffuse stereo reverb (1.45-second reflection window, wet level .65). Circular convolution keeps the loop seamless; follows the nearest six live gems within 18 metres, crowd gain normalized. |
| Gem collection | Rogue Waves, Druid Magic: `MAGElem_Water Spell Splash Attack Medium 2_RogueWaves_DruidMagic.wav`, with a trace of Bluezone ice fracture and a small CB Sound Design bell accent | Rounded liquid absorption with a short reversed intake, soft mineral contact and a quiet bell for clarity. Three non-tonal liquid articulations per family, one fixed bell recording at the same pitch on every pickup, diffuse stereo reverb (850 ms reflection window, wet level .55), deterministic overlap compensation and combat priority. No randomized pitch or gain. Gains .12/.125, a small lift over the quiet absorption pass and approximately 8.5 dB below the earlier .32/.34 pickup bank. |

Collection source: [Sonniss GameAudioGDC archive](https://sonniss.com/gameaudiogdc/).
Individual recordings were downloaded through the [GameSounds mirror](https://gamesounds.xyz/).
Publisher catalog directories: [Dreamcatcher](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2021-2023+-+Game+Audio+Bundle/CB+Sound+Design+-+Dreamcatcher+-+The+Sound+of+Dreams+%26+Magic)
and [Ice Cracking](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2021-2023+-+Game+Audio+Bundle/BluezoneCorp+-+Ice+Cracking).
Current pickup source: [Rogue Waves / Druid Magic](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2021-2023+-+Game+Audio+Bundle/Rogue+Waves+-+Druid+Magic).

[Sonniss license](https://sonniss.com/gdc-bundle-license/), version 2.0, effective
27 August 2026: synchronization and editing within commercial games permitted;
standalone sound redistribution and AI training prohibited. No bundles, torrents,
paid assets, or Freesound previews were acquired.

Rebuild: `python3 tools/build-remake-audio.py --only gems`.
Rebuild only pickup cues: `python3 tools/build-remake-audio.py --only pickups`.
Verify sources: `python3 tools/import-studio-audio.py`.
Verify runtime checksums: `python3 tools/build-remake-audio.py --check`.
Browser regression: `node tests/gem-audio-browser.mjs`.
Synchronized in-game preview: `node tools/record-gem-audio.mjs`.

## Crystal detach selection — 18 October 2026

Searched professional glass/crystal libraries and freely licensed recordings.
Selected original lossless studio masters from the 2017 GameAudioGDC selection:

- [SKYES / Shimmering Shards library description](https://www.asoundeffect.com/sound-library/shimmering-shards-broken-glass/): dry close glass, cracks, breaks and clinking fragments.
- [Selected SKYES source files](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2017+-+Game+Audio+Bundle/Chris+Skyes+-+Shards+Broken+Glass). Three mono 24-bit / 96 kHz originals.
- [Raconteur Crystal Glasses selection](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2017+-+Game+Audio+Bundle/Raconteur+Sound+-+Crystal+Glasses-+Tones+and+Drones). One mono 24-bit / 192 kHz original, recorded rubbed crystal rather than a synthesized bell.

Also considered [C_Rogers glass-shattering_04](https://freesound.org/people/C_Rogers/sounds/203372/?downloaders=1),
[Dasgoat Shimmer glass](https://freesound.org/people/Dasgoat/sounds/361704/),
and [newlocknew Atonal Crystal Chime](https://freesound.org/people/newlocknew/sounds/772279/).
The chosen masters give separate control over the physical fracture, fine
debris and actual crystal resonance, with no lossy preview dependency.
Only four individual recordings were downloaded, under the same verified
Sonniss game synchronization license as the existing studio bank.

The detach event remains distinct from ordinary crystal hits and gem collection.
No gameplay changes: exactly one protected positional cue at each detached
socket, including detachment on tower death. All three cues share a consistent
resonant identity; their fine shards vary, with immediate repeats prevented
by the existing cue selector. The old ice crack remains used only in the
separate pickup recipe.

Renderer: `tools/crystal_detach_audio.py`. Source hashes and URLs:
`pro/selected-sources.json` and `sources.json`; transformations: `recipes.json`.
Synchronized A/B game footage: `node tools/record-crystal-detach.mjs`.
