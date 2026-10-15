# Responsive cooperative shooting

Status: implementation plan only. Gameplay code has not been changed by this planning task.
Prepared: 15 October 2026. Recheck the working tree before implementation: it already contains substantial in-progress changes.

## Outcome and release decision

The reported problem is offensive combat at 150–220 ms RTT: the guest shoots at what is visible, but damage and enemy death arrive late or the shot fails to count. Movement latency and general death forgiveness are not this project's objective.

Deliver two improvements together:

1. Valid contacts against the shooter's observed world count reliably.
2. Local impact feedback and eligible predicted deaths appear at contact, without waiting for host confirmation.

Keep physical projectile flight, weapon timing, damage, ammo, progression and cooperative rules intact unless explicitly versioned below. Retain one host coordinating shared outcomes. Do not add dedicated hosting, change player movement authority or redesign all survival collisions as part of this work.

Tonight's candidate is ordinary primary streams and primary shotgun bursts, across hand levels I–VII, against a deliberately enumerated set of supported targets. Homing, ricochets, absorption, armor and segmented targets require explicit eligibility and fallbacks; they cannot accidentally enter the new path. Expand coverage only after the complete simple-target path passes its gates. A limited but coherent improvement is preferable to enabling incomplete support everywhere.

No promise of zero bugs or a same-evening complete rollout is justified. The release criterion is a measured improvement with all specified correctness gates passing, rather than a deadline. If a gate fails, keep the feature disabled for that combination or the whole session. Do not describe an unmeasured build as ready.

## Verified current implementation

| Area | Current behavior | Consequence |
| --- | --- | --- |
| `src/simulation.ts` | `STEP = 1/120`; host `stepCrew` advances combat | Host owns damage and shared consequences. |
| `World.predictCrew` | Predicts local movement/fire; negative-ID daggers advance ballistically; does not call the complete projectile collision/damage path | Immediate firing is not immediate hit resolution; homing prediction is incomplete. |
| `World.shoot` | Seeded shot identities and individual dagger indices; launch convergence queries enemies and obstructions | Same random seed does not guarantee same launch if client/host target poses differ. |
| `FriendsSession` | Network pump every 25 ms; target snapshots every 50 ms; numbered input retransmission and acknowledgement | Network scheduling contributes to delay independently of RTT. |
| `SnapshotTimeline` | Adaptive 50–200 ms delayed enemies, predicted local player, camera correction; projectile presentation uses separate time rules | Contact queries must use a defined presentation world, not arbitrarily mix `world.time` and snapshot time. |
| Reconciliation | `applySnapshot` replaces enemies/projectiles, then outstanding inputs are replayed | Pending damage, removals and effect identities must persist outside disposable snapshots. |
| Host projectile collision | Swept target motion, armor, floors, weakpoints, segment health, homing absorption, delayed explosions | Reuse these rules; do not introduce a second approximate combat implementation. |
| `damageEnemy` | Changes health, stats, effects, gems, behavior and delayed boss spawning | Calling it on a guest's ordinary world would speculate shared consequences. |
| Effects | Reliable delivery; event-ID deduplication; predicted firing effects tracked by shot key | Need contact-level deduplication and separate predicted/confirmed effects. |
| Crew replay | Input replay/checkpoint digests; replay version 1, combat revisions 18–20 | External accepted combat decisions must be recorded and deterministically replayed. |
| Crew scores | Eligibility currently requires combat revision 20 for new runs | A changed combat mode must not silently claim old rules. |
| Protocol | Explicit protocol compatibility check | Bump protocol for the new wire schema and fail clearly on mixed builds. |

`MULTIPLAYER.md` contains some older capacity/progression wording; code is authoritative for this plan. Do not expand this task into a general documentation cleanup.

## Architecture

### 1. One shared collision kernel; separate state and effects

Extract, in small behavior-preserving steps, projectile advancement/contact selection from authoritative consequences. Represent a contact with projectile identity, contact ordinal, target/subtarget identity, contact type, swept time fraction, point, incident direction and resulting projectile disposition.

Explicitly supply query viewpoint, target poses, arena time, activation state and collision options. Several target transforms depend on a player/viewpoint; audit those call sites rather than silently using whichever crew member the world currently selects. Preserve the established armor/floor/weakpoint ordering and tie-breaking.

