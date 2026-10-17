# Recorded creature chatter — 17 October 2026

The rejected bank sequenced very short studio cuts into regular four-second
patterns. The replacement uses eight new CC0 recordings and 24 authored loops:
one signature for every one of the 22 enemy types, plus wounded-orb and buried-pede
variants. The aim is Devil Daggers' close, dry, disturbing creature presence.
The original game's extracted recordings are not used in these edits.

## Sound direction

- Skulls: performed jaw clicks, nasal animal-style chatter, serrated breath and
  deeper rasp as the threat increases. Transmuted versions have different cuts,
  phrasing and spectral weight.
- Squids: intact recorded gargles, preserving wet vocal articulation and hollow
  low-mid resonance. Larger towers have slower, longer throats.
- Spiders: mandible clicks and close teeth foley; spiderlings skitter higher,
  gigaspiders have slower, heavier shell movement.
- Pedes: real teeth chatter becomes rolling segmented bone; heavier variants
  slow and darken the carapace, with a separate muffled underground treatment.
- Leviathan: long, low chest rasp. Orbs mutter and gurgle. Eggs breathe quietly.

Whole source gestures retain their internal rhythm. Unequal rests and independent
quiet mouth/bone layers replace fixed pulse grids and generic sci-fi/insect beds.
Loop durations differ (5.47–15.83 seconds); each enemy receives a stable ±2.5%
pitch/speed variation and independent starting phase. No added reverb spreads
these mono sources away from their HRTF position.

Gentle parallel saturation reduces brittle transient dominance. Mastering limits
peaks to .76 and calibrates actual sustained level, including runtime gain, to
.00798–.01748 RMS before distance, crowd and master attenuation. The old bank's
per-cue runtime trims are neutralized. Same-kind crowds use equal-power balancing
(1.2 / sqrt(voice count)); the previous formula retained a .55 gain floor per
voice and let the noise floor grow with the crowd. Hearing ranges and the nearest
threat/type/bearing selection are preserved.

## Sources and reproducibility

See `assets/provenance/remake/audio/chatter/sources.json` for direct download URLs,
page URLs, creators, acquisition formats, licenses, byte counts and SHA-256 hashes.
Eight saved publisher pages document licensing. `public/assets/audio/remake/LICENSE.md`
contains runtime credits. Freesound files are published high-quality MP3 previews;
BigSoundBank files are original WAVs. Converting to 48 kHz PCM does not add detail
to a compressed recording.

- LucasDuff: insectoid monster clicking, Freesound 467700.
- JoBot__: Alien-Monster Vocal Sounds, Freesound 527226.
- Darsycho: monster snarls 4, Freesound 443404.
- CGVega: Chipmunk / rodent / rat / squirrel angry or chattering, Freesound 554043.
- PJ_Bear: monster_idle, Freesound 707685.
- Joseph SARDIN / BigSoundBank: Chattering teeth #1 (0789), #2 (2190),
  Tongue clicks (1038).

All eight are CC0 1.0. Selected source files are in `assets/_sources/chatter-audio/`.
Restore with `python3 tools/import-chatter-audio.py --download-missing`; verify
without downloading by omitting that flag. Rebuild only chatter using
`python3 tools/build-remake-audio.py --only chatter`. Detailed editorial cuts and
parameters are in `tools/chatter_design.py`, with per-cue metadata and source paths
in `assets/provenance/remake/audio/recipes.json`. The regular builder also uses
this replacement; it cannot silently regenerate the rejected four-second bank.

The 24 runtime WAVs total 21,754,656 bytes. They trade approximately 12.5 MB over
the four-second chatter bank for longer performances and less obvious repetition.

## Verification

- 22 targeted audio, enemy-selection and spatial tests pass, including a new
  regression for bounded same-kind crowd power.
- 88 browser HRTF bearing, head-turn and distance checks pass across all 22 kinds.
- Chrome audio lifecycle, rendered audibility and saturated voice-priority checks pass.
- WebKit decodes the complete current 245-file sound bank, with no extracted-audio requests.
- Source/runtime SHA-256 verification passes. All 24 loop seams have zero sample step.
- Production build passes, with the existing large JavaScript chunk warning.

`artifacts/chatter-redesign/mastering-audit.json` records levels, loop seams and
silence fractions. The updated 66-second gameplay capture is
`artifacts/remake-audio/enemy-chatter-gameplay.webm`. Playback in headphones is the
subjective acceptance check; software tests do not certify perceptual fidelity to
Devil Daggers or front/back HRTF localization for every listener.
