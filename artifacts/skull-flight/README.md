# Skull flight polish

The production instanced skull renderer now applies flight pitch, damped heading, turn banking, acceleration response, and short hit recoil. Tiers I–III have distinct response times and motion limits; Hollow variants retain their pose through transmutation and use quieter secondary motion. Drakes retain a grounded attitude with modest turn lean.

Flexible appendages use a stable individual phase and delayed turn/acceleration response. Facial anatomy stays rigid. Instance data survives batch growth without a frame of reset motion. No extra per-enemy mesh, material, or draw call is introduced.

`comparison.mp4` shows rigid heading beside the shipping controller, using identical controlled positions and velocities through the actual combat instance renderer. It is an animation comparison, not a recording of player input. `comparison.png` is decoded from that video. `turn.png`, `climb.png`, and `recovery.png` capture individual poses. `gameplay.png` comes from a separate eight-second simulation with two emitting towers, moving player input, live skull pursuit, a surviving hit, and a grounded Drake.

Verification:

- `npx tsx --test tests/skull-motion.test.ts tests/enemy-contact.test.ts tests/tower-clearance.test.ts tests/tower-spawning.test.ts tests/drake-movement.test.ts`: 31 tests passed. Includes matching complete simulation checkpoints with and without presentation sampling, plus angular signs, wraparound, frame-rate convergence, rapid hits, pause, seeks, world replacement, teleports, and transmutation.
- `node tests/skull-motion-browser.mjs`: real instance matrices, shader compilation, frozen duplicate renders, reduced motion, real tower launch/descent and hit scenarios, ground attitude, all 1,000 dense-swarm instances, motion data through capacity growth, and cache cleanup. Detailed values are in `report.json`.
- Existing `skull-redesign-browser.mjs`, `enemy-contact-browser.mjs`, `multiplayer-presentation-browser.mjs`, and `camera-feedback-replay-browser.mjs` passed.
- `npm run build` passed. Vite retains its existing large-chunk advisory.
- Impeccable's mechanical detector returned no findings for the changed rendering files.

Performance evidence: the dense fixture renders all 1,000 skulls in 16 scene draw calls and roughly 1.26 million triangles; each skull kind remains one draw. The browser report includes interleaved CPU submission timings with the controller enabled/bypassed, using the same shader and instance attributes. These timings fluctuate across runs and are not a GPU frame-time or original-build benchmark; they do not establish the plan's less-than-5% total-frame-time target. Spring decay coefficients are shared across each tier to reduce per-enemy work.

Replay seeks intentionally seed from the destination velocity and neutral bank. They never retain a future pose, but do not reconstruct the exact cosmetic spring history before a seek. Positions, steering, hit volumes, damage, targeting, RNG, and replay/network formats are unchanged.
