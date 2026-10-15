> Football-room revision, October 16: the obstacle course and small goal arches are removed. A separate room connects through the east wall, with an authored CC0 pitch/goal model from tiko479, ambientCG Grass004 texture, enlarged netted goals and host-authoritative skull scoring. F toggles keyboard readiness; touch retains its Ready button.

> Revision, October 16: the central hearth, separate wave action, ready rings, floating room plaques and expanded HUD have been removed. The pit is centered at the midpoint of the courtyard bounds. Solid authored wall meshes replace the coplanar floor meshes previously used for climbing. The compact HUD exposes readiness and descent; room details remain in Room & crew. Existing independent arm controls remain the only hand interaction. The original proposal below records the earlier design and is superseded by these revisions.

# The crew courtyard — implementation plan

Status: implemented and verified. Prepared 15 October 2026; implementation checked 16 October 2026.

Implementation choices: reuse the existing game skull and stone tiles, as requested; additional authored Kenney props are downloaded locally with embedded textures. The extra skull download was removed. The full unit suite passes (440 tests), production build passes, and two-client gameplay plus mobile/controller courtyard checks pass. Six real browser clients passed ten courtyard/run/return cycles; the focused courtyard regression suite passes 18 tests, including room closure during an open descent. A production-browser check also passed real public signaling, copied invitations, automatic joining, readiness, opening/cancelling the pit and host departure. See README.md and MULTIPLAYER.md for the implemented player flow and commands.

## Outcome and fixed requirements

The multiplayer room is a small shared courtyard that players enter as soon as they create or join a room. Friends can keep joining while everyone plays, changes their demon, and gets ready. A clunky skull, high-fives, a short climbing route, warm gathering area, and a visible record of the last descent make the space enjoyable before and between runs.

Replace the multiplayer doorway with a covered descent pit. It remains physically closed until every current participant is present, loaded, and ready. Only the host can press OPEN PIT. Opening does not start combat: everyone jumps in, then the crew starts together. No player starts the arena early or gets left behind.

Use authored, internet-sourced models. Reuse existing imported architecture and demons. New visible props must come from downloaded assets; no generated models or primitive stand-ins presented as final art. Transforming, recoloring, optimizing, and arranging imported meshes is allowed. Invisible collision shapes, UI, particles, lighting, and interaction logic are ordinary implementation work.

Scope includes all six priorities in the preceding proposal, plus arrival effects, ready runes, a small wave, optional results/replay inspection, and the full return-to-courtyard loop. Voice chat, matchmaking, persistent housing/progression, a shooting range, and multiple formal minigames are outside this implementation.

## Findings from the existing code

| Existing behavior | Required change |
| --- | --- |
| `FriendsSession.enterPrelobby()` requires all players ready. | Enter the courtyard immediately on room creation/join; readiness gates opening the pit. |
| Discovery calls the courtyard `playing`; offer and join paths reject `prelobby`. | A gathering courtyard remains discoverable and joinable. Freeze admissions when the host opens the pit. |
| `setReady`, color, and skin changes are blocked in the courtyard. | Permit them during gathering, with verified skin checks participating in launch eligibility. |
| `stepCrewEntrance()` starts on any player touching the seal. | Multiplayer uses explicit pit state and downward entry detection; remove the multiplayer seal trigger. |
| `stepEntrance()` uses a flat floor, rectangular bounds, and fall recovery below -8. | Add courtyard-specific floor/support/collision, pit shaft, climbing surfaces, and committed descent handling. |
| The same entrance is used by solo play. | Keep multiplayer layout/interaction state explicit so solo retains its existing entrance. |
| Guests predict entrance movement; remote movement interpolates by tick while survival time is zero. | Use the same authoritative pit collision state in prediction and host simulation; animate social objects using courtyard ticks. |
| Return to lobby clears the world and opens the room menu. | Host return rebuilds a gathering courtyard for all remaining peers and preserves a compact last-run summary. |
| Start is already delayed for a settling second and five-second shared arrival. | Reuse the established synchronized arrival after everyone commits to the pit; do not add another countdown. |

The working tree already contains substantial unrelated changes. Implementation must preserve them, make targeted edits, and record pre-existing verification failures separately.

## Player journey

