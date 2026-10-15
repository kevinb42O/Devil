# Polish and reliability pass

- Changed default target selection to nearest distance. Hittable tower crystals retain priority; blocked crystals yield immediately. Distance selection ignores lock bias and minimum hold time, and ordinary nearby enemies outrank farther non-tower weak points.
- Applied real armor obstruction checks to both primary and homing aim, including intervening towers with destroyed crystals. Rechecked predicted crystal rays so leading an exposed edge cannot aim back through armor.
- Added regression coverage for occlusion transitions across all three actual tower meshes with both weapons, immediate distance switching, and blocked prediction fallback.

- Added validated Precision, Smooth, Survival and Minimal presets, versioned configuration import/export, 22 per-enemy aim filters, aim cone/range, selection modes, prediction horizon, lock preference and rate-limited tracking.
- Rebuilt native settings into Aim, ESP, Targets and Connection tabs with explicit Apply and defaults.
- Added health bars, readable labels, distance, off-screen arrows, intercept markers, corner boxes, colors, opacity, sizing, HUD placement and independent ESP/HUD toggles.
- Corrected stale motion history across new World instances and reused IDs.
- Cleared physical fire latches on lost focus, visibility or pointer capture; ignored unrelated or unsolicited mouse releases.
- Prevented unavailable homing input from activating aim or choosing the wrong prediction speed.
- Guaranteed the original animation callback executes even if the trainer throws. Projection errors are isolated from aiming.
- Separated aim eligibility from ESP visibility, including armored, inactive and excluded targets.
- Moved camera projection out of the aiming frame and avoided recomputing targeting on unchanged control polls.
- Fixed browser zoom/Retina coordinate conversion and mixed-display placement.
- Cleared stale ESP on disconnect, added reattachment without browser restart, detached debugger sessions, and closed managed browsers on startup/shutdown failures.
- Added atomic settings writes with rollback, corrupt-file warnings and a single-instance lock.
- Reserved trainer function keys using a native event tap so Chrome does not also handle them. Other applications' ordinary function keys remain available.
- Added regression tests for these cases, real game simulation damage tests, live browser reattachment/reload checks and native UI rendering QA.

Game source and assets were not edited by this pass. The adapter still requires the existing diagnostic surface in the local development build.
