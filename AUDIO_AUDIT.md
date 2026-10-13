# Audio audit — 13 October 2026

The game continues to use the original Devil Daggers recordings already in this repository. All 275 imported WAVs match their recorded sizes and SHA-256 hashes, contain complete PCM chunks, and decode successfully in Chrome. The runtime uses 152 distinct recordings.

## Fixed playback defects

- Rapid-fire recordings last approximately 8 seconds at hands I–III and 64 seconds at hand IV. Previously a complete recording started for each shot. Primary fire now owns one continuous voice, starts at the beginning of the recording, and fades out within 25 ms on release, channel switch, upgrade, or death.
- Homing drones follow a bounded set of surviving projectiles. Sustained launches no longer restart long drone/seek recordings for each projectile group. Homing bursts use their own launch cue.
- All four hand III and five hand IV shotgun variants are available, along with skull and spiderling death variants. Consecutive variant choices avoid immediate repetition.
- Dedicated squid-tier, pede, Leviathan, thorn, and Orb damage cues replace incorrect generic mappings. Skull III uses its matching tier death recording. Orb beckoning and pacified chatter have distinct cues.
- Added events for landing, dagger jumps, floor/dead-segment ricochets, homing impacts, egg bounces/hatching, spider feeding, Ghostpede consumption, and Centipede burrowing/emergence.
- Events capture the hand level at emission, so an upgrade later in the same rendered frame cannot change an earlier shot's recording. Jump variants likewise capture the triggering jump type.
- Weapon, upgrade, and death sounds have priority over incidental transients when the 48-voice transient pool is full. Continuous voices use a separate bounded pool.
- Restart and menu exit clear transient tails and continuous voices. Both slider and keyboard replay seeking clear old audio; replay pause suspends playback, and completion stops loops without freezing the final death cue.
- Decoding concurrency is bounded and prioritizes weapon/player cues. Only cues still within a 100 ms freshness window may play after decoding, and clearing a run invalidates pending cues.
- Listener up and forward directions stay perpendicular while looking up/down. Continuous voices fade at their boundaries to reduce clicks.

## Verification

- `npm test`: 44 tests, including complete original recording integrity, runtime recording coverage, weapon audio state, event snapshots, and new sound events.
- `npm run test:audio`: real Chrome decoding of all 275 WAVs; all four weapon levels, release/upgrade/homing/death/restart behavior, saturated transient priority, all 22 enemy chatter/hit/death mappings, listener orientation, stale cue cancellation, and offline rendered weapon audibility/release silence.
- `npm run test:replica`: gameplay/practice/replay integration and audio resource loading.
- `npm run build`: TypeScript validation and production packaging.

Detailed browser results are saved in `artifacts/audio-audit.json`.

## Fidelity limits

The source recordings are original. Bus gains, attenuation, HRTF rendering, voice selection, and some event mappings remain browser-port tuning. The tiny rapid-fire entries in `loudness.ini` previously produced almost inaudible individual voices; explicit continuous-weapon gains replace that interpretation. Other cue weights retain their relative ordering through a bounded square-root mapping. Neither mapping is claimed to reproduce Sorath's native mixer math.

Exact native balance, loop phase policy, and event timing require an A/B capture from the original game. This audit verifies asset integrity, sound coverage for the implemented events, audibility, and playback lifecycle; it does not establish sample-for-sample native-game parity. The remaining imported recordings include menu/lobby, UI, and additional native behaviors that are not all represented by the current game simulation.

## Weapon and gem-hit balance pass

Primary stream gains are now 0.14 / 0.075 / 0.14 / 0.105 across hands I–IV. Hand II's recording has substantially higher source RMS, so its gain needs a larger reduction. Shotgun gains are 0.32 / 0.30 / 0.28 / 0.34: approximately 6–7 dB below the previous 0.65 gain, with first-half-second output RMS within 20% across hands. Damage feedback scale rises from 0.65 to 0.9 (about 2.8 dB) and takes priority over incidental armor/ricochet transients. Collection gains compensate for the quieter magic recording (0.22 normal / 0.32 magic). Existing chatter mappings and gains remain unchanged.

Chrome regression coverage now fires an actual projectile into a Squid II attached gem and verifies that the resulting hit event plays `damagesquid2` at the impact position. Rendered weapon checks enforce stream headroom and consistent shotgun attack levels. No loose-gem landing sound was added. Validation: 67 unit tests, the complete browser audio regression, and production build pass.
