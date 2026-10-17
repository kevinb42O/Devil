# Enemy material collection

The remaining 19 creature types now have authored surface profiles; the three completed tower finishes are retained. Every rendered part in all 22 enemy templates, including convoy segments, was checked for a surface material and valid coordinates.

## Material placement

Imported material labels and wing bone weights preserve anatomical regions: shell, secondary tissue, wing membrane, bone/teeth, dark eye socket, luminous eye, mouth and metal. Those attributes survive model merging, simplification and instancing. Surface coordinates are stored before mesh placement, so textures stay registered during movement and repeated instances.

Species profiles control the material family, palette, scale density, roughness, metalness, relief and markings. Structured detail includes overlapping scutes, bilateral dorsal marks, radial wing spars and cross veins, keratin growth rings, skin folds, pole-to-pole egg growth, radial convoy armor sectors, engraved metal, spectral capillaries and mineral cleavage. Fine procedural variation supplies grain and wear; it does not choose the anatomy masks or large markings.

All finishes use one opaque surface pass. No raster texture downloads, extra model triangles, alpha sorting or per-enemy lights were introduced. Pickups are outside this pass.

## Roster

| Enemy | Runtime kind | Finish |
| --- | --- | --- |
| Cinder Wasp | skull | Burnt umber cuticle, amber abdominal bands, smoked mica wings with radial veins. |
| Iron Wasp | skull2 | Gunmetal cuticle, bronze abdominal bands, worn nickel scutes and blue smoked wings. |
| Veilwing | skull3 | Aubergine dermis, directional tension folds, dry pores and pale scar tissue. |
| Drake | skull4 | Overlapping oxblood scales, pale ventral plates, wine membranes and striated ivory horns. |
| Hollow Wasp | transmuted1 | Ash pearl cuticle and silver abdominal bands over a cold jade spectral core. |
| Hollow Stinger | transmuted2 | Violet steel scutes, platinum bands, opalescent wing membranes and luminous indigo joints. |
| Hollow Veilwing | transmuted3 | Pearlescent spectral tissue, longitudinal folds and recessed luminous capillaries. |
| Hollow Drake | transmuted4 | Frosted jade scales, pearl ventral armor, spectral blue membranes and bleached horns. |
| Rift Obelisk | squid | Carved masonry, engraved weathered metal and amber crystals. |
| Twin Foundry | squid2 | Carved masonry, engraved weathered metal and amber crystals. |
| Crown Citadel | squid3 | Carved masonry, engraved weathered metal and amber crystals. |
| Brood Weaver | spider | Burnished chestnut chitin, bilateral ivory chevrons, fine pores and ringed legs. |
| Armored Matriarch | spider2 | Midnight ceramic carapace, broad ivory dorsal markings and reinforced steel jaw plates. |
| Brood Capsule | egg | Leathery olive egg case, longitudinal growth ribs, branching veins and a luminous green seam. |
| Armored Capsule | egg2 | Armored malachite egg case, layered scutes, reinforced growth ribs and olive mineral flecks. |
| Skitter | spiderling | Olive juvenile cuticle, amber joint bands and a narrow pale dorsal stripe. |
| Iron Convoy | centipede | Forged iron armor, directional machining, recessed panel seams and rubbed nickel edges. |
| Gilded Convoy | gigapede | Aged gilded armor, engraved lozenges, dark recesses and worn champagne-gold edges. |
| Hollow Convoy | ghostpede | Jade spectral armor, etched silver panels and cold luminous seams along the convoy. |
| Astral Sovereign | leviathan | Blue obsidian scales, broad aged-ivory chest plates, burgundy membranes and old gold fittings. |
| Rift Heart | orb | Amethyst wraith tissue and a polished mineral heart with nested rifts and electrum orbit bands. |
| Fracture Spire | thorn | Cleaved volcanic glass, long mineral strata, mica glints and fine ember-colored fracture lines. |

## Review

- Open index.html through the development server for the filterable collection and previous/polished material toggle. New before/after captures use the same camera, model, pose and studio lights. Towers retain their finished materials in both views.
- all-enemies.png documents the entire roster; highlights.png is a compact selection. Family sheets separate hunters, hollow variants, brood, convoys and elites.
- Each creature has a full-size PNG. The three convoy types also have separate head and segment close-ups.
- in-game.png and dense-swarm.png use the actual game renderer.
- report.json contains per-part materials and semantic regions, feedback checks and synchronized frame samples.

## Validation

- Production build passed, with the existing Vite bundle-size advisory.
- 27 tower, enemy rule, collision and replay unit tests passed.
- Full model browser suite: all 22 kinds rendered, no page/shader errors, no old enemy asset requests; 1,000 swarm enemies remained batched at 10 draw calls.
- Material browser suite: all parts covered, finite surface attributes, stable instanced coordinates, hit-material restoration and studio captures for all 22 kinds.
- Rendered hit-flash browser checks passed, including separate instance flags, growth/reallocation and visible orb/thorn flashes. The fixture now retires the previous sinking tower corpse between isolated enemy cases.
- Real-bullet tower crystal checks passed for hit pulse, retrigger, isolation, destruction and shared materials/programs. The fixture expectation was aligned to the remake's existing 160 ms pulse; runtime timing was not changed.

At 960 × 800, low quality, with 1,000 enemies and explicit GPU synchronization, the final material run recorded a median 6.6 ms per frame versus 3.0 ms for the old flat materials; both used 10 draws and 713,651 triangles. These short local samples include CPU/GPU synchronization and are not a cross-device FPS guarantee.

Recreate the captures with node tests/enemy-materials-browser.mjs and the review collection with node tools/create-enemy-material-gallery.mjs.