Use the same contact rules in solo, host gameplay, guest prediction and report validation. Separate adapters apply authoritative damage or update a guest prediction overlay. Preserve solo outputs and existing legacy replay paths with differential tests before enabling networking changes.

Do not refactor all enemy AI or all rendering to obtain this separation. New module names below are proposals, not mandatory structure.

### 2. Explicit presentation samples and shot identity

Expose an immutable presentation sample: source snapshot frame IDs, interpolation fraction, represented host tick/time, relevant target transforms/activation state, and local camera/controller transform. Compute contacts over consecutive sampled trajectories, not single endpoint overlaps. Handle discontinuities (spawn, teleport, activation, correction and removal) explicitly rather than sweeping across them.

Define how fixed simulation substeps sample the presentation timeline when rendering stalls. Do not couple fire rate, damage or validity to display refresh rate. Render-time smoothing must not silently change the physical launch origin.

Use `(epoch, shooterId, firingLife, shotSequence, daggerIndex)` as the stable projectile key; use contact ordinal only where multiple interactions are legal. Associate a shot with its causal input sequence and immutable firing-time level, mode, ammo authorization, seed and launch descriptor. Reconciliation reuses this identity and cannot emit another report/effect for the same contact.

Audit the existing shot key: it does not itself include epoch/life. Do not reuse a pending report across a restart or confuse old-life projectiles with a respawned player's new shots. Already-fired projectiles may remain valid after shooter death according to existing rules; validate against the recorded firing life, not simply the shooter's current life.

### 3. Host shot registry and bounded history

Register each legal shot as the host consumes the original input. Do not introduce a second fire-event path that grants additional shots or compresses held-button timing. If a launch/contact report arrives first, retain it in a bounded dependency queue until its input is consumed, or reject it with a retriable dependency status. No mutation inside transport callbacks.

Retain:

- Legal firing records and terminal projectile outcomes for projectile lifetime plus bounded network slack (ordinary lifetime 2.8 s; homing 8 s).
- Recent target collision state and exact per-peer sent snapshot/baseline references needed to reconstruct the presented view.
- Removal/death tombstones, so delayed reports can distinguish already-resolved targets from unknown entities.
- A bounded outcome ledger and acknowledgement sequence.

Keep projectile lifetime history separate from short pose history. A tentative 750 ms recent view window is a starting configuration to benchmark, not a derived guarantee. Bound valid view age with host-authored frame references, per-link observations and jitter allowance; do not trust arbitrary client timestamps or assume RTT is symmetric. Size final history and byte caps using the dense six-player benchmark.

Do not clone an entire `World` every tick. Store compact collision frames, immutable shared target data and per-peer frame references. Refuse or fall back safely when history is unavailable; never accept a fabricated contact merely to avoid a correction.

### 4. Reconcile launch convergence before validating contact

The launch itself is a first-class issue. Guest and host currently choose aim convergence using different enemy poses. Validate the guest-observed convergence against the referenced presentation sample, reconstructing muzzle placement and spread from the legal input/seed and firing state. Derive damage and reserve consumption on the host.

Never accept arbitrary client projectile origin, direction, damage or ammo. If using a client launch descriptor, validate it against reconstructed input movement and observed scene with explicit tolerances for quantization/camera correction. Avoid widening hitboxes as a substitute for a coherent launch.

The accepted launch must be the launch used by host simulation, peer replication and replay. Determine how far forward the projectile is advanced at host registration without skipping intervening collisions. Preserve relative timing of different shots; no immediate max-range damage.

### 5. Bounded hit reports and deterministic arbitration

Report only meaningful contacts for locally owned eligible projectiles. A candidate wire record includes epoch, firing life, shot/dagger identity, causal input sequence, source presentation frames/fraction, flight/contact time, target/subtarget, and contact ordinal. Point/direction are evidence or diagnostics; authoritative reconstruction supplies actual values.

Host validation checks:

