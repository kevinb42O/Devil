# Sound balance — 25 October 2026

Runtime trims live in `src/audio-mix.ts`. They apply before direct and reverb
paths, leaving the mastered source assets and their provenance intact.

- All gem pickups: +6 dB. Crystal hits: +6.2 dB. Breaks: +6.6 dB.
  Loose-gem chatter: +7.2 dB, retaining its six-voice and distance budgets.
- Dry and wet footsteps: +14 dB, retaining movement cadence, material blends,
  positional attenuation and idle/airborne silence.
- Sustained fire: +2.9 dB. Shotgun: −4.4 dB. Upgrades: −5.2 dB.
- Environment: −3.1 dB at rest, −8 dB during firing or nearby threats, with
  a quick smooth reduction and a slower recovery.
- Repeated enemy deaths, spawns and explosions attenuate new overlapping
  voices. Homing-flight loops share a constant squared-gain budget.

`audit.json` records browser-rendered output at the default 55% master volume.
Dry footstep attacks sit 8.6–12.1 dB below sustained fire; wet attacks sit
8.5–19.8 dB below it. Pickups sit 5.8–7 dB below fire. Crystal hits sit
3.2–3.5 dB below it. These compare source output before positional falloff;
distance, spectral masking, speaker response and hearing affect perception.

Verification: `node tests/audio-mix-browser.mjs`, `node tests/gem-audio-browser.mjs`,
`node tests/footstep-audio-browser.mjs` (Chromium and WebKit),
`node tests/hand-upgrade-audio-browser.mjs`, `node tests/audio-browser.mjs`,
32 targeted audio unit tests, and `npm run build`.
