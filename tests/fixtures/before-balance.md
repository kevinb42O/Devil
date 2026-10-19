# Before-fix replay fixtures

The `before-balance-*.bin.gz` files were captured from gameplay code at `d5b0b60` before the balance correction edits on 20 October 2026. They are gzip-compressed normal binary solo/crew recordings, not replacement expected values generated from corrected gameplay.

- Solo seed 71, practice starts at 39, 244 and 350 seconds, hand III, no homing reserve. Inputs fire while strafing and turning for up to 1,200 ticks. These exercise spider entrances, the large tower and the Leviathan using their original rules.
- Crew seed 71, one invulnerable host, scheduling disabled, manually introduced towers I–III, a spider, centipede, Leviathan and thorn. The host fires, strafes and turns for 1,500 ticks, then disconnects. Every checkpoint state and digest is retained from the original code. The terminal frame explicitly encodes that external disconnect boundary.

`tests/combat-balance.test.ts` checks solo outcomes and backward seeking, and checks crew playback against the saved checkpoint digests. A gameplay correction cannot silently update these fixtures to make a replay regression disappear.
