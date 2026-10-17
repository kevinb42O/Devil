# Emergence sound design — 17 October 2026

The earlier three tower cues shared crushed rock and a musical string riser.
Most other arrivals shared a generic impact/monster recipe. The updated bank
uses 16 independently composed gestures defined in `tools/emergence_audio.py`.
The three towers have different primary materials, layering, timing and weight.
Other cues use recorded soil, shell, membrane, bodily strain, water and air.
There are no oscillators, arcade tones, string risers or explosion layers in
these 16 cues. Mono exports preserve the game's HRTF localization. No reverb
is added to these cues; any room character is inherent in the source take.

New internet selections:

- [TheWorkRoom Audio Post — Digging](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2021-2023+-+Game+Audio+Bundle/TheWorkRoom+Audio+Post+-+Digging): DIG002.wav (sand shovel), DIG043.wav (gravel shovel), DIG056.wav (garden fork scraping gravel).
- [Sonniss bundle license](https://sonniss.com/gdc-bundle-license/): Version 2.0, effective 27 August 2026. Used as synchronized game sound under the existing project's studio-audio licensing workflow.

Each new selection is a 16-second PCM excerpt beginning one second into its
source. Exact original URLs, byte ranges, format-preserving excerpt metadata,
retrieval date and SHA-256 hashes are saved in `pro/selected-sources.json` and
`sources.json`. Private recordings remain under the ignored studio-audio source
directory. Existing stone, tissue, ceramic, water and air selections retain
individual provenance. `recipes.json` records each cue's contributing sources
and identity; both runtime and asset manifests include its duration and gain.

Build only this bank with:

    python3 tools/build-remake-audio.py --only emergences

Verify with:

    python3 tools/build-remake-audio.py --check
    npx tsx --test tests/emergence-audio.test.ts tests/audio.test.ts tests/enemy-audio.test.ts tests/spatial-audio.test.ts
    node tests/emergence-audio-browser.mjs
    node tests/spatial-cutoff-browser.mjs
    node tests/audio-browser.mjs
    npm run build

Browser tests require Vite on localhost:5173. The emergence tests cover all 16
routes, physical source identity, spatial graphs, distant rejection, dust
exclusion, slow first downloads and cancellation on restart. Simulation tests
cover native and legacy entrances for all three pedes. An in-game tower video
can be regenerated with `node tools/record-emergence-audio.mjs`; it is a
synchronized gameplay preview, not a standalone recording pack.
