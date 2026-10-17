# Serpent anatomy and armor polish

Project-authored procedural geometry replaces the borrowed creature heads, floating head rings and torus segments on Centipede, Gigapede and Ghostpede.

- Sculpted elongated skull, recessed luminous eyes, layered brows, swept horns, cheek blades, hooked teeth and a separately animated lower jaw.
- Thick dorsal, lateral and ventral scutes, rolled metal edges, hollow rib cages, ivory blade tips and swept dorsal spines.
- Iron, gilded and spectral jade variants; gilded head crest and taller spectral horns and dorsal spines.
- Faceted exposed crystals, dark flexible recesses, longitudinal engraving and worn metal edges.
- Subtle traveling armor roll, jaw breathing and a tapered last third of the armor. Crystal centers and scales remain independent of those animations.
- Geometry is merged by finish and uses the existing segment instancer: five body draws per variant.

`*-before.png` preserves the previous material-gallery appearance. `*-body.png`, `*-head.png` and `*-segment.png` show the rebuilt models under fixed studio lights. `in-game.png` shows all three variants through the actual game renderer.

Validation: `node tests/serpent-polish-browser.mjs` writes `report.json`, checks finite geometry, damaged-core visibility and exact crystal alignment, then measures a three-snake, 85-segment scene. Latest run: 15 segment batches, 61 total scene draws, 617,122 scene triangles, zero anchor error and no browser/shader errors. The local GPU-synchronized median was 6.5 ms at 1440 × 1000; this is a local measurement, not a cross-device performance guarantee.

The existing 22-model browser check and 20 centipede movement, armor-contact and projectile regression tests also passed.
