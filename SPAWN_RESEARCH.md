# Original Survival spawn comparison

Verified on 2026-10-13 against original-game recordings, rather than a replica's
own deterministic tests. This supersedes the earlier assumption that identical
coordinates on every retry would reproduce Devil Daggers.

## Evidence

The two standard Survival replays were resolved from the public DDStats replay
service. Both embed exactly the same spawnset as
`research/devil-daggers-v3/survival-v3.bin`: SHA-256
`507b806debe1019464899ce5422c42e78c1b03749d0880089d3a0464bc441767`.

| Recording | Time | SHA-256 |
| --- | --- | --- |
| [DDStats game 465692 original replay](https://dd-replays.s3.us-east-2.amazonaws.com/1225b673fb5deaa8a89b4d98ec4f5888.ddreplay) | 858.7511 seconds | See saved JSON report |
| [DDStats game 465693 original replay](https://dd-replays.s3.us-east-2.amazonaws.com/f474b2466fbc205a8f378dbe65462a55.ddreplay) | 530.4979 seconds | See saved JSON report |

`research/devil-daggers-v3/original-survival-replay-spawns.json` contains the
full extracted scheduled spawns, original coordinates, tower direction and
rotation fields, pede orientation matrices, embedded schedules, source URLs,
and hashes. Original input events establish the 60 Hz tick index. The reader
validates the embedded spawnset MD5 and input terminators, and rejects unknown
or truncated events and missing end events.

Reproduce extraction with:

```sh
python3 tools/analyze-spawn-replay.py /absolute/path/to/replay.ddreplay > report.json
```

The parser is based on the public
[ReplayEventsParser](https://github.com/NoahStolk/ddinfo-core/blob/master/src/DevilDaggersInfo.Core.Replay/ReplayEventsParser.cs)
and
[local replay header](https://github.com/NoahStolk/ddinfo-core/blob/master/src/DevilDaggersInfo.Core.Replay/LocalReplayBinaryHeader.cs).
The source commit is pinned in the JSON report. The
[spawnset format](https://github.com/NoahStolk/ddinfo-core/blob/master/docs/game-formats/spawnset-binary.md)
stores types and delays; it does not provide per-event coordinate fields.

## Verified corrections

- The float32 countdown carries the fractional overshoot into the next delay
  and the next loop. The previous implementation reset a loop timer, accumulating
  drift. Every scheduled type and tick now matches both recordings, including
  all 281 events in the longer run. For example, the second tower is at tick 839
  (13.98333 seconds), not tick 840; first-loop Gigapede is at tick 28020, not 28021.
- Tower spawn radius is always 62 original units, even as the arena shrinks.
  Tower origin heights are 6.5, 8.5, and 13.5 original units. These are uniformly
  converted by the project's existing WORLD_SCALE of .62.
- Spider spawn radii match `min(48, arenaRadius + 2)`, with the arena radius
  advanced by repeated float32 subtraction of `float32(.025 / 60)`. Tick zero
  applies a shrink step. Residual radial error against all recorded spiders is
  below 0.00001 replica world units.
- Original starting angles differ between the two runs, including the very
  first tower. Consecutive tower/spider angles advance by 90–270 degrees in both
  recordings. New games use seeded variable angles within that observed range;
  scheduled placement is independent of combat RNG. Practice skipping consumes
  prior placements to preserve the seed's sequence.
- All 27 recorded pedes start within a 25-original-unit disk, not near the arena
  perimeter. Centipede and Gigapede starting Y is -4, Ghostpede starting Y is -15;
  all have identity starting orientation matrices. Scheduled snakes now use
  the central disk and those measured depths/orientations.
- Thorn coordinates are snapped to original four-unit tile centers and start
  at the recorded Y -15.7. Their tile selection remains approximate.
- Gameplay revision 11 additionally restores scheduled spider radial jitter,
  corrects spider rewards to one gem, and preserves revisions 0–10 through
  the legacy spawn-fix branch.
- Tower children now match every captured emission tick/type in
  `original-tower-emissions.json`, including repeated bursts. Emission is
  individual; killing a tower cancels children not yet emitted.
- Gameplay revision 9 preserves revisions 0–8 via the old timing/placement
  branches. Earlier saved replays retain their original spawn behavior.

## Remaining gaps to a 100% match

The exact original RNG algorithm, seed initialization, sample consumption and
probability distributions have not been recovered. Uniform angular increments
and a uniform radial sample for pedes are explicitly inferred, not certified
engine code. The finite recordings validate observed constraints, not every
possible location in every original run.

Thorn locations are recorded on the original four-unit tile grid, with starting
Y -15.7. Their tile selection and exclusions remain unrecovered; the replica now uses
tile centers but retains its previous radial selection range.

Spider replay anchors are at Y 22/50, while this renderer uses an assembled,
scaled articulated rig with a different body origin. Its vertical entrance and
head animation need original skeletal/transform measurements before those
anchor values can be mapped faithfully. Copying the anchor height into that
rig alone would not reproduce the original shape or movement.

Revision 11 replaces constant-speed tower entry with a smooth trajectory
calibrated from the recorded poses. It matches the captured entrance samples
within .04 world units radially and .02 vertically. Interpolation between samples
and subsequent AI are not certified engine equivalents. Snake flight and visible emergence also
require separate comparisons. The player's 120 Hz simulation is retained; an
original 60 Hz spawn tick maps to an even simulation tick.

These gaps prevent a claim that the complete game or all spawn behavior matches
100%. The verified timing match covers the captured runs through 858 seconds;
the same countdown extrapolates beyond them, but those later ticks are not yet
validated against a longer original recording.

## Validation

- `npm test`: 187 tests passed, including original replay tick/type comparisons,
  original radial/height constraints, seed variability, combat/co-op independence,
  practice starts, and historical replay compatibility.
- `npm run build`: passed.
- `node tests/spawn-reference-browser.mjs`: opening, second tower, tower/spider,
  Centipede/spider trio, six towers, Gigapede trio, Ghostpede and first-loop groups.

The entrance samples are in `src/tower-entrance-data.ts`; the reference-calibrated
interpolator and recovered emission ticks are in `src/tower-spawn.ts`. Reproduce
the emission fixture with `python3 tools/analyze-spawn-replay.py /absolute/replay.ddreplay --tower-emissions`.
