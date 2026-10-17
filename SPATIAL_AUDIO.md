# Spatial sound mix

World sounds use Web Audio HRTF panners with full XYZ positions and camera
orientation. Inverse panner attenuation alone never reaches silence. Each
positional voice therefore also has a dedicated distance gain, updated when
its emitter or listener moves. That gain fades smoothly over the outer half
of its hearing radius and reaches exact zero at the boundary. Distant cues
are rejected before decoding, cooldown changes or voice allocation.

`src/spatial-audio.ts` defines the hearing profiles and chatter trims:

- Small enemy chatter: 22–40 arena units depending on creature.
- Towers and large creatures: 40–64 units.
- Buried centipede: 24 units.
- Loose gems: 18 units; flying homing projectiles: 26 units.
- Movement, pickups, ricochets and armor contacts: 24 units.
- Spawn, death and explosions: 56 units.
- Remote weapons and other world cues: 40 units.

Enemy chatter trims compensate for measured recording RMS, keeping distinct
creature dynamics and modest threat-tier differences. Sustained effective
chatter RMS is about 0.008–0.018 before crowd scaling, distance and master gain.
Selection preserves nearby threats, creature diversity and bearings within
28 voices. Long creatures sound from the nearest surviving body segment.
All proximity selection uses the camera listener, including spectator mode.

Local weapon, movement and collection feedback retain their direct attack,
with parallel room sends. Interface, countdown and music stay dry. Other players' cues, courtyard goals,
impacts, enemies, gems and projectiles use the spatial graph. Inaudible remote
streams neither consume active loop voices nor duck nearby impacts. Spatial
impact cooldowns are separated by area, while enemy damage retains per-enemy
cooldowns. Expired cooldowns are pruned during gameplay.

Validation:

- `npx tsx --test tests/audio.test.ts tests/enemy-audio.test.ts tests/spatial-audio.test.ts`
- `node tests/spatial-cutoff-browser.mjs`
- `node tests/enemy-spatial-audio-browser.mjs`
- `node tests/audio-browser.mjs`
- `npm run build`

Browser checks require the Vite server on port 5173. The cutoff test exercises
all runtime cue names, renders the actual playback graph offline to verify
digital silence, and checks moving listeners, spectator selection and remote
mix ducking. The directional test checks all 22 enemy signatures for left,
right, head-turn and inverse-distance response. These checks verify routing
and signal behavior; perceived loudness still depends on playback equipment.

## Arena reverb

`src/arena-reverb.ts` supplies two shared stereo convolution returns: a short
0.48-second body with 9ms pre-delay, and a darker 1.75-second tail with 27ms
pre-delay. Staggered early reflections and a smooth diffuse onset keep the
attack readable. High-pass and low-pass filters keep low rumble and bright
splash out of the return. Responses are generated once per audio context;
voices share the two processors instead of allocating individual convolvers.

Sends are authored by catalog role. Spawns, burrows, transformations, death
and explosions receive the most space; movement and contacts favor the short
body. Continuous firing, drones, ambience and loose gems use restrained sends
to avoid accumulating a wash. Spatial sends follow both HRTF and distance gain,
so inaudible emitters cannot excite the room. Existing reflections decay
naturally when an emitter leaves range. Both returns feed the SFX master and
limiter. Clearing a run stops voices and replaces the convolution returns to
discard all old tails; pause suspends the complete audio context.

`node tests/arena-reverb-browser.mjs` renders the actual mixer offline and checks
decay, clear, master mute, dry countdown routing and sample-sequence headroom.
It writes `artifacts/arena-reverb/dry-then-reverb.wav`: the same nine-second
sequence twice, dry first and with reverb after a half-second gap.