1. Authenticated sender owns the registered legal shot.
2. Epoch, firing life, identities, finite values, ranges, expiry and payload limits are valid.
3. Claimed view is derived from frames actually available to that peer, with permitted age and interpolation.
4. Launch and accumulated flight are possible at the reported contact time.
5. Earliest collision respects intervening targets, armor, floor, activation, and previously spent projectile energy.
6. Target/subtarget existed; already-dead targets resolve as an explicit no-op/superseded outcome without resurrection or duplicate rewards.
7. Contact order and damage budget are legal.

Never let the old host collision path and report acceptance independently deal damage. Each eligible projectile needs a host state machine: registered, awaiting/reconstructing contact, committed terminal outcome, or a defined authoritative fallback. Candidate host contacts can be retained without applying competing damage. A per-shot deadline/fallback policy must be fixed and tested; a late report cannot retroactively spend a projectile already terminally resolved by fallback.

Maintain a monotonic host commit sequence. Apply accepted decisions at a defined fixed-tick phase, then acknowledge them. Repeated reports return the existing outcome. Arrival ordering across peers is recorded as host commit order; identical network delivery produces identical replay, without claiming different network schedules always produce identical matches.

Use reason-coded outcomes: accepted, superseded, dependency pending, rejected, and expired. A missing target caused by teammate damage is not automatically evidence that the local collision was impossible.

### 6. Prediction overlay survives snapshots

Maintain confirmed state and a separate ledger of pending local contacts. Derive predicted health/subtarget health from authoritative state plus only the unincorporated local contributions. Do not repeatedly subtract pending damage already reflected in a snapshot.

Snapshots carry a combat commit watermark and required per-shot outcomes so that a lost ACK, late snapshot or reordered update cannot resurrect a confirmed kill or double-apply health changes. Outcomes and matching snapshots have one consistent causal interpretation. Keep acknowledgement retention bounded; provide recovery when an outcome ages out.

Generate predicted hit feedback once, at physical contact. Use contact identity to suppress matching confirmed blood/audio/impact/kill effects. Store overlay removals outside `applySnapshot`; suppress matching enemy/projectile presentation while pending. Do not mutate snapshot baselines or confirmed state.

Do not speculate spendable gems, shared upgrades, authoritative stats, boss phases or progression. Optional noncollectible visual gem previews need their own identity and are not necessary for tonight. Scoreboards and final statistics remain confirmed.

On rejection, remove only the affected pending contribution and derive the corrected view. Restore a falsely removed enemy with a brief defined correction rather than perpetual invisibility. No silent prediction timeout: timeout resolves to a reason-coded fallback/correction. If reversals are frequent, disable that eligibility class for subsequent shots/runs rather than masking the problem.

### 7. Predicted kills must not introduce invisible lethal enemies

This is a release blocker for actual enemy-removal prediction. Do not globally grant survival authority or ping invulnerability. Instead resolve the narrow causal conflict between an eligible pending shot/kill and a subsequent lethal contact from that exact enemy.

If the host is about to finalize such a death, briefly hold only that unresolved outcome while the bounded shot/contact dependencies settle. The rule applies to host and guest under the same semantics. A validated earlier lethal hit can neutralize that enemy's disputed contact; invalid/late/nonlethal shots cannot. Reports must carry enough host-mapped timing evidence to establish causality, with a firm deadline and resource cap. Unrelated enemies, falls and other lethal causes still resolve normally.

Define what actions and gem collection are allowed during a provisional lethal state, and avoid accepting shots that occurred after an eventually confirmed death. Defer team-wipe finalization until affected pending outcomes settle; do not finish/publish a run and then revive it. Preserve respawn deadlines and life transitions with explicit event ordering. If this cannot be implemented and verified, do not ship local enemy disappearance; immediate impact feedback alone is not the complete promised result.

Do not rewind the full live world and undo unrelated teammate actions. Accepted damage changes the current shared world at commit time, with documented historical eligibility. Already-emitted offspring/projectiles and boss schedules are separate consequences: either handle their causal cancellation explicitly or exclude those targets from predicted removal in the first candidate. No arbitrary retroactive despawning.

### 8. Transport and congestion

Batch binary reports and outcomes. Keep input delivery, lifecycle/release messages and combat outcomes ahead of replay transfers. Prefer a bounded dedicated unordered reliable combat channel after measuring shared SCTP congestion; separate channels do not create independent physical bandwidth. If repeated unordered datagrams are chosen instead, application ACK/retry/expiry is mandatory. Pick one delivery design during the transport spike and record the decision.

