# Studio horror sound replacement — 17 October 2026

The first generic arcade/CC0 set was rejected by the user and is retired. The active bank uses professional studio material from Sonniss GameAudioGDC: 175 compatible runtime cues/tracks, based on 40 professional source recordings plus the five CC0 countdown words and CC0 courtyard whistle. Effects retain attacks and texture at 48 kHz. There are no arcade oscillator layers. Soundscapes use cinematic stereo recordings instead of the earlier music loops.

Studios: David Dumais Audio, Shapeforms, Bluezone, 344 Audio, Just Sound Effects, Rogue Waves, TheWorkRoom, Pole Position Production and Systematic Sound. The governing Sonniss GDC license permits free royalty-free commercial game/media use; these sounds are not CC0 and cannot be redistributed as a standalone sound library, pack or project template. Raw recordings remain private and ignored by Git. Edited cues ship as parts of this game. Runtime credits and terms are in `public/assets/audio/remake/LICENSE.md`.

Sources, source hashes, excerpt byte ranges and recipe mappings are in `assets/provenance/remake/audio/`. Only 51 selected files/excerpts were acquired, of which 40 are used. No full Sonniss archive or torrent was restarted. Larger sources were acquired as selected 30-second PCM excerpts. Local excerpt hashes are explicitly distinguished from full-original hashes.

Runtime payload: **35,597,405 bytes**, prioritizing fuller-bandwidth effects over the previous smallest-payload goal. The extracted game's audio and unlicensed countdown remain excluded from runtime and production.

## Preview

Open `index.html` through the dev server. `enemy-chatter-gameplay.webm` is a 66-second capture of all 22 types moving across the listener, using the actual renderer and positional mixer. Its report records 3,856 rendered frames and no audio load failures or extracted-audio requests. The earlier 18-second combat capture remains in `studio-gameplay.webm`. Studio sounds are previewed inside synchronized game footage instead of a standalone sample catalog.

## Validation

- Full unit suite: 559 passed.
- Build passed; existing large-bundle warning remains.
- Audio browser: all 175 files decode; all 22 enemy paths, weapons, positional effects, priority caps, throttling, retries, pause/release/death and rendered mix checks pass.
- WebKit: all 175 files decode; stereo AAC playback passes after a gesture.
- Menu cues, both soundscapes, volume/mute/hidden behavior, entrance flow, controller/touch UI and synchronized countdown checks pass.
- Source and runtime SHA-256 verification passes.

Rebuild with `python3 tools/build-remake-audio.py`; verify with `--check`. Retrieve missing private originals with `python3 tools/import-studio-audio.py --download-missing`, which uses only recorded selected URLs/ranges. `npm run test:remake-audio` runs audio validation. `node tests/studio-audio-gameplay-browser.mjs` captures new game footage; `python3 tools/create-remake-audio-preview.py` refreshes its page.

## Enemy localization pass

All 22 kinds have explicit recorded acoustic identities, documented in the recipe metadata: source layers, articulation timings, spectral windows and gains. Bluezone transmission and analog organic recordings plus TheWorkRoom insect foley extend the current studio source selection. No added reverb is used on chatter. Each mono loop maintains a quiet body texture between its identifying calls.

The positional mixer protects the eight nearest threats, reserves voices by enemy kind and bearing, retains marginal voices to reduce switching, and bounds the pool to 28. Repeated kinds receive crowd balancing; sources fade out between 72 and 96 units. Living pede segments near the player anchor their creature's source. Arena ambience ducks when an enemy approaches within 12 units. Existing loop levels now update smoothly.

`tests/enemy-audio.test.ts` covers signatures, dense swarms, selection continuity and living segment anchoring. `tests/enemy-spatial-audio-browser.mjs` renders each signature through the actual HRTF panner and listener setup: left, right, 180-degree head turn and distance, 88 passing checks in `spatial-audit.json`. These establish correct software positioning; perceived front/back and elevation depend on the listener and headphones.

`node tests/enemy-chatter-gameplay-browser.mjs` records all 22 types in the actual game renderer and positional mixer.


## Recorded chatter replacement

The four-second periodic studio chatter described above has been replaced.
See `../../CHATTER_SOUND_DESIGN.md` for the current eight CC0 sources, 24 longer
performance loops, mastering, crowd balance, build commands and validation.
`enemy-chatter-gameplay.webm` now captures this new bank.
