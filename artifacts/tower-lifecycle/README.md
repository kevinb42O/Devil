# Spit rotation and death spin

`spit-and-death.webm` captures the actual game renderer. The three creatures wind up and release their first enemy stream, continue moving, then are killed at 4.2 seconds in the clip. Death accelerates their spin and sinks their full bounds below the arena over two seconds.

Death spin/sink was already implemented and has been verified on the current creature models. Spit rotation is new: a 0.4-second reverse wind-up, a full turn over 0.85 seconds (1.05 seconds for tier III), a small overshoot, and a 0.35-second recovery. Idle axial rotation continues underneath. The integrated angle accumulates full turns and does not snap between cycles. The historical low-target tower path retains its old yaw rule.

The shared `enemyYaw` applies the turn to rendered anatomy, crystals, armor queries and spawning outlets. Match-age evaluation is deterministic across pause and seek. No spawn timing changes.

Validation:
- 31 lifecycle, tower, projectile, movement, clearance and Drake regression tests passed.
- Existing death browser test passed for all tiers: acceleration, complete sink, cleanup, pause and reset.
- 12,130 browser rays matched the animated armor and impact normals.
- Lifecycle recording: target position error below 4e-15, no page or shader errors, all three death animations removed at completion.
- Production build passed with the existing bundle-size advisory.
