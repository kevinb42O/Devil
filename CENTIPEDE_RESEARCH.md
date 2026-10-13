# First centipede: original-game research and implementation audit

Investigated 13 October 2026. This supersedes the centipede implementation conclusions in PEDE_MOVEMENT_RESEARCH.md. Target assumed: current Devil Daggers v3.2. **Exact 100% original parity has not been established.** The implementation now reproduces the observed lifecycle; some AI coefficients and cycle timings remain inferred.

## Stronger evidence obtained in this investigation

### Actual original replay data

Inspected [NoahStolk/ddinfo-core](https://github.com/NoahStolk/ddinfo-core) at commit `1d64444d9f31632a3c932657ad13d5b4693df729`, specifically the public test fixture [SquidSpiderCentiThorn.ddreplay](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/test/DevilDaggersInfo.Core.Replay.Test/Resources/SquidSpiderCentiThorn.ddreplay). This is a custom spawnset replay of about 10.95 seconds, **not a full Survival run showing the first 114-second spawn**.

An independent Python reader uses the repository's documented binary format and parser event sizes. It reads the local header, skips the two-byte ZLIB header, inflates raw event data, counts 60 Hz input events, and extracts centipede spawn/position/orientation/target records. It does not execute original game code or third-party parser code. Reproduce with:

```sh
python3 tools/analyze-centipede-replay.py /absolute/path/to/SquidSpiderCentiThorn.ddreplay
```

Saved output: `research/centipede/original-fixture-events.json`. Fixture SHA-256: `24ab1b63577dde8ac31be4609ad94bc5eef0aa60807291875d14cdfff97df325`.

The replay contains one centipede spawn, 18 position events, 18 orientation events and one target event. Its position records occur approximately every half-second, with extra records at a transition. There are no individual segment trajectories in this extracted evidence. The documentation identifies positions as signed 16-bit vectors; the repository's ReplaySimulationBuilder uses a divisor of 16 for positions. Applying that scale to the centipede records and this project's .62 world scale is an inference consistent with spawn and movement magnitudes.

Observed surfaced position data, from approximately 3.48 to 10.48 seconds:

- Chord speeds: 13.18–14.03 original units/s, equivalent to 8.17–8.70 replica units/s. Median chord speed is 8.47 replica units/s. Straight-line differences between half-second samples underestimate curved-path speed, so `14 × .62 = 8.68` is a chosen nominal speed, not proof of an exact original constant.
- Heights: 0.3875–8.33125 replica units. The old fixed 2–5 range cannot reproduce this observed arch.
- Position samples show descent and ascent. At 8.98 s height is about 1.86; at 9.48 s about .39; at 9.98 s about 2.05; at 10.48 s about 5.04. This contradicts eye-height seeking and supports a low pass followed by rising motion.
- Orientation matrix values have magnitudes near 256. Assuming a divisor of 256, relative orientation changes imply roughly .54–3.03 radians/s between samples. This is total orientation change, not a recovered yaw or pitch limit. The new 3 rad/s steering cap is a fitted approximation, not an exact AI constant.
- Spawn position is `(21.1703, -4, 6.0406)` in original units. The replica now starts its hidden head at `-4 × .62`.
- The replay ends before a complete burrow/return cycle. It cannot settle exact underground duration, trigger geometry, segment propagation, or re-emergence selection.

### Current original-game footage

Visually inspected [whysotp's Devil Daggers Centipede Guide](https://www.youtube.com/watch?v=a9BNGvpJGT4), published 4 April 2025, using the video player. The guide has instructional text over gameplay rather than a useful narrated transcript.

At about 0:43 the surfaced centipede forms a curved body while roaming. Around 0:53–0:58 it pursues while its head rises and descends. At 1:03 the guide explicitly describes waiting underground and emerging in a different area. At 1:43 it recommends beginning a scrape as the head rises. These observations support a head-led arch and underground relocation. They do not supply exact engine coefficients or a controlled timing measurement; clips can contain edits.

### Version-specific written sources

- [DevilDaggers.info version-specific source descriptions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs) distinguish older regularly diving behavior from v3.1/v3.2 descriptions: emergence about three seconds after spawn, idle flight then pursuit, burrowing after 15 surfaced seconds or head proximity.
- Its [v3.2 game data](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.GameData/V3_2.cs) places the first spawn at 114 seconds, with 25 crystals of 3 HP each. About 117 seconds is the emergence, not a second spawn event.
- [Braden's first-hand guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1846108258) includes a 2021 note that centipedes no longer immediately burrow underneath the player. Its older sections retain immediate-burrow advice and must be read in that context.
- [Japanese first-hand guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1556601947) describes roughly 15 seconds surfaced and ten seconds underground, inward-facing emergence, and proximity-accelerated burrowing. Its timings are observational and version sensitive.
- [September 2021 replay feedback](https://steamcommunity.com/app/422970/discussions/0/2949285188577616723/) independently describes triggering burrowing by passing under the head and eventual automatic burrowing. Its approximate 20-second description disagrees with the reference's 15 seconds; these are not interchangeable exact constants.

## Original quirks versus replica bugs

[Sorath's official February 2021 announcement](https://steamcommunity.com/app/422970/allnews/) says centipedes stopping against ground/other enemies and becoming stuck upside down were fixed. Reintroducing those freezes would target an older version, not current v3.2. The same official feed's October 2021 notes say the emergence particle effect was corrected to indicate the exit more accurately.

Current accounts describe ground bouncing and the centipede folding/tangling over itself before retreating. Those shapes should remain possible. Temporary body intersection with ground is distinct from permanently stopping or incorrectly teleporting the whole body.

Replica defects found and addressed:

1. All segments teleported above ground at emergence.
2. The entire centipede translated downward as one rigid body during burrowing.
3. The body was flattened and reset when returning.
4. Re-emergence occurred at the same exit.
5. The previous sine-wave flight could never make a genuine head-first ground crossing.
6. Previous pursuit could slow into an eye-height target and lose forward flight.
7. Underground chatter and the surface dust warning were absent.
8. Head/segment Euler rotation applied pitch in the wrong frame for nonzero yaw. YXZ rotation now aligns the forward axis with the actual trail; browser checks verify this against each segment direction.

## Current implementation

`src/centipede-motion.ts` now controls only centipedes. Gigapede and ghostpede behavior is left on their existing paths.

The centipede has a hidden warning, a continuous rising head, brief roaming, bounded-turn flight, a head-led dive, a fully buried interval, and a new exit. Segments sample distances along the actual head trail. This permits arches and head-first entry instead of moving every piece vertically together. Crystals keep their individual HP across relocation. Exposed body remains collidable during a dive; a completely buried body is inactive. Emergence cues are emitted at the surface crossing, dust appears at the exit, and underground centipedes use the extracted subchatter recording.

Combat revision 6 stores these rules. Revisions 0–5 preserve their historical trajectories, including revision 5's previous sine-wave centipede cycle.

Still inferred or unvalidated: three-second roaming/grace intervals, ten-second fully buried interval, 3 rad/s turn cap, 1.3-unit segment spacing, seven-unit launch crest, downward pursuit target, ground bounce threshold, underground relocation distribution, head hitbox boundaries and body roll. The new trail propagation is structurally consistent with footage, but not recovered original segment physics. The initial warning interpolates hidden head movement; it has not been matched to the fixture's underground path.

## Verification and remaining requirement for 100%

Tests run the first emergence, a head-before-tail dive, a fully buried wait, relocation with partially destroyed crystals, multiple timed cycles across three minutes, bounded trail storage, finite poses, lethal exposed contact, projectile absorption and deterministic historical/new replays. Browser verification captures emergence, flight, dive, underground and re-emergence in `artifacts/centipede/`.

Those tests establish replica consistency, not original equality. To establish 100% parity, obtain original v3.2 Survival or controlled practice replays covering complete cycles, plus original-game footage/memory for segment poses. Compare matching original player trajectories against this simulation, then fit/replace unresolved rules. The public fixture is useful but too short and too sparse to supply that validation. No installed original executable was found in the standard Steam location on this machine during this investigation.
