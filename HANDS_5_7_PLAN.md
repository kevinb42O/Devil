# Hands V–VII: Twin Ascension

**Implemented locally, 15 October 2026.** Tiers V–VII, synchronized paired firing, native left-hand anatomy, tier materials, seven-tier progression and practice controls are implemented. Press **5 / 6 / 7** or numpad equivalents inside the solo arena, or select V–VII in Practice. Runtime uses solo replay rules **7**, combat revision **20** and integrated network protocol **12**. The rules migration is prepared and tested locally; it has not been applied to the live service.

## Implemented result and validation

- Native `hand4` / `hand4left` pair with positive scale, distinct copper-red / crimson / ivory-violet shaders, shared recoil, compact muzzle effects, tier-specific sound pitch and a short upgrade ignition.
- Both hands fire together from the existing primary/homing actions. One shared damage/ammo budget; primary counts 10/12/14 per salvo and 72/84/96 per burst; IV homing costs/detonations and 17 m/s floor launch preserved.
- New thresholds 350/550/800 collected gems; six-player shared progression with one collector damage wave per new-tier unlock. Dead players retain progression; reserves remain individual.
- Independent fixed physical origins and responsive view poses. Portrait uses square-root aspect scaling to give the palms more presence than the original conservative planning preview. Socket routing persists through solo shots, prediction, compact/full network state, checkpoints, death analysis and seeking.
- Historical solo versions 4–6 and crew revisions 18–19 remain readable and capped at IV. New and old solo score outboxes use distinct storage keys. Versioned crew registration/submission/board RPCs avoid publishing new gameplay into old backend rankings; old RPCs/history remain available.
- New migration: `supabase/migrations/20261015202640_twin_ascension_rules.sql`. Local SQL tests cover historical score separation, v20 registration and submissions, old/v20 boards, replay reservation and anonymous privilege restrictions. Deploy this migration with the client before enabling new public rankings.

Verification performed:

- TypeScript and production build passed. Existing bundle-size warning remains.
- Final `npm run test:twin-hands` passed end to end (8 unit/SQL checks, the 7,776-case browser/key regression and real WebRTC transport). New tier simulation/network/replay tests passed; 33 targeted integration checks and 36 audio/feedback/input/outbox checks passed.
- Broad unit run: 423 checks, initially 421 passed and two stale expectations failed. Updated only those expectations (four-entry tuning table and revision-19 assertion); all 15 checks in the affected projectile-distance/ricochet suites passed on recheck. A clean full-suite rerun after those assertion edits is not claimed.
- Browser: **7,776** new-tier projectile/socket cases passed, maximum central socket error about **1.32e-14**; top-row and numpad 5–7, Practice marking and switch back to IV verified through real key events.
- Existing 396 I–IV FOV/socket checks, existing hand-upgrade browser checks, and existing low/high-quality shotgun browser checks passed.
- Real local WebRTC transported both stream and shotgun salvos at V, VI and VII with correct tiers, projectile kind and balanced left/right counts.
- Six-player local CPU probe: VII sustained 3,127 projectiles after three simulated seconds; p95 wall-clock tick about 3.12 ms, p95 process CPU tick about 3.13 ms, initial encoded snapshot 67,432 bytes. This is a short simulation-only probe, not GPU/mobile FPS evidence or a long soak. JIT and machine load affect cross-tier timing comparisons.
- Actual gameplay screenshots and machine-readable evidence are in [artifacts/twin-ascension](artifacts/twin-ascension/README.md). Planning-only studies below remain historical context.

Human preference, long-run collection pacing, a 20-minute soak and representative mobile GPU performance still need playtesting; this implementation does not claim empirically perfect balance.

## Historical design and audit record

The following sections preserve the preimplementation plan and its measured studies. Use the implementation summary above for current status.

