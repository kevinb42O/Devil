# Snake 2 sweeping flight

Gigapede now climbs, approaches, commits to a pass beyond the player's horizontal position, and pulls up before returning. Its lower yaw rate gives the heavy body wider turns. A committed pass retains its destination even if the player moves underneath; jumping does not change its altitude target. Head speed, body spacing, emergence and the distance-sampled trail are retained. Centipede and Ghostpede movement is unchanged.

Replica tuning, rather than a claim of recovered original AI: cruise target 13, pass target 8, yaw limit 0.8 radians/second, pass endpoint 16 units beyond the captured player position, recovery 1.5 seconds. The body is about 97.5 units long, so a broad portion of the trail can remain visible while the head turns beyond the platform.

`report.json` compares the old and new behavior in the same 60-second stationary-player scenario, sampling settled flight after 15 seconds. Old head height: 3.29–7.75, with 73.7% of samples below 7. New head height: 8.26–13.86, with no samples below 7. Maximum horizontal distance from arena center was 52.24 for the new flight. These are controlled simulation results; player playtesting remains the measure of combat feel.

`climb.png`, `pass.png`, and `recover.png` show the rendered scene at 5, 12 and 19 seconds respectively; the final image is already in the return approach following recovery.

Validation: `node tests/gigapede-sweeps-browser.mjs` (zero page errors), production build, and 52 targeted tests across gigapede sweeps, centipede movement, pede contact, Drake movement, solo replay import/playback and crew replay transfer/checkpoint playback. New solo recordings carry the `gigapedeSweeps` flag; crew checkpoints carry `legacyGigapedeSweeps: false`. Missing flags retain historical flight.