Flush a batch in the current turn after contact or on a short bounded timer (initial target at most one 120 Hz step), without sending each dagger as its own packet or increasing all snapshot rates. Piggyback ACKs when useful without making outcome delivery depend on the next large snapshot. Bound bytes, records, retransmission, dependency queues and per-tick validation work. Batch fragmentation must stay below practical datagram limits or use explicit bounded chunking.

When queues reach limits, stop speculative admission before silently losing accepted events. Resolve outstanding work consistently; fall back per shot using the negotiated policy. Never discard a committed kill or let report floods starve movement. Measure total traffic including packet overhead/retries, not just payload calculations.

### 9. Compatibility, replay and public results

Negotiate the feature and eligibility set before a run; freeze the selected mode for that run and identify it in diagnostics/replay. Protocol mismatch asks all players to reload. Do not enable based solely on client-local URL flags that leave the host unaware.

Replay must capture accepted launch decisions, combat commits, and any provisional-death resolution that inputs alone cannot reproduce. Record their exact application tick/phase and deterministic ordering. Seeking restores the event cursor and relevant ledger state; checkpoint digests include state that changes future outcomes. Rendering a replay does not transmit reports or generate live speculation.

Preserve readers/playback for existing revisions 18–20. Allocate a new cooperative rules revision and appropriate replay schema extension/version; do not change solo `COMBAT_REVISION` just to version network decisions. Public eligibility must reject the experimental mode explicitly until upload/readers/rules support it. The implementation must clearly expose this consequence; no silent failed score upload. Supporting ranked publication under the new revision is a later release gate, not permission to publish incompatible results.

Any eventual database/leaderboard change is a separate implementation step requiring the applicable Supabase skill and its verification workflow. No schema work is needed for a private experimental candidate.

## Coverage and fallback policy

| Combination | First candidate | Full implementation requirement |
| --- | --- | --- |
| Primary stream, hands I–VII, simple exposed targets | First complete path | Accurate launch, swept contacts, shared damage and predicted kill |
| Primary shotgun, hands I–VII | Required before calling tonight's build broadly improved | Up to 96 daggers/burst, exact pattern/damage, aggregate target prediction |
| Armored targets / spiders | Explicitly gated | Same animated armor/viewpoint/exposure; ricochets/impacts cannot become damage |
| Towers / bosses | Gated | Weakpoint identity, partial destruction, gem timing, offspring and boss phase consequences |
| Segmented enemies | Gated | Independent segment sweeps/health, dead crystal behavior and no duplicate rewards |
| Floor bounces | Existing authority until independently proven | Full ordered path, floor time/normals/energy and lifetime penalties |
| Homing and ghost absorption | Existing authority until independently proven | Same steering/targets, energy, absorption, ammo and lifetime |
| Delayed explosions / upgrade pulses | Host-owned | Exactly-once derived damage; no forged secondary reports |
| Remote teammate shots | Confirmed presentation; no local damage claims | No duplicate predictions, correct attribution |
| Solo / courtyard / spectators / historical replays | Existing behavior | No live combat reports or gameplay changes |

Eligibility is determined for the whole projectile/path. A supported shot unexpectedly encountering an unsupported obstruction must not pass through it or acquire two authorities. Specify transfer-to-fallback before implementing mixed-path weapons.

## Implementation sequence and checkpoints