The second-pass implementation specification and measured previews are in [Second-pass decisions and evidence](#second-pass-decisions-and-evidence). It supersedes the first-pass routing and spacing assumptions where specified.

## Recommendation and intended experience

Keep hands I–IV intact. At V a second hand awakens; VI and VII evolve that pair. These are weapon levels, not five to seven visible arms. **User-confirmed controls: LMB remains tap burst / hold stream; RMB remains homing. Neither button selects a hand. Both hands fire on the same tick from the same action, sharing the existing firing clock and resource budget.** The new silhouette should be the major reward; a controlled increase in useful damage makes the reward real.

The player should think: “I earned a new form, I can cut through more pressure, and aiming and collecting still matter.” Preserve the vulnerability, movement decisions, weakpoint targeting and pauses for gem attraction that make survival tense. Avoid a weapon that clears the arena unattended.

This proposal is for an expansion of the existing Survival progression in solo and crew. Prototype it in unranked practice first. Do not add a permanent mode selector unless playtesting shows a real demand for separate classic gameplay. Preserve old results and recordings under their original rules.

## Verified baseline before implementation

| System | Current working-tree behavior | Consequence |
| --- | --- | --- |
| Progression | I at 0, II at 10, III at 70, IV at 200 lifetime collected gems | New unlocks should use collected gems, independent of ammo spending |
| Crew | Up to **six** players; every collected gem advances shared progress and adds one reserve to each player after the homing unlock | Extra output and new pulses multiply across six players, not just four |
| Ordinary stream | 1/2/4/8 daggers per salvo; 6/6/6/9 ticks apart at 120 Hz | IV emits 106.67 daggers/s after its hold startup; blindly extending `level===4` makes V fire too fast |
| Ordinary shotgun | 10/20/40/60 pellets, two damage each; 80% core; outer spread .17/.21/.26/.32 rad | IV has 120 maximum direct damage per blast, before armor or misses |
| Controls | Tap releases a burst; holding beyond 16 ticks streams; burst recovery is 60 ticks with existing rehold behavior | Keep timing and all keyboard/controller/touch bindings |
| Homing | Unlocks at II; stream spends up to 4 reserve per 12 ticks; IV burst spends up to 30; IV projectiles detonate on expiration | Separate ammo efficiency from primary power escalation |
| Movement | Shotgun floor-launch speeds 10.8/12.6/15/17 m/s | Extending upward can bypass arena danger and affect descent/floor transitions |
| Upgrade pulse | 5/10/20 damage at II/III/IV; emitted independently for each living crew member | Six simultaneous IV pulses can already deal up to 120 damage to an eligible enemy hit by all six |
| Respawn | 15-second delay, 3-second protection; existing level/reserve preserved; dead players receive shared upgrades | New levels should follow this behavior and never retrigger upgrade damage on revival |
| Compatibility | Solo replay rules 6; solo/crew combat revision 19; network protocol 10 | Assign new compatible/versioned identities deliberately |

Evidence: `src/simulation.ts`, `src/weapon-tuning.ts`, `src/crew-config.ts`, `src/upgrade-pulse-tuning.ts`, `src/replay.ts`, `src/crew-replay.ts`, `src/network-codec.ts` and the current hand/shotgun tests. Existing plan documents contain historical proposals; current code and the implemented section of `SHOTGUN_PLAN.md` take precedence.

## Proposed progression and power budget

| Level | Working name | Collected gems | Visible form | Primary stream per 9 ticks | Raw stream damage/s | Shotgun pellets | Maximum direct blast damage |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| IV | Unbound (existing HUD name) | 200 | Current single hand | 8 | 106.67 | 60 | 120 |
| V | Twinflame | **350** | Two hands, newly ignited left hand | **10 total** | **133.33** | **72 total** | **144** |
| VI | Dominion | **550** | Both hands fully formed | **12 total** | **160.00** | **84 total** | **168** |
| VII | Eclipse | **800** | Final paired silhouette with restrained luminous seams | **14 total** | **186.67** | **96 total** | **192** |

Raw figures assume all ordinary projectiles hit, one stream damage or two shotgun damage each, no armor, and exclude startup, recovery, homing and explosions. They are ceilings, not encounter DPS. Stream gains over IV are 25%, 50%, 75%; successive gains are 25%, 20%, 16.7%. Burst gains are 20%, 40%, 60%; successive gains are 20%, 16.7%, 14.3%. V should already feel complete; VII should improve the pair without making V feel defective.

Threshold gaps are 150/200/250 after IV. These are a first probe: gem availability, collection rates and run duration must determine final values. Before locking them, measure spawn supply, gems actually released, eaten/expired gems, and collection timelines for novice/intermediate/expert players and each crew size. Scheduled enemies alone do not capture emitted enemies or spider gem recycling. Do not claim a specific unlock minute from these thresholds.

Initial pacing goals: skilled players who reach IV should have a plausible next milestone; successful collectors should get meaningful time using each new form; VII should be a late-run achievement. Flag V–VII compressed into under 30 seconds total in ordinary crew play or V routinely taking more than three minutes after IV in successful solo play. These are investigation triggers, not automatic tuning formulas. Compare within skill cohorts and crew size; account for players dying before unlock.

Use the same shared thresholds for solo and crew in the first prototype, matching the existing team reward. Measure 1/2/3/4/5/6-player pacing before considering any crew-only threshold multiplier. Avoid taxing every additional player by assumption. Any final size-specific thresholds must be fixed at run start and use the ranked starting roster, so disconnecting cannot lower the requirement.

## Exact combat rules for the first prototype

1. **One weapon, two emitters.** Each stream salvo fires both hands on the same simulation tick, splitting total counts 5+5, 6+6, 7+7. Each burst splits 36+36, 42+42, 48+48 on the same tick. Neither hand owns a second cooldown. A reserve of one fires one homing projectile; the second hand cannot manufacture another.
2. **Preserve spread initially.** V–VII use IV's .155-radian stream envelope, .32-radian shotgun outer cone, .14-radian maximum core, 80% core fraction and 1 cm shotgun launch radius per hand. Start with two focused stream lanes total, distributed one per hand. At 25 m this may provide little extra useful damage despite the larger raw count; explicitly measure it before deciding whether V–VII need an additional focused lane. Make focused-lane count explicit; it currently depends on socket count. Do not accidentally double precision by concatenating two five-socket sets.
3. **Crosshair convergence with honest obstructions.** Each hand converges toward the same camera aim point using its own physical origin. Apply the existing floor, armor and nearby obstruction logic to each origin. At extreme close range pellets may strike nearby geometry. Never spawn shots at the target to hide convergence problems.
4. **Conservative physical separation.** Separate physical and overlay transforms. Start around 20 cm between the central origins at neutral aim, then validate against real arena geometry. Screen pose may be wider, but visual launches must blend to their physical paths through the existing launch-offset system. Measure sockets from actual posed left/right assets; do not derive them by negating a world-space coordinate. Validate steep aim and independent FOV projection.
5. **Homing inherits IV.** Preserve 4 projectiles per 12 ticks, 30 per burst, speed 42, energy/damage rules, target priority, ghostpede absorption and explosion behavior. Split existing totals between hands. Preserve per-player reserves. Primary improvements provide the new tiers' initial combat growth; do not also increase homing economy.
6. **Movement inherits IV.** Floor-launch minimum remains 17 m/s, applied once per input burst with existing eligibility and momentum-preservation rules. Gem push occurs once per burst. Do not apply jump or push separately per hand. No new air jump, dash or immunity.
7. **No new sustained area damage.** Retain IV homing explosions; no primary piercing, chain lightning, automatic firing or homing-primary conversion in this release. These would alter target selection, weakpoints, swarm control and collision budgets simultaneously.
8. **Upgrade damage is bounded.** For V–VII use one shared upgrade wave per threshold with IV's 20 damage, speed, duration and vertical reach. Solo uses the player position; crew uses the living collector's position. Each enemy can receive at most one hit from that wave, following current weakpoint selection. All players still receive the visual/audio upgrade cue at their own location. Keep historical I–IV pulses unchanged. New team waves need a distinct identity and collector attribution; do not deduplicate by frame or approximate position.
9. **Threshold tick order is explicit.** Existing projectiles retain launch-time level and behavior. A shot already fired before collection stays at its old tier; the next eligible shot uses the new tier. Crossing a threshold grants no free salvo, cooldown reset, reserve refill, protection or second jump.
10. **No downgrade.** Spending reserve, dying, respawning, spectating or disconnecting never reduces the shared unlocked tier. A connected dead player gets the state change without a damaging pulse. Returning to the lobby/new run resets progression through the existing lifecycle.

If effective high-tier output makes the arena empty for long stretches, reduce added projectile counts or alter unlock pacing first. Do not silently increase all enemy HP or spawn rates on the unlock tick; that can erase the reward and make teammates feel punished. A future late-game encounter revision deserves its own design and ranking identity.

## Art direction and readability

Retain I lime, II electric blue, III ice cyan and IV violet. V uses ember-orange/copper seams, VI uses saturated rose/crimson seams, VII uses ivory-white cores inside a violet/rose shell. These are candidate families to inspect in the actual cosmic skies, mist, blood and floor lighting; white should not become a screen-filling bloom source. Gem orange is an existing conflict for V: use a brief angular blade silhouette, darker copper shell and clear speed/shape distinction; shift V toward red-copper if separation fails.

Both hands use the same tier family, with a slightly different brightness/accent. Tier must remain recognizable without color through silhouette, Roman numeral, HUD progress and upgrade sound. Seeking projectiles retain their distinct accent/motion; shotgun remains compact/faceted and stream remains a dagger. Player skin colors remain cosmetic and independent of weapon tier.

Use `hand4` for the right hand and the native `hand4left` for the left hand at V–VII. The second pass verified exact reflected positions, normals and UVs for this pair; see the evidence below. Keep the same actual meshes across V–VII and differentiate with material treatment and upgrade effects. Earlier left-mesh pairs have different normal/UV correspondences and are unnecessary for this design. Texture filenames `hand5` and `hand6` do not establish extra playable tiers. Avoid negative-scale mirroring as the final asset solution because normals, culling and local socket handedness can change.

Keep the crosshair and approaching floor threats unobstructed. Review 16:9, ultrawide, narrow desktop and portrait mobile, minimum/maximum FOV and low/high quality. Preserve fixed hand-camera projection, movement inertia, upgrade sweep and shot flash. Both hands recoil lightly; their combined pose must not double camera shake. Upgrade reveal lasts roughly the current 1.65 seconds and never locks firing or movement. Reduced-motion settings suppress added pose travel; low quality retains tier/salvo information.

Sound is a single mixed event per salvo, with controlled layers rather than two full-volume copies. Build explicit V–VII stream/burst/upgrade/drone mappings; names such as `rapid5` and `levelup7` do not currently exist. A quiet layered low note and distinct upgrade motif can sell power without louder output. Preserve threat and gem pickup audibility in six-player sessions. No permanent flash/strobe or continuous full-screen glow.

Third-person teammates need both aim poses and visible firing sides, with ownership names unaffected by palette. Inspect the current demon rig's left bones; the renderer currently requires and aims only right-arm bones. Provide a graceful fallback body if loading fails. Spectator, first-person spectating, replay and death camera must use the selected player's tier/pose, not the host's.

Readability reference: Riot's [VFX education](https://www.riotgames.com/vi/artedu/visual-effects) and [gameplay clarity discussion](https://www.riotgames.com/en/news/valorant-shaders-and-gameplay-clarity) support making effect meaning readable while preserving visual satisfaction. These are principles; our palette and player appeal still require playtesting.

## Multiplayer and network implementation contract

The host remains authoritative for collection, level, damage, resources, wave hits and revival. Clients predict their own shots/movement and reconcile to host snapshots. Do not change this to lockstep. Host/guest local RNG, shot identities and reconciliation must reproduce both launch origins without consuming the world spawn RNG.

**Verified release blocker:** current projectile flags are `homing bit 0`, `level minus one bits 1–2`, `shotgun bit 3`. V requires bit 3 for its tier, colliding with shotgun. Current unpacking masks tier with `&3`, validates flags at 15/14, and limits salvo indices/counts to 60. Lifting a UI clamp alone silently corrupts packets.

Proposed new encoding: homing bit 0, tier bits 1–3, shotgun bit 4; accept only known bits and decoded tiers 1–7, reject encoded tier 8. Apply to full updates, seeded launches, delta comparison, validation and tests. Alternatively carry level separately if profiling favors maintainability. Choose once and version the schema; never decode new flags under protocol 10.

Extend the immutable shot description with a versioned routing pattern: total count, left/right muzzle groups, one global shotgun pattern count, and explicit focused lanes. Use global pellet indices for stable `player:sequence:index` identity; map even/odd indices to right/left, with per-hand socket index `floor(index/2)` for stream routing. The shotgun uses its original global index/count for its spread, then picks the emitter by parity; do not regenerate a half-sized spread pattern per hand. Define reserve-one routing to the right hand, then alternate within a salvo. Pattern reconstruction uses the original counts even if only pellet 95 survives. Reuse deterministic seed expansion with a fixed documented order; no render-time randomness in trajectories. Seeds and patterns must work in explicit correction and seeded compact modes.

Retain the existing actual-trajectory check before compact encoding. Homing, ricochets, pierces or altered flight continue to use corrections. Test packet truncation, impossible routing/count combinations, duplicate identities, oversized salvos and missing baselines. Preserve bounded chunk assembly and recovery; higher counts must not turn every state into a reliable transfer that stalls input.

Increment network protocol from current 10 to the next available version at implementation, with a clear pre-start mixed-version rejection/refresh message. Cached/PWA clients must not join a new run with old decoding. Six-person teams and existing dead/disconnected roster slots are part of the required test set.

Upgrade threshold races: two gems collected in one tick, collectible processed while a teammate dies, respawn due that tick, collector disconnect and full team wipe. The host emits a stable wave identity once per crossed threshold. Replayed, reordered or repeated effects cannot deal damage twice. Host snapshot restoration must preserve active wave hit sets and origins. Existing host-loss behavior remains supported; do not promise a new host-migration feature.

## Replay, persistence and fair rankings

New gameplay requires a new combat revision; use the next available revision after 19, verifying no concurrent work has taken it. Old revisions must cap at IV and retain their exact original projectile paths, pulse stacking, gem logic, RNG consumption and death ticks. Historical runs with more than 350 gems must not gain a second hand on playback.

Solo currently ranks by replay rules version, while crew checks combat revision. A combat-only bump is therefore insufficient for fair solo comparison. Give expanded solo survival a distinct accepted ranking/rules identity, or introduce an explicit combat-revision ranking key end to end. Prefer the existing rules-version partition if it avoids an invasive score API redesign. Decide in implementation after inspecting backend contracts. Keep old solo and crew rankings accessible as historical results.

Version-aware validation must support old four-element `upgradeTimes` and new seven-element arrays, setup tier limits, projectile levels and full checkpoint state. Update solo replay imports/exports, crew checkpoints, seeking, death analysis, theater controls, local run history and practice flags. A playback reader must select historical behavior before validating revision-dependent shapes. Unknown future formats fail cleanly; they must not be relabeled as old recordings.

Record routing/shot state only where reconstruction requires it. No hidden render clock controls a future shot. If any persistent firing-side state is introduced later, snapshot it and include it in seeking and host restoration.

Pending score/replay upload queues keep their original ranking identity after a client update. Old queues must not publish into new rankings. Prepare backend validation/ranking changes and client together, verify old/new publication in a local fixture, then deploy in compatible order before opening ranked new gameplay. New scores stay unranked during the prototype; a failed backend change must not fall back into old rankings.

Backend schema/RPC implementation is a separate required work item: this planning audit did not change or validate the live service.

## Code changes to make deliberately

| Area | Files / responsibilities |
| --- | --- |
| Shared weapon definition | Add a tier registry, e.g. `src/weapon-levels.ts`: thresholds, counts, cadence, capabilities, sockets, art/audio IDs. Keep historical values selectable by combat revision |
| Simulation | `simulation.ts`: collection, `startAt`, seven upgrade times, stream interval, homing capability, damage/detonation checks, launch routing, one jump/push per shot, new shared wave semantics |
| Launches/tuning | `weapon-tuning.ts`, `weapon-origin.ts`, `projectile-launch.ts`, `network-shots.ts`: two-hand origins, stable counts and focused lanes |
| Network | `network-state.ts`, `network-codec.ts`, `multiplayer.ts`: flags, validation, launch limits, protocol handshake, prediction/reconciliation, snapshots |
| Rendering | `original-weapon.ts`, `projectile-presentation.ts`, `projectile-lighting.ts`, `renderer.ts`: paired models/materials, tier palette, effect batches, visibility, owned launch sockets |
| Player presentation | `crew-avatar.ts`: left-arm pose and firing origin; keep cosmetic colors separate |
| Feedback | `audio.ts`, camera feedback/movement modules: explicit asset mappings and bounded combined intensity |
| Upgrades | `upgrade-pulse-tuning.ts`, `upgrade-ground-pulse.ts`: separate local celebration from authoritative team damage wave; the floor shader currently has four pulse slots despite six-player support |
| HUD/practice | `main.ts`, relevant HTML/CSS: next-threshold progress, I–VII labels, accessible cues, practice 1–7, controller/touch parity, debug previews |
| Replays/scores | `replay.ts`, `replay-file.ts`, `crew-replay.ts`, `crew-score.ts`, `leaderboard.ts`, queues and backend ranking contracts: version-aware state/validation and score partition |
| Assets/distribution | Asset manifest/import tooling, loading/prewarm, PWA cache versioning: required left models, tier skins and sounds |

Replace capability-sensitive exact equality such as `level===4` deliberately. Do not globally change every equality to `>=4`: III-only special damage, legacy branches and tier-specific art have different meanings. A registry separates `hasHomingDetonation`, `streamInterval`, `homingBurstCount` and `movementTier` from numeric level.

## Planned regressions and how to prevent them

| Failure | Why plausible here | Required evidence |
| --- | --- | --- |
| V fires 200/s instead of 133.33/s | Existing `level===4?9:6` drops new tiers back to six ticks | Long held-fire count test at every tier, including transition ticks |
| New tiers lose explosions / spend wrong ammo | IV-only checks in `shoot` and `expireProjectile` | All seven levels; reserves 0/1/3/4/29/30/31; ghostpede absorption and exclusion behavior |
| Shotgun becomes tier I over network | Tier bits collide with kind bit | Every tier × kind × homing; full and compact packets and baseline deltas |
| Right hand does damage twice | Two render objects trigger separate weapon callbacks | Exact counts, damage, shots/hits/homing stats, one jump and gem push |
| Sparse shotgun survivors change spread | Pattern inferred from remaining pellets | Only final pellet survives; original 96-count geometry reproduced |
| Upgrade instantly clears a six-player arena | Per-player damaging pulses are copied to new tiers | Exactly one new team wave; one hit/enemy; dead teammates cosmetic only |
| Pulse is audible but invisible | Four floor slots versus six simultaneous cues | Intentional cosmetic merging/capping with authoritative damage origin visible |
| Two-hand spread accidentally gains precision | Focused lanes currently inferred from socket count | Explicit lane count; near/mid/far real-contact and weakpoint probes |
| Delayed/duplicate guest shots | Origin/routing differs in prediction and host | Shot-key matching under delay/loss/reordering; one visible launch per identity |
| Shot passes through walls at close range | Wide camera pose substituted for physical muzzle | Each hand near floor/edge/armor, steep pitch and obstructed origin |
| Replay permanently shows wrong tier | LastLevel/global fallback, old array assumptions | Playback/seek before/at/after unlock; low/high quality; selected crew member |
| Old run diverges after gem 350 | New unlock rule applied to old replay | Historical deterministic fixtures above all new thresholds and matching death tick |
| Shotgun jump leaves intended playable space | Launch applied per hand or grows with tier | Same 17 m/s minimum at IV–VII; descending floors, cliffs and upward momentum |
| No threat can approach expert players | Damage, precision, area and uptime increased together | Encounter pressure and actual hit-rate metrics; tune counts first |
| Mobile/low quality becomes unreadable | Doubled hands/flash and white bloom | Portrait play, threats at lower corners, reduced motion, lowest-quality render |
| New power vanishes on revive | Reinitialization clamps tier to four or hand resource reset | Death during upgrade, respawn, protected movement, replay restore |
| Unfair historical scores | Solo eligibility keys only on rules version | Old/new score partition and delayed queue publication tests |

## Balance evaluation: evidence before “perfect”

Use the same seeds, arena times and enemy states for IV/V/VI/VII comparisons. Capture ordinary stream, tap burst and homing separately. Test the real collision model: small moving skulls, skull4, exposed/hidden spider crystals, each tower crystal, segmented enemies, leviathan/orb weakpoints and ghostpede interception. Include no-ammo, low-ammo and rich-ammo states. A single centered stationary sphere is a useful spread probe, not proof of encounter balance.

Measure at 3/5/10/25 m, multiple yaw/pitch angles and at least ten fixed seeds. Record time to first damage, time to kill, hit rate, overkill, reserve spent, gem yield/collection and target-switch time. Include a swarm scenario where wider coverage can outperform single-target raw DPS, plus a close two-hand convergence scenario where it can underperform. Initial acceptance: aggregate useful primary damage improves at every new tier, with no reproducible representative encounter made worse by the new form's origin/visibility. Intended aim/position constraints remain.

Track snowball feedback explicitly: stronger primary → faster dangerous-target kills → more safe collection → earlier next tier. Examine both best runs and the median survivor; averaging them hides runaway progression. Measure time with an empty arena, live enemy pressure, failures during collection, and death causes. If players stop choosing between shooting and collecting, the expansion has damaged the core loop even if DPS is mathematically smooth.

Playtest in three skill cohorts and solo/small crew/full crew. A practical first qualitative round is 12–18 players total, followed by targeted sessions where uncertainty remains; this is not statistically sufficient to prove retention. Counterbalance prototype and current build order, use matched encounter snapshots, and also let people play full natural runs. Ask whether each unlock was noticeable, satisfying, readable and worth pursuing; observe behavior rather than leading participants with “did you like the stronger hands?”

Working satisfaction gate: most participants notice V without explanation, prefer reaching it over staying IV, and do not report losing aiming clarity. Any repeated complaint about obscured threats, intrusive flash, hand convergence or ammo confusion blocks visual signoff. Tune thresholds only after testing natural runs; instant-unlock practice cannot establish pacing. Claim universal appeal only with evidence that does not exist today; aim for a strong, validated improvement.

## Performance and transport budgets

At VI/VII raw projectile count grows rather than projectile size or per-frame lighting work. With no collisions and 2.8 s primary lifetime, IV sustains about 299 ordinary stream projectiles per player; VII about 523. Across six continuously firing players that is about 1,792 versus 3,136, excluding homing, bursts, transient overlap and enemies. These are analytic steady-state estimates, not measured browser timings. Six simultaneous VII bursts add 576 pellets. Eight-second homing lifetime can add further pressure despite unchanged homing rate.

Retain instancing, bounded fragment pools and existing lighting budgets. New palette batches are lazy/capacity managed; do not add a real light or mesh per projectile. Never cap authoritative damage projectiles by device quality. Quality reductions affect cosmetic particle density, bloom and distant effects only.

Profile matched IV and VII loads on the same hardware: host simulation, guest decode/prediction, GPU render, memory, encoded bytes/s, chunk count and state age. Use six-player stream, mixed homing, synchronized bursts, repeated upgrades, dense late waves, spectators, replay seeking and a 20-minute soak. Proposed gate: p95 frame time no more than 15% above the matched IV load on the same device, host simulation p95 below the 8.33 ms tick budget, and no sustained state staleness/input backlog. Aim for 60 fps desktop and stable 30 fps on a named reference mobile device; select hardware before making performance claims. If the gate fails, optimize reconstruction/batching or reduce counts and reassess the power ladder.

## Delivery sequence and release gates

1. **Baseline and reachability.** Preserve the dirty working tree; establish current targeted tests and representative IV captures. Build read-only supply/collection probes and pin old replay fixtures. Confirm asset availability and backend ranking partition strategy.
2. **Unranked vertical slice.** Implement tier V only, shared weapon data and paired pose. Validate one firing budget, convergence and useful damage against IV. If the second hand is visually intrusive or feels worse, fix pose/routing before adding VI/VII. The user has selected paired hands: fix the paired framing/routing if the first prototype is intrusive. Do not silently substitute single-hand V–VII.
3. **Complete the ladder.** Add VI/VII art, counts, thresholds, HUD and audio. Add shared new-tier damage waves, revision-gated behavior and practice controls. Profile solo and six-player loads.
4. **Network and archival compatibility.** Version the flags/launch schema and lobby handshake; update full snapshots, prediction, correction, respawn and spectator behavior. Implement old/new solo/crew recording, import/export and seeking. Historical determinism must pass before public testing.
5. **Balance and presentation rounds.** Run the collision matrix and human sessions; adjust one axis at a time (counts, then spread if needed, then threshold pacing). Re-run directly affected comparisons after every change. Do not call prototype numbers final because they form a neat sequence.
6. **Ranked rollout.** Finish backend validation and separate rankings, upload queues, PWA update checks and old-client rejection. Rehearse the upgrade and rollback with existing recordings and scores. Publish only after browser, network, replay, score and performance gates pass.

Rollback disables new ranked starts under the new identity; preserve published new-tier scores/replays and their compatible playback path. Return new runs to the last supported rules with a matching protocol/client bundle. Never silently replay or rank a V–VII recording as IV-only gameplay.

## Verification checklist

- Threshold boundaries: 349/350/351, 549/550/551, 799/800/801; old 9/10, 69/70, 199/200 intact. Same-tick multiple collections and no duplicate upgrade.
- Levels I–IV remain byte/trajectory equivalent where promised; old historical branches stay untouched. At new tiers exact primary counts/rates, homing spend, stats, cooldowns and movement behavior pass.
- Natural and setup/practice starts, next-unlock HUD progress and final tier VII saturation; safe resets after repeated lobby/run changes.
- Crew sizes 2–6, all alive and mixed dead/disconnected slots; synchronized upgrades, one collector wave, retained level/reserve on revival and full wipe semantics.
- Real WebRTC with 0/100/250 ms added RTT, 2% and 5% packet loss plus reordering; baseline recovery and mixed protocol rejection. Existing transport/recovery guarantees continue to hold.
- Compact and explicit projectiles at every tier/kind, maximum salvos and sparse final indices; malformed packets rejected; bandwidth/assembly budgets measured.
- Old solo/crew fixtures above 800 collected gems still end identically. New solo/crew playback, backward/forward seeking, export/import, death analysis and spectator switching reproduce hand state and trajectories.
- First/third-person and fallback assets; FOV/aspect/socket alignment, floor/armor collisions, cosmic environments, reduced motion, low/high quality, mobile and controller operation.
- Ranking partition, old pending uploads, unsupported future revisions, practice exclusion and rollback exercised locally; live rollout is not implied by local success.
- Extend existing `hand-upgrades`, `shotgun`, `upgrade-pulse`, `weapon-*`, `projectiles`, `multiplayer-*`, `replay*`, `crew-replay*`, score and PWA suites with the cases above. Run required existing checks and production build against the integrated tree, recording any unrelated pre-existing failures honestly.

Completion means a tested implementation, measured pacing and performance, readable dual hands, compatible multiplayer/replays and fair rankings. This document is the implementation-ready proposal; it does not represent those delivery gates as completed.

## Baseline verification performed for this proposal

Ran `npx tsx --test tests/hand-upgrades.test.ts tests/shotgun.test.ts tests/upgrade-pulse.test.ts tests/multiplayer-respawn.test.ts`: **35 passed, zero failed**. This confirms the inspected current behavior in those targeted suites; it does not validate proposed V–VII gameplay, browser presentation, performance, live networking or backend deployment. Only this new planning document was authored for the request; existing working-tree changes were left in place.

## Second-pass decisions and evidence

This pass implements the user's request to plan once more before gameplay implementation. User-confirmed scope: use the existing models, add the correctly handed left hand, fire both hands together, preserve all existing fire controls, make the new forms visually distinct, and validate spacing. No independent left/right weapon binding, alternating-hand firing mode, new action button or input option is to be introduced.

Inspected local HEAD `83f316e83d5eb4a29179c496894ad72fc5ef6335`, with substantial existing uncommitted work. Read-only `git ls-remote --symref origin HEAD` confirmed remote default `main` at the same commit. Current uncommitted code, not HEAD alone, is the implementation baseline. Other work was appearing in the shared tree during this pass (including podium player skins); implementation must recheck the tree and relevant revisions before editing.

### Native left hand: confirmed, with measured evidence

`artifacts/twin-ascension-plan/audit.mjs` loads both OBJ assets through the same Three OBJLoader used by the game. `hand4` and `hand4left` each contain 396 rendered triangles. Every rendered right-hand vertex has an exact reflected counterpart in the left mesh under **local X reflection**. For this pair the maximum reflected position error, normal error and UV error are all zero. The imported left OBJ already contains the reversed vertex ordering required by reflection; do not reverse its winding again or apply another negative scale.

Use the same positive scale and base orientation on both models. Right rests at positive overlay X, left at negative X; with the current base yaw of pi, local +X points toward overlay -X. The right model's thumb points toward the center from the right side, and the native left thumb toward the center from the left side. Reflection belongs in the **local socket definitions**, exactly once, because the left model's geometry is already reflected. Never apply a second reflection to the geometry or infer a left socket from a world-space X sign.

The earlier `hand`, `hand2` and `hand3` pairs also match reflected vertex positions but do not have exact matching UV/normal corner data. This further supports using the verified final pair for every new tier. Original `hand5` and `hand6` texture files are the current IV idle/firing skins, confirmed by the asset manifest; they are not missing V/VI hand meshes.

The crew demon GLB also includes native left upper-arm/lower-arm/finger nodes. Raw GLB names include `UpperArm.L`, `LowerArm.L` and `Middle3.L_end`; GLTFLoader sanitizes node names, so resolve loaded names against the actual loaded graph rather than guessing from raw JSON. The existing code resolves right names such as `UpperArmR` and `Middle3R_end`.

Evidence: [asset audit JSON](artifacts/twin-ascension-plan/asset-audit.json), [audit script](artifacts/twin-ascension-plan/audit.mjs).

### Spacing: concrete starting pose and responsive framing

The isolated WebGL preview uses actual `hand4`/`hand4left` geometry and original `hand5` texture details. It compares tight, balanced and wide poses before applying new materials. The first broad bounding-box check included offscreen wrist vertices; it should not be described as proof that fingertips clip. Distinguish intentional wrist cropping from finger/palm clipping in final browser checks.

Revised starting overlay pose at 16:9:

| Parameter | Starting value / policy |
| --- | --- |
| Hand camera | Existing 90-degree vertical FOV, .01 near plane, 3 m far plane |
| Projection group | Existing `16/9` X/Y scale and -.08 Z offset at 16:9 |
| Per-hand position | Right X **+.125**, left X **-.125**, Y **-.16**, Z **-.36** |
| Model scale | **.94**, positive on all axes |
| Base rotation | Existing X **1.8**, Y **pi**, Z **0** on each side |
| Across V–VII | Same resting spacing and mesh scale; power does not push hands progressively offscreen |
| Physics origins | Separate fixed gameplay data; roughly ±.10 m central launch origins as an initial probe, not derived from viewport size |

With this overlay pose, the central fingertips project to approximately **X ±.20635, Y -.18116 in normalized device coordinates at 16:9**. At 1920×1080 this is approximately 396 pixels between central fingertips, with each about 98 pixels below the crosshair. The approximate inner whole-mesh bounds begin at X ±.10723 at rest, leaving a visible center gap; compute final pixel masks after integrating motion and effects rather than using a bounding box as the sole readability test.

Portrait cannot reuse the wide desktop pair unchanged. The study scales the new pair's projected X/Y extent by `min(1, aspect/(16/9))`, then reanchors the lower wrist envelope to its reference bottom position. Keep Z depth, hand camera FOV and physical origins fixed. This preserves separation and keeps both hands attached to the lower edge instead of floating mid-screen after shrinking. It is an overlay layout policy only; never write responsive pose values into `World`, `HAND_MUZZLES` or deterministic trajectory generation.

An initial matrix probe covered **168 cases**: three spacings, seven aspect ratios from 32:9 through 9:19.5, and eight rest/motion/recoil configurations. At the preferred .125 pose, upper geometry (vertices above NDC Y -.75) stayed within approximately |X| .4801 across those probes. This is useful geometric evidence, not a complete gameplay visual test: it does not yet cover full combined motion, all five fingertip markers, actual touch/HUD masks, resize mid-shot, upgrade choreography or depth/pixel quantization from the production hand shader.

Final framing gates must include:

- Both central fingertips remain mirror symmetric at rest, with inward thumbs and visible fingers/palm. Wrist cropping at the bottom is intentional; finger clipping is not.
- The crosshair and its immediate aiming region remain clear at rest, max recoil and max supported movement intensity.
- Every fingertip/launch marker uses its own complete model matrix, including responsive framing and the shared movement pose. Existing I–IV framing and FOV tests remain unchanged.
- Portrait thumbnails must also be reviewed at actual phone size with touch controls enabled. Big review-board images alone do not prove mobile readability.
- Resize, fullscreen and orientation changes do not jump projectile physics or detach muzzle glow. Projection updates are view-only.
- Ultrawide does not stretch anatomy or move the two hands to the extreme corners. Exact artistic placement still needs a real arena review.

Evidence: [framing audit JSON](artifacts/twin-ascension-plan/framing-audit.json), [framing probe](artifacts/twin-ascension-plan/framing-audit.mjs), [spacing study](artifacts/twin-ascension-plan/spacing-study.png), [desktop material ladder](artifacts/twin-ascension-plan/material-ladder.png), [portrait material ladder](artifacts/twin-ascension-plan/portrait-ladder.png).

### Visual specification: dark body, bright channels, restrained power

Keep the existing low-poly anatomy, UV texture detail and nearest-neighbor treatment. The new pair should have a dark obsidian/charcoal body with emissive-looking channels derived from the existing skin detail. This differs substantially from simply displaying two copies of the current bright IV skin.

- **V / Twinflame:** copper-red channels, dark stone body, a brief synchronized ignition along both arms when unlocked. The new left arm rises from below while the right settles outward; both become damage-capable immediately on the threshold tick. Visual arrival never delays or grants shots.
- **VI / Dominion:** richer crimson/rose channels, slightly stronger edge lighting and a denser fingertip accent. Preserve dark areas between channels. No permanently obscuring flame sheet.
- **VII / Eclipse:** ivory channels and fingertip cores with a violet shell/edge. Make the ivory structure the dominant distinguishing feature, so VII does not read as “IV violet again.” A single short outward sweep sells the final unlock; normal firing returns to compact effects.

These material studies are isolated proposals, not the production lighting pipeline. Final shader work must retain environment lighting, flash texture transitions and upgrade sweeps, with tier colors explicitly carried through idle, firing and seeking. The existing shader temporarily yields to IV's original firing texture; if copied directly it would make all new forms briefly revert to IV's orange skin. Preserve the new material identity through the firing branch.

Use per-hand materials/uniforms when properties differ; reuse geometry and textures. Do not share a single mutable material with I–IV or cloned teammate arms. Avoid reusing the new podium `ascendant-material` shader: podium skin rank and weapon tier are independent, and that shader uses a different material pipeline. Shader cache keys must distinguish actual variants. Slow ornament animation, if added, derives from simulation time for pause/seek consistency; no trajectory or shot timing depends on material time.

The current hand environment normal uses `mat3(modelMatrix)`; new responsive nonuniform projection transforms can distort that direction. Use a proper inverse-transpose normal matrix for the new paired material and preserve the historical I–IV branch. The camera-space rim already uses `normalMatrix`. Recheck seams and normals in day, furnace, cosmic and low-quality scenes, not only against the study's dark background.

### Further code traps found in the second pass

| Concrete code path | Problem | Implementation decision |
| --- | --- | --- |
| `OriginalWeapon.socketScreen()` | Uses the one existing `pose.matrixWorld` for every socket | Resolve the owning hand group; use that group's matrix for right and left sockets |
| `offsetLaunch()` and `projectileView()` | Both clamp to four levels; shotgun unconditionally uses socket zero | Use a shared routing helper and seven-level view definitions; select the actual launch hand for every pellet |
| Solo `World.shoot()` | `shotKey` and attached `launch` are only created for crew shots; solo visual fallback index is zero | Preserve an explicit deterministic launch/muzzle identity on dual-hand solo projectiles; do not infer parity from global projectile ID |
| `OriginalWeapon.effect()` | Local per-projectile socket inference can scan unrelated age-zero solo projectiles | Carry a logical shot identity/index for new-tier shots or explicit owned muzzle metadata; no cross-assignment between bursts |
| `shotgunLaunch()` | Currently launches every pellet from `muzzles[0]` | Keep one global spread pattern; select right/left central origin by global pellet parity |
| `Renderer.effect()` | Replaces a remote effect's muzzle list with one right-hand avatar point | Resolve both cosmetic emitters for V–VII, preserve legacy one-point behavior below V |
| `crewMuzzle()` / avatar state | One upper/lower arm pair and one muzzle | Generalize to side-aware rig state and two points; keep missing-bone/fallback behavior |
| `DeathHistory.capture()` | Stores ten floats/projectile, omitting shotgun kind, launch routing and floor-bounce metadata | Extend the in-memory presentation sample with kind and enough muzzle identity to reconstruct new paired visuals; update stride/offset/budget calculations together |
| `ReplayPlayer` accepted versions | Uses `[4,5,REPLAY_RULES_VERSION]`; bumping the constant drops explicit support for version 6 | Maintain a supported historical-version table independent of the latest version |
| Crew checkpoint validation | Requires every `World.options` value to be boolean | Represent new legacy/capability selection compatibly, or version this validation before adding non-boolean options |
| Stats initialization / checkpoint restore | Hardcodes four `upgradeTimes`; adding zeroes while loading old checkpoints changes digest shape | Preserve four-element historical state exactly; use seven entries only for new rules |
| Renderer preparation | Calls `compileAsync` while hand variants may be invisible | Explicitly warm the new visible variants and restore state afterward; profile first V/VI/VII reveal for shader compilation stalls |
| Existing input help | Says homing unlocks at III although current code unlocks at II | Correct affected help while updating practice levels; do not redefine RMB as a hand selector |
| New-tier upgrade celebration | Per-player events currently also imply floor waves | Separate celebration from one authoritative collector wave; retain visible positional correspondence and replay restoration |

Death analysis is already a presentation scratch world, not deterministic simulation. Its format can change internally without rewriting historical disk replays, but its byte budget, sample thinning, object reuse and disappearance boundaries must stay valid with more projectiles. The current missing shotgun kind is an existing limitation exposed by this audit; the paired implementation must not propagate it into the new visuals.

### Simplified, exact routing contract

Use **one immutable salvo pattern** with total count `N`. For every global projectile index `i` in `[0,N)`:

1. Compute the same two seeded random samples in a fixed order, once.
2. For V–VII choose right if `i` is even, left if odd. Stream socket position within that hand comes from `floor(i/2)` and that hand's socket table. For shotgun use that hand's central socket.
3. Evaluate the shotgun's radial/angle stratum using **global `i` and global `N`**, not a per-hand half count. The global core is `round(.8*N)`; distribute those strata by parity as part of the same packet.
4. Evaluate the target from the shared camera aim ray and the selected physical origin. Each hand is separately swept against floor/armor/targets by existing physics.
5. Preserve `i`/routing metadata through prediction, compact reconstruction, full corrections, checkpoints and visual-only death samples. Never infer it from current projectile-array order, surviving count or global ID.

This supersedes the first pass's proposed per-hand shotgun pattern count. At 84 pellets, independently rounding two half-pattern cores would produce 68 core pellets while the global 80% rule produces 67; at 96 it would produce 76 instead of 77. Keeping one pattern avoids that unnecessary change and a second pattern count on the wire.

For a homing reserve of one, there is still one funded projectile from the right origin. Both models can share the brief charge/flash response, but do not add a second damaging projectile or a misleading full second projectile trail. For odd reserves the right receives one extra projectile. Existing homing priority when both buttons are held, primary fallback when reserve is empty, burst-on-release behavior and rehold recovery stay exact. Hold either action across an unlock: both hands use the next eligible salvo without input reset or extra cooldown.

A single effect per logical action drives audio and camera feedback. Its muzzle list may contain two or more positions, but must not create two `burst` events. The current camera feedback caps tier scaling at IV; preserve its bounded intensity unless a separate measured adjustment is justified. Split the existing small cosmetic particle budget between hands before raising it; effect density does not need to grow proportionally with projectile count.

### Implementation order revised after this audit

1. Pin current I–IV trajectory/replay fixtures and capture baseline frames before source edits. Recheck shared-tree changes and reserve the next version numbers. Keep launch math and historical options untouched for old rules.
2. Add tier data, a side-aware pose/socket registry and a shared deterministic routing helper. Integrate native paired models with the new materials in development previews, using the measured pose. This is the first visual review point.
3. Add one-budget V firing, solo routing identity and global shotgun routing. Verify both origins, counts, focused lanes, original RNG use, homing priority and once-only movement/gem push. Finish V before filling VI/VII from the registry.
4. Add all-tier progression, shared new-tier upgrade wave, HUD/practice/help, bounded audio/camera feedback and tier transitions. Keep historical four-tier snapshot/stat shapes selectable.
5. Integrate the new wire flags/routing in full updates, compact salvos and corrections; then left/right remote poses, spectators, checkpoints and death analysis. Run actual host/guest tests before ranking integration.
6. Update supported replay/ranking identities and validators, queued uploads, package/assets/PWA distribution and required local backend fixtures. Preserve historical reads and disable unsupported new ranking publication cleanly.
7. Run integrated visuals and performance tests at real aspect ratios/FOVs/quality levels with firing/movement enabled. Compare actual effective damage and collection pacing; refine the candidate constants from evidence. Save final screenshots and measurements alongside tests.

The implementation step does not need another design approval or a question about left/right controls. Remaining uncertainty is empirical: final spacing under active gameplay, final color separation, late-run effective damage, crew progression pace and device/network performance. Resolve these through the defined checks rather than treating the planning screenshots as proof of completion.

### Verification actually performed in the second pass

- Read-only remote default-branch check: remote `main` matches local HEAD `83f316e`.
- Native OBJ and raw GLB audits, saved as JSON; hand4/hand4left reflected position/normal/UV errors all zero.
- 168 isolated matrix/framing probes and six spacing/material pixel probes, with desktop/portrait screenshots visually inspected. No browser page errors reported by the preview capture.
- Existing production-path `node tests/weapon-launch-fov-browser.mjs`: **396 checks passed**, maximum normalized socket error about `9.10e-15`; mesh/glow agreement, unchanged physical state, and remote/spectator behavior passed.
- The earlier 35-test targeted simulation baseline remains recorded above; it was not rerun unnecessarily during this documentation/artifact-only pass.

Only the planning document and `artifacts/twin-ascension-plan/` were authored for this second pass. Runtime source/models/textures were not changed. The conservative portrait study leaves the pair visually small; final integration should improve presence within actual touch/HUD clearance rather than interpreting “fits” as “finished.” Final gameplay implementation, human playtesting and live deployment remain the next step.
