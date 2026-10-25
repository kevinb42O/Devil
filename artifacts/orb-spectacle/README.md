# Colossal Orb reveal

The post-Leviathan Orb now has a 19.2-unit diameter (four times the former 4.8), centered at least 11.8 units above the floor. It forms over 4.2 seconds using a match-time smooth curve, rotates at .24 radians/second and has a restrained animated red atmospheric corona. The floor light footprint broadens and the attack discharge scales with the owner's actual combat radius. Combat HP and beckon timing are unchanged.

Orb size is centralized in src/orb-scale.ts. New corrected spawns use a 9.6-unit combat radius. Presentation reads the enemy's stored radius, so old checkpoint enemies retain their old visible scale; legacy spawns retain radius 2.4 and height 5. The visible corona is atmospheric and lies slightly beyond the damaging core.

orb-reveal.mp4 is a 16-second 1280x720 game-renderer capture at standing-player eye height with real gameplay. The Orb forms, starts attacking and transforms nearby enemies. Decoded frames at 2, 5 and 12 seconds are included. high.png / low.png show both quality settings at an identical camera. report.json records measured body radius, scaled collision, lower-altitude legacy behavior, reveal interpolation and successful projectile contact beyond the old radius.

Validation: npm run build; node tests/orb-spectacle-browser.mjs; node tests/orb-lighting-browser.mjs; node tests/transmutation-waves-browser.mjs; node tests/enemy-hit-flash-browser.mjs. All focused checks passed. The production build retains its existing bundle-size advisory.

The broader combat-balance/contact/floor run passed 29/32 tests. Three failures involve tower placement, hand-II tower pulse damage and a historical crew checkpoint digest. All three were reproduced in an isolated temporary copy with the Orb spawn/scale changes removed. Those unrelated existing changes were left intact.

Recreate video: node tools/record-orb-reveal.mjs (Vite on port 5173).