- [ ] **P0 — Baseline and reproduce.** Preserve existing user edits; inspect active checkout and instructions. Capture off-mode results, current build identity, delayed shooting footage and diagnostics. Use real WebRTC peers with controlled symmetric/asymmetric delay. Classify confirmation delay, contact disagreement, launch mismatch and input backlog independently.
- [ ] **P1 — Collision/identity foundation.** Extract the minimal shared kernel; add stable contact/shot identities and presentation samples. Require zero unintended solo/legacy behavior differences. Run host-only candidate contacts in shadow mode without changing outcomes.
- [ ] **P2 — Host validation and transport.** Add registry/history, bounded queues, negotiated capability, commit ledger and launch validation. Observe reports without applying speculative visuals; compare local candidates to validated outcomes. Resolve divergent launch behavior first.
- [ ] **P3 — Complete simple combat.** Enable exactly-once shared commit plus persistent local health/effect prediction and eligible removals. Implement causal lethal-conflict handling, replay decisions, lifecycle cleanup and fallback switch together. This is the first meaningful end-to-end candidate.
- [ ] **P4 — Tonight's breadth.** Support primary streams and shotgun bursts across all seven hands for enumerated targets; profile dense shooting. Reject broad rollout if progression makes most encounters fall back or unsupported interactions leak through.
- [ ] **P5 — Extended interactions.** Add armor/weakpoints, segments, bounces and homing in independently gated increments; expand derived consequences and ranked compatibility only after their tests pass.
- [ ] **P6 — Release.** Review diff against starting working tree, run mandatory checks, archive evidence, validate a human host/guest A/B session, then enable only the verified scope. Preserve immediate return to the existing mode between runs.

Do not stop after adding blood effects and call the reported problem fixed. Conversely, do not expand into full-world rollback to meet a deadline. If tonight's complete candidate is not ready, report the exact failed gates.

## Acceptance metrics

These are proposed release targets to validate, not observed results:

- Eligible local impact-to-visible-hit/death: next rendered frame after collision processing; p95 within two frame intervals under the measured device baseline. At 60 Hz, target roughly 33 ms or less. Measure from physical contact, not trigger press.
- At 150–220 ms RTT, at least 50% reduction in p95 contact-to-visible-death versus feature off for eligible lethal hits, without changing projectile travel.
- In controlled unobstructed supported fixtures, every valid reported contact commits exactly once; no duplicate stats, gems, ammo spending or effects. Near-boundary armor/floor fixtures must produce the correct miss too.
- Zero predicted removals reversed in deterministic supported fixtures. Record rejection/reversal rates separately for dense/random sessions; unexplained legitimate rejection is a blocker for that eligibility class.
- Zero invisible-source deaths from accepted predicted kills in the causal-conflict suite.
- Stable bounded queues/memory through loss, host stalls and a dense soak; all pending state drains or expires explicitly.
- Performance target: no more than 10% p95 frame-time regression on the same dense guest scene; host simulation p95 stays inside the 8.33 ms tick budget or at least does not worsen an already-over-budget baseline. If baseline is already over budget, fix/limit the candidate before release rather than claiming the condition passed.
- Initial incremental combat traffic target: under 20 KB/s per active guest in dense primary-fire scenarios, including retries where measurable; tune from actual records/packets and verify physical transport totals. Not a prediction of final cost.
- Host/guest final confirmed health, kills, rewards and replay digest agree after settling, regardless of ACK/snapshot arrival order.

## Required verification matrix

| Dimension | Cases |
| --- | --- |
| Network | 0/50/150/220/300 ms RTT; symmetric and asymmetric paths; 0/1/5% loss; duplication/reordering; 20–80 ms jitter; short loss bursts; no advancing host tick; state congestion with effects/replay traffic |
| Rendering | 30/60/120+ Hz; guest and host background/resume; short main-thread stall; low performance guest; large state transfers |
| Players | 2, 4, 6; swap host roles; two players hit the same target/weakpoint in the same interval; mixed latencies |
| Weapons | Tap, stream, hold/release during reconciliation, shotgun jump, all hand levels, upgrade mid-flight, homing reserve boundary; report arrives before firing input |
| Geometry | Static/moving/crossing targets; behind armor/floor; moving segments; emerging/inactive/burrowing states; first hit consumes a dagger; unsupported path transitions |
| Outcomes | Accepted/rejected/superseded/expired; ACK before snapshot and vice versa; old snapshot after kill; target removed by teammate; death while own dagger is in flight; delayed report after respawn |
| Lifecycle | Courtyard/countdown, run start/restart, lobby return, disconnect/leave, team wipe with pending hit, respawn at wipe boundary, close with queued combat, mixed protocol |
| Presentation | One blood/impact/sound per contact; one kill burst; no duplicate daggers after handoff; no persistent ghost targets; camera correction does not manufacture a hit |
| Replay/results | Old revisions still play; new replay save/download/seek/digest; oversized/truncated decision streams rejected; experimental mode not mispublished as revision 20 |

