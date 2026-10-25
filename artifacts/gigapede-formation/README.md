# Coordinated Gigapede trio

The actual three-Gigapede spawn at 259 seconds now establishes persistent flight slots. The snakes fan out into sectors 120 degrees apart and use height lanes four units apart. Only one member reserves an approach/pass at a time. Waiting members remain in continuous flight around moving staging targets outside the player area. Least-recently-used attack priority prevents starvation; dead members release their reservation and survivors keep their slots.

A planner runs before any enemy moves. It projects each head 0.8 seconds ahead and queries continuous spans of the other living Gigapedes' body trails, including armor whose crystal has been destroyed. Nearby spans add bounded steering corrections. This is predictive soft avoidance, not a hard no-intersection guarantee. The movement integrator retains constant forward speed, limited turn acceleration and distance-sampled tails: no positional separation impulses or body resets.

`trio-before-after.mp4` compares independent flight (left) and coordinated flight (right) using the actual scheduled 4:19 spawn, seed 29, stationary player and the same fixed camera. Labels identify each head and its current flight stage. The review isolates the trio from later scheduled enemies, uses invulnerability, and skips unused Drake swarm batches in the capture harness. No Drake implementation is modified.

In the 32-second browser capture, the baseline had 800 simulation ticks with multiple simultaneous committed passes; the coordinated trio had none. Sampled body-point pairs less than two units apart after 15 seconds fell from 2,283 to zero for this capture. See `browser-report.json`.

A separate 90-second comparison of the same seed sampled every quarter-second after 15 seconds: close body-point pairs fell from 10,608 to 33 (about 99.7% fewer), while all three snakes repeatedly attacked. Occasional later crossings remain possible; these are controlled simulation measurements, not a claim of perfect collision separation or completed combat balance.

Validation: production build and 57 targeted tests covering the actual trio across three seeds, stationary and circling targets, head/tail displacement continuity, bounded trails, removal of one member, array-order-independent planning, solo replay files/backward seeks, and crew checkpoint/replay playback and transfer. The isolated browser capture reported zero errors.

New solo recordings save `gigapedeFormation`; new crew checkpoints save `legacyGigapedeFormation: false` and the persistent group state. Missing flags keep historical independent flight. The scheduled count and time, health, gems and forward speed are unchanged. One or two unassigned Gigapedes retain their existing solo movement; an established group keeps coordinating after a member dies.
