# Forgotten Repository

The new hide-and-seek wing is directly **left of the pit courtyard**, through the signed lantern entrance. It is a separate, enclosed 64 × 56 metre room. Follow the bent passage to six linked areas: the Silent Tombs, Smuggler's Hold, Watchers, arrival hall, Last Light, and Crooked Way.

Choose a seeker, count to 25, and hide. Thirty opposing hiding pockets, inspection routes, arches, and cross-connections provide places to disappear and routes to switch cover. The game keeps its existing movement controls. Floating player names disappear inside the wing and return outside. Roles, tagging, timers, and scores are agreed between friends; this addition builds the space rather than an automated competitive mode.

## Art and implementation

The room uses locally stored Kenney CC0 models from the [Graveyard Kit](https://kenney.nl/assets/graveyard-kit), including crypts, coffins, monuments, hay bales, lanterns, and shrine props. Original model filenames, license, pinned download URL, archive hash, and source/output hashes are in `assets/provenance/hide-and-seek/models.json`. The selected GLBs total 648,888 bytes, with embedded palette textures. No runtime request goes to an asset host.

Shared layout data drives collision, visual cover, camera blockers, and the hiding checkpoints. The west wall and surrounding scenery were opened for the new connection; the solo entrance retains its existing architecture. The room has opaque full-height cover, sliding swept collision, a roof, distinct zone colours, stone arches, brass route inlays, lantern pools, and subtle dust. Repeated model geometry is instanced. Lighting adds two non-shadowed point lights.

## Verification

- `npm test`: 542 tests passed, zero failures. Log: `unit-tests.log`.
- `npm run build`: TypeScript and production build checked.
- `npx tsx --test tests/hide-and-seek.test.ts`: all 30 positions are reachable from spawn with body clearance; concealment and inspection rays, swept collision, jump pressure, camera-blocker coverage, and host/guest snapshot round-trip pass.
- `node tests/hide-and-seek-browser.mjs`: renders and visually captures each zone; compares actual pixels with and without the hider at all 30 positions. All concealment approaches produce zero changed pixels, while every inspection route visibly reveals the avatar. Checks gold skin, jumping, raised arms, 145° FOV, camera lean, and name restoration. Results: `browser-results.json`.
- `node tests/hide-and-seek-multiplayer-browser.mjs`: two real WebRTC clients physically walk through both entrance bends. Host and guest enter and return; ready-up, pit launch, and returning to the lobby pass.
- Existing `courtyard-browser.mjs` (using the local Windows Chrome executable): two clients pass late joining, shared football, readiness, physical pit drop, cancellation, launch, and two return cycles.

Measured rendering in the 1440 × 900 desktop browser rig, with two avatars: interior viewpoints used 53–95 total draw calls and approximately 37k–59k total rendered triangles. The entrance view includes existing courtyard geometry: 133 calls / 74k triangles. These are total scene counts, not incremental costs or mobile frame-rate measurements. A six-avatar cutaway is also captured by the browser test. Physical phones and gamepads have not been separately tested for this addition; the room uses existing input and movement paths.

Screenshots: `entrance.png`, `arrival.png`, `crypts.png`, `stores.png`, `watchers.png`, `shrine.png`, `crooked-way.png`, `guest-in-room.png`. The test also produces `layout-cutaway.png`, hiding the roof only for that review image.