1. Create a room and load into the courtyard with the pit sealed. Show COPY INVITE / ROOM & CREW / READY in a compact overlay.
2. A friend joins, receives the complete current world state, loads required assets, and acknowledges courtyard presence. Only then do they appear as PRESENT and become eligible to ready.
3. Show a short colored arrival effect once per actual arrival. Place newcomers around the gathering area without overlapping others or the skull. A voluntary click/tap enables pointer lock or audio where browsers require it; loading never depends on obtaining pointer lock.
4. Players kick the skull, high-five, wave, climb, change colors, or inspect the last run. Ready players can keep moving. Arrival, pose and sound effects never block controls.
5. Each player marks ready. Colored floor marks and a compact roster communicate JOINING / LOADING / HERE / READY / DROPPED. Empty slots do not count as missing players.
6. OPEN PIT becomes available to the host only when the host-side eligibility check passes. Guests see WHO/WHAT IS STILL MISSING or WAITING FOR HOST.
7. The host holds the explicit OPEN PIT button for 0.6 seconds. Freeze the departure roster, animate the hatch, reveal the shaft, and display JUMP IN TO DESCEND. The pit collider remains solid until the opening animation is complete.
8. Players jump or deliberately walk off the rim and drop. Passing a host-validated depth inside the shaft commits that player; they enter a short local waiting view looking into the descent, with 3 / 4 SOULS BELOW and remaining names. Their avatar disappears below the visible shaft. No death state is entered.
9. Once every departure participant has committed, the host creates exactly one arena epoch and uses the existing synchronized arrival gate. Clear courtyard-only input and effects. Survival time and enemy simulation begin only at the normal release.
10. After the run, retain the result/replay flow. Host RETURN TO COURTYARD brings everyone back to the hearth, resets readiness, closes the pit, restores the skull, and shows the last run and crew best.

The host opens the way; each friend takes the plunge. Do not force remaining players into the pit, impose an automatic departure timeout, or begin combat on the first jumper.

## Courtyard composition

Preserve the existing stone-and-ember identity and use the current playable footprint as the starting constraint. Final placement is adjusted after viewing at actual player height, rather than expanding the map to fit props.

- Back/center: gathering hearth with clear faces and comfortable spacing for six demons. Spawn in an inward-facing loose arc.
- Front/center: approximately four-meter-wide square pit with a roughly one-meter approach around its rim. Square construction suits the imported modular stone pieces and provides predictable floor collision. The final aperture must comfortably fit two demons side by side.
- Beside the pit: imported altar/pedestal with a clearly indicated host control. The accessible HUD OPEN PIT control is authoritative and always available to the host when eligible; the world pedestal is a spatial cue and contextual way to focus that control, not a required precision interaction.
- Left: skull play lane with two shallow arch targets. Leave an unobstructed path from the hearth to the pit.
- Right: short broken-stair/ledge/perch route; missing a jump lands safely in the courtyard. Climbing is visible to friends at the hearth.
- Near the hearth: a restrained last-descent plaque/panel. Detailed results and replay open on demand.

Replace the active front gateway with closed architecture in multiplayer. No glowing doorway competes with the pit. Keep ambient scenery subordinate to the demons and skull. Inspect the scene from spawn, either goal, perch, pit rim, shaft and mobile camera heights.

## Downloaded assets and provenance

Primary-source pages were checked during planning. Two Kenney archives were downloaded into memory and their GLB inventories and license files inspected; no new runtime assets have been installed yet.

