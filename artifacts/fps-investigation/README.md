# FPS investigation — 14 October 2026

The current counter measures animation callbacks over 500 ms. Controlled cadences of 30, 37, 45, 52, 60, 90 and 120 FPS all returned the expected values.

Chrome on this machine delivered approximately 30 callbacks per second on an empty `about:blank` page in both headless and visible fresh sessions. The current game also remained at 30 FPS with low quality and volumetric mist disabled. This demonstrates a browser/display pacing limit in the test environment independent of game rendering. It does not establish the precise Chrome setting or explain when that limit started.

macOS Low Power Mode was off. Chrome Energy Saver remains unverified: browser tooling blocks access to the Chrome settings page. Google documents that Energy Saver reduces display refresh rate: https://developer.chrome.com/blog/memory-and-energy-saver-mode

## GPU comparison

See `gpu-profile.json`. Measurements used Apple M1/ANGLE Metal, a 1440×900 CSS viewport, device pixel ratio 2, a fixed scene containing 120 enemies, and WebGL disjoint GPU timer queries. High quality rendered at 1600×1000; low quality at 1440×900. Each block discarded 15 warm-up frames and measured 30 frames. Current rendering was measured before and after the two comparison modes. These are render timings, not a complete end-to-end simulation benchmark.

High-quality arena GPU median was 9.4–10.6 ms with mist and 3.8 ms without it. High-quality entrance GPU median was 11.3–13.3 ms with mist and 6.6 ms without it. Some mist-enabled high-quality p95 timings exceeded the 16.7 ms budget for 60 FPS. Mist is a substantial new GPU cost and can contribute to missed refreshes, but cannot explain the blank-page cap.

Replacing the current sky with the saved baseline sky while disabling mist showed no consistent GPU improvement. This comparison isolates the sky only; it is not a complete comparison with an earlier checkout.

No gameplay or graphics defaults were changed during the investigation.

## Trainer slowdown fix — 16 October 2026

The trainer previously performed armor queries for every eligible target before
applying its FOV filter, including when aim was disabled. Dense scenes amplified
this work with each additional enemy and armored tower. Resolution scaling then
reduced image quality without addressing that CPU cost.

The fix applies the aim circle before geometry queries, checks distance/health/threat
candidates in order until a clear target is found, and culls armor that cannot
intersect the firing ray. Disabled/suspended/unfocused/expired aim does no armor
queries. Crosshair selection still ranks resolved damage points. New runs also
reset adaptive resolution and its counters.

Run `node --import tsx tools/profile-trainer.ts` for the controlled CPU comparison
with revision `146f872`. Results are in `trainer-profile.json`. At 60° FOV, median
scan cost fell from 132.0 to 2.4 ms for 600 skulls and 8 towers, and from 627.5 to
3.2 ms for 1,500 skulls and 20 towers. Selected targets matched the reference in
these fixtures. These are target-scan timings, not complete game frame rates.

Regression coverage includes early FOV culling, disabled aim, blocked-target
fallback, held locks, crosshair ordering and primary/homing hits on all three tower
types. Another 576 geometry queries matched the unculled reference, with mesh
queries reduced from 1,547 to 479. Browser checks covered a real kill, reconnect,
reload, clean detach, and resolution recovery from 0.625 to 1.25 pixel ratio.

Restart the trainer to load the updated injected adapter. The game-side resolution
reset requires serving the updated game build.
