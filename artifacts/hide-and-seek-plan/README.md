# Prelobby hide-and-seek room — Forgotten Repository

Planning date: 17 October 2026. Status: researched design and implementation plan; the game has not been modified. Dimensions and budgets below are proposed targets, subject to blockout and multiplayer validation.

Implementation follow-up: the room has now been built. See `../hide-and-seek/README.md` for the shipped behavior, screenshots, and verification results. This document preserves the original planning decisions.

## Experience

Build a completely new, enclosed west wing of the prelobby: a forgotten underground repository, with crypt corridors, stacked supplies, stone monuments, and a ruined shrine. It should feel large enough to disappear into while remaining learnable for the existing maximum of six players. The room connects directly to the spawn courtyard through a signed passage; visiting it requires no menu or teleport.

The defining requirement is that a standing player can actually disappear behind opaque cover. Darkness, low gravestones, sparse pillars, and decorative foliage cannot substitute for that. The space must support hiding with the current controls, without introducing crouching, crawling, moving props, or new interaction buttons.

Initial delivery is a social exploration and hide-and-seek space. Players can agree who seeks and count down themselves. Automatic roles, tagging, scoring, and rounds would be a separate feature; they must not hold up building a useful room.

## Grounded in this project

- The existing spawn courtyard occupies x = -6.3…6.3, z = -6.35…10.5. Football, drawing, and basketball occupy the east side. A west entrance provides an independent destination directly from spawn.
- `src/courtyard-state.ts` owns the connected walkable footprint, floor heights, solid props, and camera blockers. `src/simulation.ts` uses those solids and constraints in entrance movement. Visual additions alone would produce walk-through cover or inaccessible spaces.
- `src/entrance-environment.ts` currently places an uninterrupted west wall, cliff shoulders, rubble, and an end piece. Those authored models need a real doorway and a cleared connection; changing only the movement bounds is insufficient. Inspect their transformed bounds before selecting which pieces to split or reposition.
- `src/courtyard-scene.ts` owns prelobby assembly, floor tiles, loading, signs, and shared atmosphere. It already loads Kenney and Poly Haven models locally through `GLTFLoader`.
- Player eye height is 1.7 m; horizontal collision radius is .22 m. Current tuning has jump velocity 9 and gravity 26: a nominal jump raises the feet about 1.56 m on flat ground. Jumping must be part of sightline testing.
- Crew names are depth-tested sprites in `src/renderer.ts`, centered .9 m above the player origin and .49 m high. Their upper edge is approximately 2.85 m above flat ground before jumping. A 2 m crate does not conceal a stationary name label.
- `src/courtyard-neck.ts` permits up to .42 m forward lean with a small downward offset. Its present obstacle type extends vertically from ground to `h`; it cannot describe a ceiling or an elevated bridge accurately.
- The current floor function treats each solid as a filled column with a top surface, and side collision restores the previous horizontal position. This suits ground-level cover but does not support standing inside an enclosed prop beneath its roof. Tight corners also need sliding verification.
- Existing podium skins use emissive/custom materials. Their visibility through opaque surfaces and any postprocessing needs explicit verification rather than assuming dim lighting hides them.

## Footprint and connection

Proposed room bounds: **x = -82…-18, z = -26…30**, a 64 × 56 m footprint (3,584 m²). This is larger than the existing 44 × 60 m football room footprint. Keep all walking surfaces at y = 0 for the first version. Use an 8 m ceiling, with visually distinct roof sections and structural beams.

Reserve x = -18…-6.3, z = -1…5 for the connection to spawn. Its usable route should have two staggered opaque screens, leaving a minimum 2.4 m clear passage and two changes of direction. Join every footprint rectangle with overlap, rather than touching corners; collision radius must fit through the entire connection. The exact screen positions are fixed during blockout. No direct line of sight should run from the pit into the main room.

Replace the west-wall section at the doorway with fitted wall pieces and an arch; move conflicting cliff and rubble geometry away from the route. Place “HIDE & SEEK ←” at the courtyard opening and “COURTYARD →” inside the room. Use a warm lantern pair at the return entrance so navigation never depends on a minimap.

Proposed layout, north shown at the top for this drawing (negative z):