Keep fast deterministic contact/ledger tests separate from real two-browser WebRTC tests. Browser fixtures need active enemies, projectiles and damage: existing movement-only responsiveness tests do not establish shooting quality. Artificial `RTCDataChannel.send` delay tests should account for SCTP retransmission limitations; a real cross-Atlantic A/B playtest is still necessary to confirm subjective improvement.

Run the existing build and unit suite, then relevant projectile/shotgun/twin-hands, multiplayer latency/responsiveness/presentation/transport/recovery/large-state/respawn/spectator, crew replay and score-eligibility browser suites. Use the existing package scripts and discovered harness requirements. Record pre-existing failures separately; never silently repair unrelated user work. Browser tests may write artifacts, so review those changes too.

## Proposed file responsibilities

| File/module | Responsibility |
| --- | --- |
| `src/simulation.ts` + proposed `projectile-contact.ts` | Shared movement/contact kernel and deterministic authoritative consequence adapter |
| Proposed `network-combat.ts` | Shot registry, contact/outcome ledger, validators, bounded history/queues |
| Proposed `combat-prediction.ts` | Guest pending-damage/removal/effect overlay and causal reconciliation |
| `src/network-input.ts`, `src/network-shots.ts` | Causal input/firing identity and validated launch descriptors |
| `src/network-presentation.ts` | Explicit sampled view, trajectories and overlay application |
| `src/multiplayer.ts`, `src/network-codec.ts`, `src/network-state.ts` | Capability/protocol, combat transport, host tick integration, commit watermark and lifecycle |
| `src/main.ts`, renderer/audio effect integration | One prediction update path; deduplicated effects and diagnostics |
| `src/crew-replay.ts`, replay viewer/transfer and `src/crew-score.ts` | Versioned decisions, deterministic playback/seek, explicit experimental eligibility |
| New focused tests + existing integration suites | Correctness, subjective-latency proxy, overload and regression evidence |

Avoid coupling the collision kernel to `FriendsSession`, rendering, or network callbacks. Keep clean dependencies so solo and historical playback do not acquire live networking state.

## Diagnostics and rollout

Expose negotiated mode and eligible/fallback shot counts, candidate/accepted/rejected/superseded/expired contacts, rejection reason, contact-to-feedback time, contact-to-commit time, pending count/age, reversal count, duplicate suppression, history bytes, validation time, combat bytes/retries and lethal-conflict deferrals. Retain existing input queue, RTT, interpolation and host-step diagnostics.

Feature off must execute the previous authority path. Freeze behavior at run start; do not silently toggle authority mid-projectile when a browser slows down. A failing client can stop admitting new speculative shots under the negotiated fallback policy while already-admitted shots settle. Global rollback to the original mode occurs between runs.

Deployment checklist: same build for every player; cache/service-worker update verified; mode agrees across peers; experimental score status clear; no new visible debug controls during ordinary play; tested fallback available; baseline and candidate evidence attached. The current task authorizes planning, not deployment.

## Evidence and limits

- Local source inspected: simulation, shot launch/encoding, presentation, command history, snapshot replacement, replay recording/playback and score eligibility, plus existing projectile/multiplayer tests.
- Risk of Rain 2's [PizzaClientLagFix](https://github.com/Goorakh/PizzaClientLagFix/tree/d6d395da7de5f94ece4a779b655a241244690e52) demonstrates client contact authority for specific incoming attacks. It does not solve our offensive combat and is not an implementation to copy wholesale.
- [Noita Entangled Worlds damage forwarding](https://github.com/IntQuant/noita_entangled_worlds/blob/33174dbbb5f3c1603e1ffd3052f4773284a16532/quant.ew/files/system/damage/cbs/send_damage_to_host.lua) illustrates selective local authority, not proof that arbitrary client hit claims are safe.
- [SnapNet's shooter example](https://snapnet.dev/docs/unreal-engine-sdk/samples/shooter-game-sample/) distinguishes prediction, reconciliation and confirmed effects. Its hitscan rewind example does not directly implement our physical daggers.
- No baseline gameplay benchmark, new automated test run, prototype, cross-Atlantic playtest or implementation result is claimed by this plan.
