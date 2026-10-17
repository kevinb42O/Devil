# Supernatural weapon sound design

The first ballistic pass and the subsequent bass-heavy pass have been superseded by the primal vocal revision. **No firearm, shotgun, rifle, mechanical cocking, explosion or predesigned sci-fi weapon recording is used in the authored weapon cues.**

`python3 tools/build-weapon-audio.py` creates the bank from foreground lion/creature vocals, original procedural synthesis and transformed organic recordings. Run it after `tools/build-remake-audio.py` when rebuilding everything. `--streams-only` rebuilds only the primary and homing continuous fields. Source recordings stay in the ignored private studio directory; edited cues ship in the game. Source URLs, hashes, licenses and per-cue recipes are preserved under `assets/provenance/remake/audio/`.

## Reference direction

The original Devil Daggers files in the workspace were inspected for spectral distribution and timing. They are never read by the sound builder and are not part of its generated sounds. `artifacts/weapon-audio/reference-analysis.json` holds measurements. The useful reference characteristics are low rough pressure, dark midrange, irregular continuous streams, and a long continuous pressure/air decay following the burst attack. Original regular bursts have roughly 50% of their energy by 75–162 ms and 99% by 0.8–1.1 s. Original regular streams concentrate much of their energy below 500 Hz, with more upper resonances in the later hands.

The primal revision uses an exposed roar, a lower chest double and a separate screaming voice as the foreground. Original glottal pressure supports the weight underneath. A short dry snarl supplies the opening bite, followed by the natural open-mouth vocal and a shaped exhalation. Streams use continuous spectral resynthesis across a 24.1 second field. The vocal recordings supply timbre only: original phrase timing, attacks, syllables and breathing envelopes are discarded. Streams use full-length filtered stochastic fields with broad spectral envelopes from the source voices. There are no grain hops, synthesis frames, glottal oscillators, pulsed excitations or syllables. Independent fields blend with slow, nonperiodic equal-power changes. Raw texture layers are resynthesized too, so they cannot reintroduce recognizable calls. Fixed 13 Hz pulsing and phrase-level amplitude LFOs are removed. Stereo-linked flow leveling smooths remaining loudness dips; a broad cut in the localization band leaves room for enemy cues; new holds begin at random points in the field. Bursts keep their full 1.22 second decay.

| Hand | Identity | Foreground layers |
| --- | --- | --- |
| I | Cinder | Designed lion roar, hunter chest, gibbon scream |
| II | Feral | Bear throat, field-recorded lion, creature snarl |
| III | Hex | Hunter scream, monster chest, banshee edge |
| IV | Abyss | Large-monster roar, lion double, lower banshee |
| V | Rift | Field-recorded lion and hunter on separate hands, gibbon layer |
| VI | Tyrant | Large-beast throat, bear double, creature call |
| VII | Eclipse | Lion, large beast and banshee chorus |

The lion field recording is by Bidone and the designed lion roar is by Podcapocalipsis, both CC0. Details and original source links are in [the primal source notes](assets/provenance/remake/audio/primal/README.md). Existing bear/creature sources retain their Sonniss provenance.

Mastering includes removal of quiet room tone, low-mid carving, presence shaping, oversampled parallel saturation, selective de-essing and stereo diffusion. A second oversampled peak-shaping stage prevents a single sharp vocal spike from turning down an entire loop. Normalized RMS and bounded peaks keep the hand designs consistent while retaining their different formants and envelopes. Early reflections stay quiet enough that the dry vocal remains immediate.

These are internal audio design names. Progression/gameplay is unchanged.

## Runtime behavior

71 stereo cues (14 continuous stream fields plus the existing burst/attack/release cues): seven primary loops, seven homing loops, 36 burst takes, seven trigger attacks, seven release tails and seven homing blasts. Each hand has five regular burst choices (six at IV), excluding immediate repeats. Per-shot take pitch variation is ±0.9%; later tiers have independent waveforms at native pitch.

Twin hand channels have independent excitation, articulation and texture processing; low weight is centered. Homing emphasizes the airy serrated edge. Stream trigger attacks are short and restrained; release produces a brief dying exhalation. Death, pause and restart cancel voices without playing release tails. Current/next local hand and current crew hands prewarm. Remote weapons retain positional attenuation and their own hand sound. The existing master compressor and bounded voice budget remain in place.

## Verification and listening

- `npm run build`
- `npx tsx --test tests/audio.test.ts tests/enemy-audio.test.ts tests/shotgun.test.ts`
- `node tests/weapon-audio-browser.mjs` — Chrome/WebKit: every tier/mode, variation, stereo, headroom, loop boundary, release/clear, remote positioning, saturated voice budget.
- `node tests/audio-browser.mjs` — complete library decode, real event routing, offline output and existing lifecycle/combat regressions.
- `node tools/record-weapon-audio.mjs` — seven-hand game preview at `artifacts/weapon-audio/flow-seven-hands.webm`.
- `node tools/record-weapon-audio.mjs --sustained` — an uninterrupted hold long enough to cross a complete field wrap, at `artifacts/weapon-audio/flow-uninterrupted.webm`.
- View both through `artifacts/weapon-audio/flow.html` served by Vite. These filenames are new to avoid reusing the earlier preview media.

The browser audit checks the 95th/5th percentile envelope ratio over the full stream, guarding against large recurring vocal swells. It also measures the decoded stream through a 500–5000 Hz band, guarding against burying the vocals under bass. Signal checks establish technical behavior, not subjective sound quality. The revised synchronized gameplay preview is the listening reference. Sonniss source authors retain authorship of their recordings; the new design combines those licensed organic textures with original procedural synthesis for this game under the existing [GDC license](https://sonniss.com/gdc-bundle-license/).

## Arena mix revision

The sustained weapon bed now targets 0.18 file RMS with gains 0.07 (primary) / 0.06 (homing), roughly 16 dB below the earlier 0.205 RMS / 0.39 primary mix. Burst gain is 0.36 instead of 0.66 (about 5 dB lower). Start/release gains are 0.09/0.06. Nearby threats reduce the sustained weapon gain by up to a further 3.8 dB with smooth changes; their own gains remain unchanged. Remote streams share a bounded, quieter mix so crew size cannot bury the arena.

Continuous armor, damage, ricochet and piercing cues are reduced while anyone is sustaining fire. The previous armor cue could retrigger every 80 ms and create an audible rattle over a continuous stream. Single-attack feedback retains its regular balance. This policy applies to local and remote sustained fire.

Additional checks:

- `python3 tools/audit-weapon-flow.py`: all 14 sustained fields, short-window loudness continuity and 4–45 Hz narrow modulation spurs.
- `node tests/weapon-mix-browser.mjs`: render each hand against four close spatial threats through the actual HRTF routing; measure the enemy localization band against the weapon bed and confirm shooting never ducks enemy chatter.
- `node tools/record-weapon-audio.mjs --mix`: arena-only lead-in, 27 seconds of sustained fire, then release, with nearby enemies throughout. The current recording is `artifacts/weapon-audio/balanced-arena.webm`.
- `node tools/record-weapon-audio.mjs`: the quieter seven-hand comparison is `artifacts/weapon-audio/balanced-seven-hands.webm`.

Use the new `balanced.html` preview. Earlier revision previews are retained as work artifacts but redirect to the current listening page.
