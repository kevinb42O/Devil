# Replacement models — 17 October 2026

Implemented locally on `codex/free-model-remake`, based on the pulled GitHub commit `f9abc5b`. No push or deployment.

All 22 enemy entries use replacement geometry. Nine Quaternius Ultimate Monsters and the Quaternius Spider are sourced as CC0 GLBs, with exact URLs, license pages, SHA-256 hashes, and source/runtime paths in `assets/provenance/remake/models.json`. `public/assets/models/remake/LICENSE.md` contains credits. Source copies are unchanged; runtime processing samples a flying/idle pose, bakes shared geometry, converts colors to a shared palette, adds limb motion and attachments, and reduces swarm meshes with meshoptimizer (MIT).

Coverage includes four flying tiers, their four transmuted variants, three original spawner towers, both brood weavers, both capsules, skitters, all three articulated convoys, the sovereign, rift heart and fracture spire. Pickups, arena blocks, gore, and non-projectile fragment meshes also use authored replacements. Existing licensed courtyard/entrance props remain in use. The historical courtyard skull toy now shares the new CC0 swarm creature.

Combat hands retain the existing prelobby model. The combat upper arms now angle outward from the shoulders, leaving a clear gap between the hands while keeping the wrists aimed forward. The left combat fingers reflect the right hand’s joint pose, including its thumb, before independent gestures are applied. Their aiming frame now explicitly keeps local dorsal +Z aligned with character up projected perpendicular to aim, fixing the inverted wrists. Left/right/both gestures still override those poses and work in combat, multiplayer, and replays. The hand browser test checks finger symmetry and dorsal direction across 84 tier/FOV/pitch combinations.

The spawners are project-authored Rift Obelisk, Twin Foundry, and Crown Citadel architecture. Their one/two/three chimneys and buttresses now rise 6/9/13 units above the moving enemy root. Telescoping foundations reach the arena floor over raised tiles and during inward travel. Crystals sit just below the crowns, with matching damage targets and enemies ejecting from the enlarged top outlets. Older solo and team replays retain historical targets and emission heights through recorded tower-rule metadata. Spawn cadence is preserved. `tower-scale.png` shows all three from player eye height.

## Validation

- `npm test`: 555 passing, zero failures.
- `npm run build`: passes, with the existing large-bundle warning.
- `npm run test:combat-hands`: passes; 84 orientation/view combinations, all four input schemes, and 42 bullet socket/render comparisons with maximum difference zero against `f9abc5b`.
- `npm run test:remake-models`: 22 nonempty finite model templates; tower and spider weak-point centers agree with the current simulation; all renderer paths load without page/shader errors; no old enemy, hand, floor, blood, or smoke model requests.
- Swarm mesh reduction: 699–700 body triangles per flying enemy or spiderling. The 1,000-enemy fixture reports 12 draw calls and 715,351 submitted triangles. Its CPU render measurement is a local diagnostic, not a hardware-independent FPS claim.
- Production startup smoke passes at the local Vite preview URL.
- Courtyard gestures, teammate aiming, replay/death bodies, and projectile muzzle regressions pass.
- `python3 tools/import-remake-models.py --check`: all ten source/runtime SHA-256 pairs agree.
- Production rendering archive audit: exactly 12 retained projectile meshes and seven textures, byte-identical to their source. Removed rendering assets are excluded by the new build allowlist.

Open `index.html` through the dev server to review all 22 model captures. `in-game.png`, `dense-swarm.png`, and `report.json` contain renderer evidence.

## Remaining scope

This completes the requested first model pass. The complete runtime audio has now also been replaced; see `../remake-audio/index.html` and `../remake-audio/README.md`. The new towers use authored cylindrical core collision and crown damage targets. Historical replays retain the former tower collision/targets; historical spawn/arena data and other enemy collision hulls still await a separate migration pass. The retained bullet assets remain an explicit user-selected exception. This is not a claim that all original-game content has been eliminated or that the full remake is finished.