```text
                  64 m
       ┌────────────────────────────────────┐
       │ A. Crypt rows    │ B. Supply aisles│
       │ deep pockets     │ offset stacks  │
       │         ╲        │       ╱        │
       ├──────────╲───────┴──────╱──────────┤
       │ C. Monument maze    D. Arrival    ├── bent passage ── courtyard
 56 m  │ columns + screens   landmark      │
       ├──────────╱─────────────╲──────────┤
       │ E. Ruined shrine │ F. Service     │
       │ altar + recesses │ winding route │
       └────────────────────────────────────┘
```

This is a circulation diagram, not a final wall drawing. Preserve a perimeter loop, an inner loop, and three staggered cross-connections. Bound the longest uninterrupted view to roughly 12–18 m. No doorway, raised prop, or jumping position should reveal the whole room. Every zone needs two approach routes; individual deep hiding pockets may have one entrance.

Proposed zone envelopes are a 2 × 3 grid: west x = -82…-50, east x = -50…-18; north z = -26…-8, middle z = -8…12, south z = 12…30. Reserve 3 m clear circulation corridors along selected boundaries before placing props. These envelopes organize landmarks; full walls must not seal each cell into a disconnected room.

## Hiding inventory

Target **30 authored hiding spots**, with distinct search angles and at least five simultaneously useful spaces for a six-player group. Each receives an ID, standing position, access route, occluder IDs, and a set of nearby seeker viewpoints in layout data.

| Zone | Target spots | How the cover works | Counterplay |
| --- | ---: | --- | --- |
| Crypt rows | 6 | Offset solid crypt exteriors and stone partitions form deep side pockets | Walk around either end of a row and check recessed corners |
| Supply aisles | 6 | Staggered tall stacks with back gaps and L-shaped storage bays | Enter alternate aisles; no straight inspection from the zone entrance |
| Monument maze | 5 | Large columns paired with opaque return walls | Circle the monuments and check the wall returns |
| Arrival landmark | 2 | Two side recesses behind the entrance screen | Deliberately inspect both sides; arrival itself remains easy to navigate |
| Ruined shrine | 6 | Tall altar backdrop, side screens, and broken-wall pockets | Search from both shrine approaches |
| Service route | 5 | Winding corridor with alternating blind recesses | Follow the loop or intercept through the inner connection |

Use roughly 18 deep static pockets, eight cover positions that permit switching routes, and four more exposed trick positions. Adjust the distribution after playtesting; do not count the same recess twice from opposite standing points.

Deep pockets should provide about 1.2 × 1.2 m clear standing space and a .9–1.2 m entrance, with turning clearance measured against the rendered avatar as well as the .22 m physics radius. Main routes should be 2.4–3 m wide, with wider passing areas at intersections. Avoid long single-file choke points where another player can block escape.

Ordinary standing cover should be at least 3.4 m tall and broad enough to hide arms, horns, crowns, and name labels from intended approaches. Major sightline partitions should reach about 4.8 m: the current jump can lift a name label above 4.4 m. Some jump-peeking over ordinary props is acceptable counterplay; deep pockets must remain concealed from the tested jump viewpoints. Do not place convenient jump steps beside their protective walls.

Keep all required hide spots accessible without jumping. No usable spot may depend on clipping inside a coffin, walking through a crypt door texture, or entering a model whose interior has not been verified. Small trees, hay strands, fences, and low gravestones are decoration or partial cover only.

## Online model selection and verification

Use a coherent subset of the existing art sources. The following official pages were checked during planning:

1. [Kenney Graveyard Kit](https://kenney.nl/assets/graveyard-kit): primary set for crypt exteriors, pillars, monuments, coffins, rubble, lanterns, and hay storage. The page identifies it as CC0. Downloaded the official 5.0 archive to temporary storage and inspected its GLB entries; the exact inventory is preserved in `graveyard-model-catalog.txt` beside this plan.
2. [Kenney Modular Dungeon Kit](https://kenney.nl/assets/modular-dungeon-kit): wall, floor, and architectural infill. The current page identifies CC0 and version 2.1; this project's import script pins an older 1.0 archive. Reuse the already imported assets initially, or explicitly validate a version upgrade separately.
3. [Poly Haven Modular Fort 01](https://polyhaven.com/a/modular_fort_01): reuse the project's existing local stone architecture to make the doorway belong to the courtyard. The official asset page identifies CC0 and glTF availability.
4. [Quaternius Fantasy Props MegaKit](https://quaternius.com/packs/fantasypropsmegakit.html): optional supply-room furniture and storage alternatives. The official page identifies CC0 and glTF, but only a subset is free. Exact free filenames and geometry were not inspected; this pack is not a required dependency.

Confirmed Graveyard archive entries suitable for the art pass:

| Exact GLB basenames | Planned role | Geometry check still required |
| --- | --- | --- |
| `crypt`, `crypt-a`, `crypt-b`, `crypt-small`, `crypt-large` | Solid external cover arranged into crypt rows | Verify real dimensions and mesh extent; do not assume enterable interiors |
| `crypt-small-roof`, `crypt-large-roof` | Architectural accents on compatible crypt variants | Confirm alignment; keep roofs inaccessible |
| `coffin`, `coffin-old` | Storage accents and stacked compositions | Low pieces alone do not count as concealment |
| `hay-bale`, `hay-bale-bundled` | Supply stacks | Verify opaque silhouette; add architectural backdrop where necessary |
| `column-large`, `pillar-large`, `pillar-square`, `pillar-obelisk` | Monument maze and landmarks | Combine narrow pillars with walls to create sufficient cover width |
| `stone-wall`, `stone-wall-column`, `brick-wall`, `brick-wall-end` | Screens and recess walls | Fit repeated modules without stretching decorative detail excessively |
| `altar-stone`, `rocks-tall`, `debris`, `lantern-candle` | Shrine, cover clusters, visual detail | Keep decorative rubble out of movement lanes |

Store new runtime assets under `public/models/hide-and-seek/`. Extend the existing embedding approach from `tools/import-courtyard-assets.py`: preserve supplied textures, localize every dependency, and record author, source page, exact archive URL, archive version, source/output hashes, license, original path, and transformations in `assets/provenance/hide-and-seek/`. Download only the chosen source packs and ship only the needed models. Never fetch model hosts during gameplay.

Model names and archive presence have been verified for Graveyard; individual mesh bounds, interior suitability, materials, and in-game appearance remain implementation checks. The catalog is evidence for selection, not a claim that the room is already assembled.

## Visibility, lighting, and fairness

Use charcoal stone, weathered wood, muted bone, and amber navigation lights, with one cool landmark at the shrine. Each zone needs recognizable shapes and accents. Give routes enough ambient illumination to navigate on mobile; hiding must come from geometry. Existing scene hemisphere and directional lighting mean adding a roof will not automatically make the interior dark.

Suppress floating crew name sprites for avatars inside this room, independently for each avatar; restore them on leaving. Names remain available through the roster. This prevents a label above or beside partial cover from betraying an otherwise hidden body. Keep normal avatar colors and cosmetics initially and test the brightest skins. Verify that opaque cover occludes the avatar and its glow; add a narrowly scoped presentation fix only if an actual leak is found.

Include every gameplay cover surface in the camera-blocker definition. Account for camera near-plane clearance, neck lean, jump views, and corners. A roof is rendered as overhead geometry, not registered as a ground-filled solid. Explicit visibility checks are required for room culling: do not hide the room from the scene merely because the viewer stands outside its bounds while looking through the doorway.

Avoid new global audio listeners or per-prop looping sounds. Check whether existing footstep, landing, and emote sounds reveal players across partitions; spatialize or locally attenuate only confirmed problems. Stillness should not emit a locating sound. No minimap dots, automatic reveal effect, or floating hiding indicators.

## Implementation structure

1. Add `src/courtyard-hide-and-seek.ts` containing room bounds, connection footprint, opaque blocker definitions, floor-level solids, zone landmarks, prop placements, and hiding checkpoints. Use shared layout data for physics, scene assembly, camera constraints, and validation. Keep decorative props distinct from intentional collision geometry.
2. Extend the union in `courtyardContains`, collision/floor integration, and camera bounds/blockers. Refactor the west boundary blockers so the new doorway is genuinely open. Audit all assumptions about positive x and the old global camera rectangle. A larger rectangle alone does not enforce the passage shape.
3. Update `loadEntranceEnvironment` to create the doorway and clear intersecting western scenery. Preserve the solo entrance behavior by applying the new branch only to the multiplayer courtyard.
4. Add `src/courtyard-hide-and-seek-scene.ts`, attached by `CourtyardScene`. Assemble locally loaded authored models, floor, roof, signs, and shared materials. Keep prop scale consistent; use architecture to fill broad cover surfaces rather than distorting a single coffin or gravestone into a wall.
5. Add per-avatar label policy in `renderer.ts`, evaluated as players cross the room boundary. Verify restoration, reconnects, and replay presentation. Static layout needs no replicated prop state or network events; all peers use the same authored geometry. Audit network position validation for the expanded footprint.
6. Integrate loading diagnostics and failure recovery. Core prelobby loading should remain usable if optional room assets fail: block the entrance with an explicit loading/unavailable state until the required art and collision are ready. Prefer starting a separate room-load promise early over adding the whole room to the existing global readiness gate. Verify consistent availability across host and guests before admitting players.

The first version has no stairs, upper floor, crawl tunnel, moving door, or roof platform. Future vertical play requires support surfaces with base heights, vertical clearance, ceiling collision, and camera blockers with `minY/maxY`; the current `h`-only solids cannot represent those spaces safely.

## Performance targets

Start with 15–20 unique new model types, 120–180 placed instances, shared materials, and instancing for repeatable stone/column/stack meshes. Batch by zone so frustum culling can discard individual sections. Opaque walls do not automatically prevent WebGL from drawing geometry behind them; measure before adding room/portal visibility logic.

Initial budgets: under 8 MB additional compressed download, under 250k visible added triangles, and under 80 added draw calls from demanding room viewpoints. These are engineering targets, not measured results. Use 512–1024 px shared textures, baked/emissive lantern appearances, and at most two additional non-shadowed point lights. Avoid per-prop shadow maps and animation updates.

Compare the existing courtyard and the new room with six avatars at the same device settings. Aim for less than 10% median frame-time regression when looking at unchanged courtyard activities, and stable 60 fps on the development desktop / 30 fps on the selected mobile baseline. Report actual hardware, resolution, frame-time percentiles, draw calls, and transfer size before claiming success.

## Build order and acceptance gates

**A — Traversable blockout.** Implement footprint, doorway, floors, major walls, and 30 candidate checkpoints. Temporary geometry is acceptable in this stage. Verify the route from every spawn into each zone and back to the pit, with host and guest movement. Do this before the art pass.

**B — Prove concealment.** Place a real avatar at every checkpoint. Inspect standing and jumping seeker views from every relevant route; exercise bright skins, crown, arms raised, and the widest supported camera FOV. For deep spots, capture two-client screenshots proving complete concealment from intended approaches and visibility after the seeker rounds the protective corner. Ray samples to head/torso/feet help automate checks but do not replace screenshots of the full avatar.

**C — Authored model pass.** Import and record the selected online models, replace blockout visuals, build roof sections and coherent landmarks, and recheck collision against actual silhouettes. Maintain the proven hiding geometry throughout dressing.

**D — Multiplayer and performance verification.** Run focused courtyard, entrance, camera, multiplayer movement, and build checks. Add tests that exercise reachable spots, doorway crossing at maximum movement speed, host/guest collision agreement, and label restoration. Browser scenarios should cover desktop keyboard/mouse, controller, mobile turning, reconnect while hidden, leaving during pit opening, and returning after a run.

Completion requires all of the following:

- Every hiding checkpoint is reachable and escapable without clipping, jumping, or an interaction prompt.
- At least 24 of the 30 candidates pass full concealment checks; revise failed candidates until the target 30 useful spots is reached.
- Every deep pocket has a documented approach that conceals the player and a fair inspection route that reveals them.
- No body, name sprite, glow, or camera crosses opaque cover; sprinting and jumping do not bypass the room perimeter.
- The room is visually and physically enclosed, with no direct courtyard-to-room sightline and no walkable roof escape.
- Six players can use different zones without blocking every route; a real seeker can learn a systematic search path.
- Existing sports, drawing, spawn locations, pit readiness/opening, return-to-lobby flow, and solo entrance remain functional.
- New asset failures produce a recoverable entrance state, and performance is measured against the stated budgets.

Playtest a 25-second informal hiding countdown followed by a roughly two-minute search with two, four, and six players. Record time to first discovery, remaining hidden players, frequently ignored zones, and repeated unbeatable positions. At speed 11 m/s a straight 64 m crossing takes only about six seconds, so size alone will not deliver good hiding: adjust corners, approach angles, and cover spacing according to actual search behavior.

The deliverable is a room where the seeker must deliberately enter zones and inspect recesses, and the hider can move between cover or choose to remain fully out of sight.
