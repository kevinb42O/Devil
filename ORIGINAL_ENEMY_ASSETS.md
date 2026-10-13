# Original enemy presentation — 13 October 2026

The initial asset pass covered eight kinds; the subsequent replica pass covers all 22 enemy entries, including native higher-tier, transmuted, boss and obstacle rigs. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current behavior. All implemented enemy kinds now use original Devil Daggers mesh and texture data. The former constructed enemy meshes have been removed. The first summoner uses the original `minisquid` crest, skull, horns, jaw, gem, and squid arms. Squid II uses its own original parts. The large spider uses the original body, head, jaw, fangs, palms, and three leg segments; its held gem uses the original crystal texture and `gib` mesh. Skulls, eggs, spiderlings, and centipedes likewise use their original component data. Arena tiles and loose gems now use original geometry and textures.

Acquisition, hashes, and the importer are documented in [ORIGINAL_WEAPON_ASSETS.md](ORIGINAL_WEAPON_ASSETS.md). The combined local import contains 439 rendering files under the Git-ignored `assets/original/devil-daggers/` directory. A fresh checkout requires reimporting the resource data.

## Large spider behavior

The spider hovers outside the arena edge. It never walks toward the player or toward loose gems. It raises its head, faces the player after three seconds, attracts gems to its mouth, and ejects consumed gems as eggs individually. Sustained hits keep its head exposed; a one-second gap after a hit triggers the protective fold. Eggs are launched onto the arena and hatch five spiderlings after ten seconds. These behavior rules follow the [pinned community enemy descriptions](https://github.com/NoahStolk/ddinfo-core/blob/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Wiki/EnemyDescriptions.cs). Off-arena placement is also described in this [firsthand gameplay account](https://scientificgamer.com/thoughts-devil-daggers/).

The browser implementation enforces an off-edge anchor even as the arena shrinks. Mouth, held crystal, exposed head collision, and protective head animation share the same coordinate transform. A single consumed gem produces a single egg. Egg flight and bouncing replace the earlier stationary spawn. Summoner crystals now have independent hit points and disappear individually when destroyed.

## Port limits and verification

Original mesh vertices, UVs, and textures are preserved. The engine's skeletal joint transforms were not included in the resource archive; modular joint placement and animation were assembled in this renderer. Scale, edge clearance, jitter, turning rate, gem acceleration, egg launch speed, bounce, ejection cadence, fold duration, and collision radii remain calibrated values rather than measurements from Sorath's engine. The original spawnset and full enemy AI have not been certified.

`npm test` checks off-arena movement, head exposure timing, one-gem/one-egg conversion, hatching, and separate Squid II crystals. With the development server running, `npm run test:enemies` loads all eight creature families and checks for missing assets and shader errors while capturing screenshots in `artifacts/`. Development-only `/?enemy-preview=spider` and the other implemented kind names offer inspection fixtures. Production omits these overrides.
