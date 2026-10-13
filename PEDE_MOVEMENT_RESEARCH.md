# Devil Daggers pede movement investigation

**Superseded for centipedes:** see [CENTIPEDE_RESEARCH.md](CENTIPEDE_RESEARCH.md) for the subsequent original replay analysis and head-led lifecycle implementation.

Investigated 13 October 2026. Target: distinguish the original enemies from the replica's recent eye-height pursuit regression. This is a sourced behavior audit and a limited regression repair, not a claim that original AI has been reconstructed exactly.

## What changed in this project

The working-tree contact changes added a new `updatePede` path that steers all three velocity components toward `(player.x, player.y + sin(age * .7) * .25, player.z)`. It replaced the previous independent vertical sweep `3.5 + sin(age * .7) * 1.5`. It also removed proximity-triggered centipede burrowing. Consequently a centipede/gigapede converged on a stationary player's eye height, and jumping changed its trajectory. The associated regression test explicitly demanded that pursuit kill a stationary player. Collision corrections and movement tuning were coupled unnecessarily.

The correction restores the previous independent vertical sweep while preserving the capsule contact system. Horizontal pursuit remains because sources explicitly describe it. Centipede proximity burrowing is restored after a short hunting grace period. Combat revision 5 records the correction; revisions 1–4 keep their former eye-seeking motion so saved runs still replay correctly.

## Evidence and version differences

1. [Sorath's official announcements](https://steamcommunity.com/app/422970/allnews/): the 19 February 2021 update fixed centipedes stopping when encountering ground/another enemy and getting stuck upside down. This establishes that original motion includes ground interaction and orientation behavior absent from our waveform approximation. The 26 October 2021 v3.2 update explicitly makes ghostpedes emerge with weak points facing the arena center. It does not publish steering coefficients, speeds, or an AI implementation.
2. [Braden's gameplay strategy guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258): first-hand scraping and kiting instructions describe manipulating centipedes and gigapedes through player movement. Its 2021 update explains that centipede AI became more like gigapede AI and no longer immediately burrows underneath the player. Older sections retain the earlier immediate-burrow advice; those sections must not be treated as current AI without the update note.
3. [Japanese gameplay guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1556601947): describes centipede roaming followed by charges and repeated burrowing; gigapede continuous pursuit with no deliberate burrowing; and ghostpede flight along the arena perimeter without directly attacking the player. Its centipede cycle reports roughly 15 seconds above ground and 10 seconds underground. Treat those cycle details as a version-sensitive observation rather than a recovered engine constant.
4. [DevilDaggers.info enemy reference](https://devildaggers.info/Wiki/Enemies): corroborates roughly three seconds before emergence, initial centipede idle flight followed by pursuit, immediate gigapede pursuit, and high circular ghostpede flight. Its centipede entry reports a 15-second surfaced interval and head proximity burrowing, without documenting the later grace period.
5. [Centipede wiki](https://devildaggers.fandom.com/wiki/CENTIPEDE): specifically describes upward/downward sweeping during pursuit, a post-v3.1 hunting grace period with ground bouncing/tangling, proximity burrowing afterward, and eventual automatic burrowing in roughly 10–20 seconds. This secondary account agrees with the version warning in Braden's first-hand guide, but does not supply an exact grace duration.

## Behavior by enemy

| Enemy | Before/after emergence | Player relationship | Vertical/body movement | Burrowing |
| --- | --- | --- | --- | --- |
| Centipede | Dust warning; emerges about 3 seconds after spawn; briefly flies idly | Eventually approaches/pursues the player | Sweeps up/down; current AI can bounce against ground and fold over itself | Timed return underground; approaching underneath can trigger it after the hunting grace period |
| Gigapede | Emerges about 3 seconds after spawn | Pursues immediately and continuously; can be led into scraping arcs | Long airborne arches; turning can temporarily put body/crystals through the ground | Does not deliberately retreat/burrow as centipedes do |
| Ghostpede | Emerges about 3 seconds after spawn, weak points facing arena center in v3.2 | Does not pursue or directly attack the player | Flies high in circles around the arena | No centipede retreat cycle documented |

The statement that all snakes must never follow the player conflicts with descriptions of centipedes and especially gigapedes. It correctly describes ghostpede flight. Pursuit does not justify replacing the whole motion with a point-seeking enemy that sticks to player eye height.

## What remains unmeasured

No original executable, original replay trajectory, or original AI source was analyzed during this investigation. Written guides cannot establish exact turn limits, flight speed, acceleration, pitch/roll, launch orientation, head/tail path propagation, burrow trigger geometry, or ground bounce response. Videos linked by guides are useful references, but are not frame-by-frame measurements here.

The replica still uses tuned speeds of 8/10 units per second, velocity interpolation at 1.8 per second, a three-second idle interval, the previous sine-wave vertical sweep, 1.3 × size body spacing, whole-body surface translation, a four-second retreat interval, and a simple ghostpede circle. These are replica constants, not validated original constants. The newly restored hunting grace period is provisionally three seconds; sources only establish that it is short. The four-second retreat especially conflicts with an older guide's ten-second underground report and needs original v3.2 replay measurement before replacement.

Therefore this repair removes a concrete regression and restores the prior sweep, but does not establish exact original movement. Matching the original requires extracting head/segment position and orientation from controlled original-game top-down/free-camera replays, including standing still, walking a circle, jumping, moving beneath the head during/after grace, and observing multiple emergence cycles. Fit constants from those measurements and validate unseen runs before describing parity as exact.

## Verification

Regression coverage checks that player altitude does not alter centipede/gigapede flight, ghostpede flight does not react to player position, centipede proximity burrowing respects the provisional grace period, visible body contact remains lethal, segment spacing remains coherent, and old/new combat revisions replay deterministically.
