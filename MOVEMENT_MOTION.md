# Movement presentation

Movement motion is independent of impact Screenshake. Its default is 60%; new
preferences with reduced motion start at 0%. Explicit saved preferences win.
Standing still has no invented idle oscillation. Existing weapon recoil is separate.

`src/movement-motion.ts` owns the movement pose. The renderer samples it once per
frame and supplies the same arm translation/rotation to the weapon before socket
projection. The complete camera translation, including impacts, is included in the
existing local projectile launch correction. Daggers join their physical trajectory
after the existing 100 ms transition. No movement, aiming, collision, network, or
replay simulation data is modified.

## Motion vocabulary

- Ground gait advances from integrated horizontal player velocity: 4.8 metres per
  full arm swing. Running increases cadence and strength. Ground contact and speed
  have separate smooth envelopes. Sampled simulation time drives the stride even
  when a slow frame caps the presentation dt.
- Jumping freezes gait phase and fades out camera bob. The arm continues responding
  to vertical velocity and the velocity change at takeoff and landing.
- Acceleration and braking compare actual player velocity against a smoothed velocity.
  Critically damped springs provide trailing movement and settling without oscillation.
- Strafing adds a directional arm lean. Turn and vertical look rates add bounded arm
  sway; yaw wrapping uses the shortest angle. Rotation is composed in view space
  before the imported arm rest orientation, so turns trail in the correct direction.
- Camera motion is small positional bob and fore/aft inertia. Camera rotation and FOV
  remain controlled by the original game; no horizon roll or mouse smoothing is added.

At 100%, movement has hard bounds of 1.2 cm camera displacement, 2.6 cm arm
translation and 0.065 radians arm rotation. The combined impact + movement camera
translation is bounded to 4 cm. Most samples are substantially below those bounds.

## Discontinuities and perspectives

Position corrections do not supply acceleration or gait distance. Small corrections
cannot create artificial steps. Large teleports and presentation gaps over 250 ms
reset the pose. Pause leaves the pose and angular history exactly frozen. Respawn,
player changes, replay seeks, backward time, hidden tabs, menus, spectators, top-down
and death analysis reset or suppress movement. Courtyard walking uses the same
camera presentation with combat impulses suppressed. Dead players do not keep gait
running. Crew replay supplies playback-scaled dt.

## Verification

Run the development server, then `npm run test:movement`. The unit tests cover
idle, cadence, 30/60/144 fps agreement, airborne suppression, braking, reversing,
yaw wrap, pause, invalid dt, corrections, teleports, reduced intensity, bounds and
simulation immutability. Browser tests check actual camera/arm transforms, 88 socket
cases across levels/FOVs/aspects, setting independence, spectators, courtyard motion,
aim preservation and draw calls. Results and a rendered frame are written to
`test-results/movement-motion/`.

`npm run test:feedback` additionally covers the independent settings UI, a further
396 launch-alignment cases and real solo replay pause/seek/resume controls.
`node tests/preferences-browser.mjs` verifies both preferences survive a browser
restart. `npm test` and `npm run build` run the broader checks.
