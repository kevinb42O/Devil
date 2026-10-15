# Impact and movement feedback

The Screenshake setting controls impact camera impulses. It defaults to 35%, or 0%
for a new user requesting reduced motion. Movement motion is a separate preference
(default 60%, or 0% with reduced motion); see MOVEMENT_MOTION.md.
An explicit saved preference takes precedence. Existing hand recoil and weapon
flashes remain available at 0%.

## Event policy

- Local burst: short backward kick. Stream shots retain hand recoil only.
- Local land: vertical compression, with the two existing landing strengths.
  Jump events do not add a second camera impulse during shotgun jumps.
- Local upgrade: one brief vertical response alongside existing hand and ground effects.
- Explosion, centipede emergence, and selected large kills: bounded nearby response,
  with squared distance falloff and no response at or beyond 22 metres.
- Death: brief push away from a known contact body. Missing contact data creates no
  invented directional impulse. Spectator and death-analysis cameras stay stable.
- Ordinary hits, pickups, spawns, stream shots and ricochets create no camera impulse.

`camera-feedback-tuning.ts` stores durations in seconds and amplitudes in metres at
100%. `CameraFeedback` owns five reusable impulse channels and a bounded identity
cache. Simultaneous impulses share a four-centimetre maximum at 100%; at the default
35%, the maximum is 1.4 centimetres. The camera never rotates or changes FOV in
response to these effects. Existing hop FOV feedback is independent.

The renderer restores the interpolated base camera every frame before applying the
world-space offset. The hand pose is updated before calculating socket projection.
The same camera translation is included in the local dagger's existing visual
launch correction, which fades into the authoritative trajectory after 100 ms.
Projectile lighting shares that visual trajectory. Physical projectiles, input,
collisions, simulation state and replay formats are unchanged.

Movement uses grounded gait, critically damped arm inertia and bounded turn sway,
without an idle oscillation. Damaged attached crystals use a small local compression and rebound;
this preserves their centres, shared materials and existing damage flashes.

## Lifecycle

Camera impulses freeze when presentation dt is zero. Solo replay pause now passes
zero dt, like gameplay pause. Crew replay supplies playback-scaled presentation dt.
Seeks clear transient impulses, hand recoil, muzzle flashes, particles and ground
pulses rather than retaining effects from the previous timestamp or replaying historical kicks. Player/life
changes, backward time, respawn, clear, lobby, menu, hidden documents, spectator,
top-down and death-analysis views reset or suppress feedback. A new life's first
event is queued after resetting the previous life.

Existing network prediction and event deduplication suppress authoritative echoes
of locally predicted shots and landings. The feedback layer additionally recognizes
shot keys and network event IDs. A teammate's personal effects never kick the local
camera. No additional network fields are required.

## Verification

With the Vite development server running on port 5173:

- `npm run test:feedback`: impulse invariants, browser lifecycle, real preference UI,
  moving-hand/translated-camera launch alignment across 396 socket cases, and real
  solo replay pause/seek/resume controls.
- `npm run test:movement`: movement invariants and full renderer integration.
- `npm test`: complete unit and simulation regressions.
- `npm run build`: TypeScript and production bundle.
- `node tests/weapon-launch-fov-browser.mjs`
- `node tests/weapon-fov-browser.mjs`
- `node tests/projectile-impact-browser.mjs`
- `node tests/preferences-browser.mjs`

Browser feedback results and a rendered frame are written under
`test-results/camera-feedback/`. The feedback browser check compares draw calls
with identical camera and quality settings. Development diagnostics expose
`window.abyss.cameraFeedback` and `window.abyss.handFeedback` for inspection.
