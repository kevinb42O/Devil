# Exposed Orb boss

The user identified the red floating Orb exposed after Leviathan dies. The former purple ghost and orbit bands have been replaced by one project-authored faceted sphere at the existing 2.4-unit combat radius. Dark red surfaces carry animated fine pole-to-pole luminous bands. Dim polar glow anchors follow actual core transforms; the shared floor light field draws a red annular footprint beneath the boss. No gameplay rules or original-game assets were added.

arena-high.png / arena-low.png show the actual game renderer with mist. studio.png shows the surface close up. before-*.png document the former purple remake, not the original game's boss. The original reference is ../original-enemy-orb.png.

Validation: npm run build; node tests/orb-lighting-browser.mjs; node tests/enemy-hit-flash-browser.mjs. Orb checks cover sphere-only geometry, combat radius, emission without bloom or scene lights, animated light, real polar sources, unchanged scene light count at crowd scale, and no browser/shader errors. The production build retains its existing bundle-size advisory.

Recreate with the Vite server on port 5173 and node tests/orb-lighting-browser.mjs.

## Orb motion film

orb-in-motion.mp4 is a 16-second 1280x720 H.264 capture from the live game renderer. The camera holds still for the first six seconds, then approaches and arcs around the boss. tools/record-orb-film.mjs records with Chrome MediaRecorder and decodes the saved MP4 to verify its duration and resolution; video-frame-3.png, video-frame-9.png and video-frame-14.png were extracted from the deliverable for visual review.

The sphere spins at .55 radians/second around a fixed tilted axis without moving its center. Red energy surges travel from equator to poles; slower counterflow, polar vortices, narrow hot ribbon segments and a pulsing floor ring add motion at different depths. Animation is derived from match time for pause/replay stability. Browser checks verify 1.1 radians of spin over two seconds, unchanged axis/center, exact pose restoration on seeking, bloom-independent emission, shader animation and constant scene light count. motion-report.json records the actual clip metadata and sampled poses.

## Polar refinement

The latest polar treatment supersedes the faceted core and point-vortex descriptions above: smooth geometry with shallow physical wells, finite red rims, surface pulse fronts and invisible mist-only anchors. See ../orb-poles/README.md and ../orb-poles/orb-in-motion.mp4 for the current review.
