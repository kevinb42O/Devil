# Prelobby camera regression audit

Run `npm run test:prelobby-camera` to reproduce the checks and `jump.png` capture.

The first-person avatar keeps its collar at a stable offset from the physics eye. This removes the extra torso translation in the third-person jump/run clips while retaining limb animation, the simulation jump and the remote player's original pose.

The rig audit samples 720 standing, running, airborne and raised-arm poses. The rendered audit covers repeated jumps and landings at FOV 145, changing look pitch and heading, interpolation fractions 0/0.5/1, pit falls and return to spawn. It checks shoulder/near-plane clearance and that combat uses the original camera position. Measurements are saved in `audit.json`.

The neck unit tests cover frame-rate consistency, smooth return, exact neutral views, wall boundaries and climbing-block clearance. The wall limit follows the lean segment instead of pulling the camera inward when already at a boundary.
