# Multiplayer player colors

Implemented flow: create or join a lobby → choose a color in **Your demon**, above Ready → mark ready → enter the courtyard. No extra modal or required confirmation. Crimson is the default; eight named swatches work with touch, keyboard and the existing controller button navigation. Choices persist locally under `abyss-player-color`.

The host owns the roster. Guests send their saved choice in the reliable channel handshake and subsequent changes through a dedicated color control; the host validates palette IDs and distributes the roster in existing snapshots. Color changes lock on courtyard entry and unlock on return to the lobby. Multiple players may choose the same color; names remain visible.

The renderer colors only the cloned `Demon_Main` material, preserving eyes, horns and claws. The selection survives asynchronous model loading and updates both roster cards and overhead names. New crew recordings retain the optional color ID; old recordings fall back to Crimson. Color does not alter combat, projectiles or simulation state.

Validation:
- `npx tsx --test tests/player-colors.test.ts tests/multiplayer.test.ts tests/crew-replay.test.ts`
- `node tests/player-colors-transport-browser.mjs` (real WebRTC with isolated mocked discovery brokers)
- `node tests/player-colors-browser.mjs` (lobby UI, persistence, mobile layout and real demon materials)
- `npm run build`

## Ascendant: solo podium exclusive

Ascendant is an optional animated skin in the same lobby picker. The current solo #1, #2 and #3 receive gold, silver and bronze variants. Eligibility comes from the authenticated personal best and current rules-6 solo leaderboard, not the editable multiplayer nickname or team rankings. Choosing the skin verifies the rank before Ready; a regular swatch switches back immediately. Selection is remembered, rechecked in the lobby and frozen for each courtyard/run. Team replays retain only the skin ID and historical podium rank.

Authorization migration `20261015200600_podium_ascendant_skin.sql` was tested in PGlite and applied to the linked game project through its authenticated SQL Editor. `abyss_claim_podium_skin` issues a short-lived opaque proof only to an authenticated solo top-three identity. Proofs are bound to room and peer ID; verification checks the current solo rank again. The host independently verifies guest requests before accepting skin metadata. Auth UUIDs, session credentials and skin proofs are excluded from snapshots/replays. An RLS-enabled private table holds at most one proof per issuing identity; only restricted invoker RPC wrappers are public.

Live checks: unauthenticated claim returns HTTP 401; fabricated proof returns null; raw proof table is unreadable to browser roles; private rank helper is not callable by browser roles. Security advisors were rerun: zero errors, with the same eight pre-existing warnings. See `artifacts/ascendant/database-verification.png` and `database-advisors.png`.

Rendering uses a skin-only material shader with flowing luminous veins over dark violet and podium metal. Horns and eyes retain their original materials; no extra geometry, lights, particles, textures or draw calls. Animation uses simulation time so replay seeks and pause stay consistent. Lobby preview motion respects reduced-motion preferences.

Additional verification:
- `npx tsx --test tests/player-skins.test.ts tests/podium-skin-sql.test.mjs`
- `node tests/player-skins-ui-browser.mjs`
- `node tests/player-skins-render-browser.mjs`

### Gold headwear

Gold Ascendant now wears the existing `/models/relics/crown.glb` directly on the animated `Head` bone. Its bottom band is seated into the cranium. Only Gold's baked halo faces are removed; Silver, Bronze and normal avatars retain the original headwear and dark details.

The crown loads lazily once and its gold/gem parts merge into one shared geometry with vertex colors and one shared material. Fitting is measured once and stored as a fixed head-local matrix; there is no per-frame fitting or geometry work. The halo-free dark-detail geometry is also generated lazily once and shared. Switching back hides the existing crown and restores the original geometry.

`node tests/crew-crown-browser.mjs` verifies the seated position, head-bone attachment, motion, exactly one additional draw call, 128 removed halo triangles, asynchronous loading, and normal-color restoration. Preview: `artifacts/ascendant/crowned-gold.png`.