| Use | Source and verified status | Planned preparation |
| --- | --- | --- |
| Main architecture, rocks, existing lanterns | Existing local Poly Haven assets; `public/models/entrance/LICENSE.md` records sources/artists/CC0. [Modular Fort 01](https://polyhaven.com/a/modular_fort_01). | Reuse loaded meshes/materials; arrange a multiplayer variant. |
| Skull toy | Existing in-game skull through `OriginalEnemies.clone('skull')`, using the current authored mesh and texture. | Normalize a clone for the rounded physics proxy; reuse geometry/texture with courtyard lighting. No additional skull download. |
| Hearth, altar, cups, candles, goal decoration | [Kenney Graveyard Kit](https://kenney.nl/assets/graveyard-kit), CC0. Archive inspected: `fire-basket.glb`, `altar-stone.glb`, `detail-bowl.glb`, `candle-multiple.glb`, pillars and stone-wall pieces exist. | Import only selected props. Match material exposure and palette; keep color variation restrained. |
| Pit rim, hatch, stairs and perch | [Kenney Modular Dungeon Kit](https://kenney.nl/assets/modular-dungeon-kit), CC0. Archive inspected: `gate-metal-bars.glb`, `gate-door.glb`, `template-floor-layer-hole.glb`, `template-wall.glb`, `stairs.glb`, `stairs-wide.glb` exist. | Test the hole module's actual opening. Arrange imported stone around a real aperture. Rotate/scale the imported metal gate into a horizontal hatch and slide it beneath the rim. Use imported walls/floor modules to line the shaft. |

Archive URLs observed:

- https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip
- https://kenney.nl/media/pages/assets/modular-dungeon-kit/7bed87605b-1771926065/kenney_modular-dungeon-kit_1.0.zip

Do not infer the downloaded kit version from the filename: the dungeon archive URL ends in `_1.0` while the current source page lists newer updates. Record the actual archive/license/hash used.

Store source metadata and licenses under `assets/provenance/courtyard/`; selected runtime GLBs/textures under `public/models/courtyard/`; add a human-readable license manifest. Record author, original page, exact download URL, SHA-256, original filename, and transformations. Ship local assets only; no runtime requests to model marketplaces. Asset acquisition and visual inspection are an early completion gate, not a late dependency.

Fire, rune glow, embers and arrival puffs use lightweight effects around authored meshes. Sound should reuse the existing licensed impact/stone sounds after listening, or use additional downloaded licensed recordings with provenance. Do not synthesize substitute models.

## Authoritative departure state

Introduce a small, explicit courtyard state owned by `FriendsSession`, with pure transition/eligibility helpers in a dedicated module. Keep the combat world's existing playing/dead state separate.

| Phase | Pit floor | Admissions | Allowed actions |
| --- | --- | --- | --- |
| gathering | Solid | Open up to six | Join, ready/unready, customize, play, host open if eligible |
| opening | Solid | Closed | Hatch animation; cancel/unready/disconnect invalidates launch |
| open | Hole | Closed | Move, jump, play, commit descent, cancel |
| collecting | Hole | Closed | Remaining players jump; committed players wait; cancel remains available |
| launching | No further courtyard movement | Closed | One arena transition after final eligibility check |

Suggested replicated fields: courtyard generation, phase, phase-start tick, roster revision, launch participant IDs, presence/load generation per member, committed IDs, skull state/reset generation, bounded recent social event IDs, and last-descent summary. Use serializable data, bounded collection sizes, and validated finite numbers.

OPEN PIT is an edge-triggered, revision-checked host action. The button must be visibly disabled with a useful reason unless:

- Every current member has an open gameplay channel and a current-generation courtyard-loaded acknowledgment.
- Every member, including host, is ready; no unresolved incoming admission or skin verification exists.
- The room is in gathering, the roster revision matches, and no opening/start is already in progress.
- Nobody is standing over the hatch footprint, including a small body-clearance margin. Highlight occupied cover and say CLEAR THE PIT COVER. Never open it under a player.

Evaluate eligibility and freeze membership atomically on the host. A join accepted before this check blocks opening until that arrival completes; a join received after roster freeze is rejected with a clear message. A pending connection has a bounded timeout and visible failed/connecting state so it cannot silently lock the room forever. Disconnected clients are handled using the existing grace policy; a new join receives current state, never an old launch snapshot.

The game cannot know about a friend who has not attempted to join. The host decides when the intended crew is assembled. Show current members and capacity clearly; never wait for all six slots to fill.

Any unready, invalidated presence, or participant disconnect before arena commitment aborts departure. First restore committed/falling players to reserved safe courtyard spawns, then restore solid cover and animate closure. Return to gathering, clear launch intent and committed IDs, and require a new host opening action. Keep unaffected players' ready choices where valid; returning from a completed run resets everyone to unready.

At the final commitment, call the existing arena eligibility hook once and perform one transition. If an existing ranking/eligibility flow delays or refuses launch, show its reason and restore the crew safely rather than leaving them below the pit. Find and verify all current consumers of `beforeArenaStart` before changing this path.

Late/duplicate open, ready, descent or cancel messages must not reopen or restart anything. Tie each to the room/courtyard generation and revision. Host identity is determined by the receiving session, never a client-provided boolean. Bump the network protocol where the changed semantics require coordinated clients, preserve the existing incompatible-build message, and update discovery/signaling namespaces together if needed.

Host loss follows current behavior: explicit room-ended/reconnect feedback and a route home. Host migration is not added by this feature.

## Pit simulation and presentation

- Use one layout specification for visual transforms, shaft bounds, cover support, goal planes, spawn points, climb surfaces and collision. Imported decorative meshes are not automatically walkable.
- The current renderer draws a complete tiled floor. Omit/split the multiplayer tiles crossing the aperture; an open pit must not retain an invisible or visible floor. Line the shaft so a downward camera never exposes mesh backs or the void outside the environment.
- Define a multiplayer floor/support query that returns the cover height while closed/opening and shaft support only where it actually exists while open. Keep climb surfaces explicit and include wall/side collision so players cannot walk through the perch or snap onto its top from below.
- Pass this state through host movement and guest prediction. Reconciliation must not use solo `entranceFloor` when the multiplayer cover has opened.
- Do not modify generic combat `die(FALLEN)` behavior to support the pit. Add courtyard movement handling that detects shaft entry before generic entrance reset/death, with a separate recovery rule for unintended out-of-bounds falls.
- Commit only a real player's downward crossing of a depth plane inside the usable aperture in the current open generation. Use previous/current positions for swept detection. Looking down, jumping across the pit, raising hands, the skull entering it, or merely overlapping the rim cannot start a run.
- Host validates the crossing from simulated movement; guests do not send trusted `I fell` claims. Latch commitment once and neutralize further movement commands for that participant until launch/cancel.
- Hatch animation uses phase ticks. Collision opens at one explicit synchronized boundary, not a render-frame callback. Cancellation returns players to safety before support changes.
- Add a soft rim glow and a subtle shaft light, stone/metal hatch sound and air below. Avoid a giant bloom surface or camera shake during gathering. Reduced-motion settings remove optional camera drift/pulses, while the required hatch state remains legible.
- Preserve the existing five-second arrival and spoken countdown. Courtyard ticks do not advance survival time, score, weapon upgrades, enemy schedules or combat RNG.

## Skull: tactile shared play

Use one approximately 0.6–0.75 m skull, scaled after inspection. Its visible orientation tumbles with its motion. Players never take damage and the skull cannot block or push players into the pit.

Implement one small host-simulated rigid-body-like object, not a general physics engine. State includes center, velocity, orientation, angular velocity, resting state, reset revision, and last impact/goal sequence. An invisible rounded collision proxy is appropriate even though the visible skull is irregular. The host owns all impulses, goals and resets; clients interpolate from the courtyard tick clock.

Behavior:

- Walking contact nudges; running contact kicks harder. Base impulse on approach velocity and contact normal, cap total speed, and apply a per-contact cooldown so touching a resting skull cannot generate unlimited acceleration.
- It rolls on the play floor, bounces from walls/goal posts, slows through friction and settles. Add a small deterministic contact wobble from its spin, without random explosive kicks. Use swept/substepped collision for the bounded maximum speed so it does not tunnel through thin walls.
- A player kick has quick local sound/pose feedback, but authoritative skull position is never overwritten by guest physics. Tune perceived delay in the latency test rather than promising identical feel at arbitrary RTT.
- Two low imported arch targets react to a full goal-plane crossing. One clack/chime and ember puff per crossing. A short return places the skull back at a clear reset point. Session-only goal counters may be small; there is no modal match or reward economy.
- When it drops into the open pit, falls outside bounds, or remains trapped, reset it after a short delay. It cannot count as a descending player. The host also has RESET SKULL in ROOM & CREW.
- Never spawn/reset it inside a player; select the first free authored reset point. Limit collision sounds by impulse and global cooldown, spatialize them, and honor sound settings.
- Joins receive current position/orientation and current reset generation without replaying old impacts. Full courtyard reset restores one skull, not one per client.

## Hands, wave and social feedback

Retain Q/E, AZERTY A/E, and controller triggers for the existing arms. Do not bind host interaction to those controls. Use a separate contextual F / controller face-button action where unbound, plus explicit touch and accessible menu controls. Confirm the final controller mapping against the complete controls file before assigning it.

High-five: two compatible raised hands, nearby players facing each other, generous hand/contact envelope, and a short host-side pair/hand cooldown. Evaluate once per tick across bounded player pairs. Emit one event ID, a brief local rig accent and spatial slap, plus a small two-color spark. No teleporting, body pulling or camera capture. Releasing the hands rearms the gesture; holding them together cannot spam it. Prevent distance-only activation through a wall or height mismatch.

Wave: a short explicit social action accessible from the crew panel/contextual touch control, using the existing rig. It is cancellable and cannot consume a jump, kick or readiness action. Both-hands celebration remains available at all times in gathering. Keep basic look direction and movement readable.

Presentation events are deduplicated, bounded and generation-scoped. Do not replay old welcomes/high-fives on join/reconcile. Clear emotes, wave state, button edges, pending social events and local feedback on focus loss, pause where appropriate, cancel, disconnect, departure and return. No courtyard cosmetic state enters combat replay digests.

## UI and accessibility

- Gathering HUD: room name, member count, compact ready/presence row, READY/UNREADY, ROOM & CREW. Host gets OPEN PIT with a precise disabled reason, then CANCEL DESCENT. Guests see WAITING FOR HOST or JUMP IN.
- Preserve escape/back, invite, leave, skin eligibility and connection feedback. Choosing a color or changing a skin clears that player's readiness and refreshes launch eligibility without closing the gathering space.
- Room overlay does not pause the host's shared world. It releases local pointer lock and neutralizes local movement as required. Resuming requires a user gesture where the browser mandates it.
- Distinguish loading from unready and network failure. Use labels/icons as well as color. Keep names legible at normal interaction distances without large persistent labels across the scene.
- Touch has usable Ready, Room, arms/wave and host Open/Cancel controls that do not overlap movement/look/jump. Controller focus can reach the same functions without a mouse. Host opening is available from the overlay even if contextual targeting is awkward.
- Last-descent card shows survival time, session crew best, and a new-best accent when applicable. Scope the crew best to the current membership identity set so a new composition does not inherit a misleading same-crew record. Detailed results/replay are optional and preserve current transfer behavior.
- Guests can inspect completed results and return to waiting controls, but only the host changes the whole session back to courtyard, matching the current session ownership model.

## Code organization and integration

Proposed new modules (names may follow existing conventions):

- `src/courtyard-state.ts`: phases, readiness/presence revisions, transitions, bounded events, eligibility reasons.
- `src/courtyard-layout.ts`: authored placements and shared collision/support/trigger definitions.
- `src/courtyard-physics.ts`: floor/support, climb collision, skull stepping, swept shaft/goal tests.
- `src/courtyard-scene.ts`: multiplayer scene, imported hatch/props, effect pools, cleanup.
- `src/courtyard-social.ts`: pair gesture recognition and pose events.
- `src/courtyard-ui.ts` and `.css`: compact controls, state reasons, summary, input-device hints.

Integrate with `multiplayer.ts` for lifecycle/admissions/authoritative stepping; `network-state.ts` and `network-presentation.ts` for replicated courtyard state and interpolation; `simulation.ts` for scoped entrance movement; `renderer.ts` for selecting the multiplayer courtyard and applying social/skull visuals; `main.ts` for create/join/return/input; `controls.ts`, mobile UI, `crew-avatar.ts`, and `audio.ts` for device support and feedback. Preserve solo entrance, combat, replay ownership and current user work.

Use the existing host worker clock and fixed stepping. Keep social/courtyard state out of combat checkpoints and the recorded arena. Clear interpolation/event caches on generation changes. Ship selected public assets through the existing Vite copy and PWA manifest, and verify installed-cache upgrades do not mix old client code and new protocol semantics.

## Implementation sequence and exit gates

1. **Baseline and asset gate.** Record relevant current test results; import and render the actual skull/props/hatch, retain provenance, measure payload, inspect scale/materials. Exit only with suitable downloaded meshes and a feasible pit/hatch assembly.
2. **Joinable gathering.** Host and guests enter immediately, remain joinable, receive state and acknowledge loading. Customization/readiness work inside. Verify two and six clients, including a late join while the skull state is changing.
3. **Departure state and collision.** Implement closed/opening/open/collecting/launching, host button, physical aperture, all-player commitment, cancellation/disconnect recovery and one arena start. Verify rendered and predicted collision match before decorative polish.
4. **Shared skull.** Add contact physics, spin, goals, bounded sounds and resets. Verify host/guest agree under simultaneous impacts and delayed packets.
5. **Social room.** Finish warm composition, arrivals, high-fives, wave, climbing route, ready runes and device-specific prompts. Inspect actual first-person and remote views, not just an overhead composition.
6. **Complete loop.** Return the entire crew to the courtyard after results; show last descent/crew best; repeat join/play/drop/run/return without stale state or duplicate listeners.
7. **Release verification.** Run the targeted suites, full unit suite and build, production-browser smoke, asset/PWA checks, and a sustained six-client loop. Capture screenshots/video of the final implementation and report actual results and remaining limitations.

Each phase is part of the authorized full scope. Do not stop at a static scene, placeholder skull, or menu-only readiness change and call the implementation complete.

## Required verification

### State and simulation

- Host cannot open with one loading/unready member, a pending admission/skin check, occupied hatch, stale roster revision, or guest-origin command.
- Empty slots do not block a smaller crew. Host-only rooms follow the same clear rules.
- Closed/opening hatch supports bodies; fully open pit has no hidden floor. Jumping across does not commit; downward shaft crossing does. A wide-FOV look-down shows correct body/shaft geometry.
- All combinations of host-first/guest-first/simultaneous/last-late jumps yield one arena epoch, synchronized release, and no courtyard input/effects in combat.
- Unready/disconnect/cancel during opening, open and collecting restores players safely before closure. Stale packets cannot recommit or reopen. Test host cancellation after some players have already dropped.
- New joins get current skull/phase/presence, cannot bypass load acknowledgment, and cannot enter frozen departures. Abandoned joins time out and unblock launch.
- Skull contact impulses are bounded; rest settles; collision/goal/reset work at corners and maximum speed. Skull pit entry cannot trigger launch.
- High-fives activate once, support either hand, respect distance/facing/height and release cooldown, and survive packet duplication without repeated sounds.
- Climb collision has solid sides and valid walkable tops; accidental outside falls recover. Combat and solo fall rules retain existing behavior.
- State encoding/decoding validates and round-trips all courtyard fields; interpolation uses tick time and respects resets and discrete pit changes.
- Return resets readiness/pit/skull/social caches; last run remains available; membership changes update crew-best semantics.

### Browser and device flows

- Two-client and six-client real WebRTC tests: create, join directly, invite additional friends while inside, change color/verified skin, ready/unready, host open, all jump, shared start, die, results/replay, return, repeat.
- Delayed asset load, missing required asset with visible retry, joining connection timeout, stale invite, full room, incompatible build, cancelled permission gesture, focus loss and host background clock.
- Simultaneous skull kicks and high-fives under RTT/jitter/packet delay; remote motion remains readable. Test guest inputs at pit-opening boundary for visible correction/floor mismatch.
- Keyboard QWERTY/AZERTY, controller-only navigation, touch landscape and portrait, narrow screens, 75/90/120/145 FOV, reduced motion, muted audio, and pointer-lock release/re-entry.
- Production build loads all local models/textures, no marketplace runtime dependency, no missing assets/console errors. Verify offline-installed assets load, with clear online-connection requirements for room join.
- Repeat at least ten complete six-client lobby/run/return cycles. Check object/listener/interval counts settle and late-join snapshots do not grow with session duration.

Adapt existing `multiplayer-entrance`, `multiplayer-browser`, `six-player-lobby-browser`, joining/mobile, emote/neck, presentation, skin/color transport, arrival, host-clock, recovery and PWA suites to the intended new flow. Update tests that assert the obsolete ready-before-courtyard/door-crossing behavior; do not retain contradictory assertions. Add focused courtyard state/physics/social tests and browser coverage for the new launch races.

Performance target: retain the current game's frame budget on the same measured low/high settings and viewports. Compare the current courtyard baseline with the new room at six visible players, skull motion, fire and social effects. Pool short effects, reuse assets/materials, cap lights and avoid per-frame geometry creation. Record measured frame times, draw calls, memory and download sizes; investigate material regressions instead of inventing a performance guarantee.

## Definition of done

All accepted room/social/play/return features are functional with downloaded final assets. A friend can join, understand readiness, enjoy the skull and gestures, see the host open a genuinely closed pit, jump with the crew, start the same run, and return to the same welcoming courtyard. Relevant automated tests, actual production build and manual visual/device checks pass, or any external limitation is explicitly reported. Planning is not implementation, and passing a local smoke test is not a claim of perfect behavior on every internet connection.
