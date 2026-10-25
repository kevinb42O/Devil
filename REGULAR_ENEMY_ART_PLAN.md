# Regular enemy art direction — 25 October 2026

Status: art direction confirmed by the user. Skulls I–IV and their transmuted variants, both adult spiders, spiderlings and both eggs now have a completed local implementation pass. See `artifacts/skull-horror/README.md` and `artifacts/brood-horror/README.md` for captures, verification and known test limitations. The sections below preserve the original brief and delivery plan.

## Goal and scope

Make the ordinary enemies feel like vicious, unnatural creatures in the same horror tradition as Devil Daggers. Their anatomy, silhouette and movement must carry that identity at combat distance. More surface detail alone will not solve the current complaint.

Primary scope: `skull`, `skull2`, `skull3` and their `transmuted1–3` counterparts. Secondary scope: `skull4` / `transmuted4`, `spider`, `spider2`, `spiderling`, `egg`, `egg2`. Skull IV is a regular roster entry despite its larger size; preserve its current grounded behavior. Review it after the flying skulls rather than letting it delay the main improvement.

Excluded: all three snakes/pedes, all three squid/tower kinds, Leviathan, Orb and Thorn. Treat Thorn as outside this regular-enemy pass. Preserve the approved towers, snakes and bosses.

User-confirmed direction: author new designs much closer to the originals' horror and silhouettes. Use the retained original meshes as close visual/anatomical references. Produce newly authored runtime geometry.

## Asset audit: the originals are retained

Checked the local import against `assets/original/devil-daggers/manifest.json`: **439/439 files exist and match SHA-256**, including 130 OBJ meshes and 227 PNG textures. This establishes completeness of the retained import, not a claim that every asset in every released game version was extracted.

| Family | Retained original geometry | Associated references |
| --- | --- | --- |
| Skull I | `boid.obj` | `boid.png`, hit/gib and `boidlev.png` variants |
| Skull II | `boid2.obj`, `boid2horns.obj` | Body/horn textures, including `lev` variants |
| Skull III | `boid3.obj`, `boid3horns.obj`, `boid3jaw.obj` | Body/horn/jaw textures, including `lev` variants |
| Skull IV | `boid4.obj`, `boid4jaw.obj` | Body/jaw textures, including `lev` variants |
| Spiders | `spider*` and `gigaspider*` component meshes | Heads, bodies, jaws, fangs, palms, legs and armor details |
| Spiderlings | `spiderling.obj`, `spiderlingleg1–3.obj`, `spiderlingpalms.obj` | Juvenile body and appendage textures |
| Eggs | `spideregg1.obj`, `spideregg2.obj`, `gigaegg.obj` | Egg textures and flash texture |

The assets are preserved locally but are not the current enemy render path. `src/original-enemies.ts` is a compatibility re-export of `RemakeEnemies`. `vite.config.ts` ships an allowlist of original projectile visuals and excludes the original enemy meshes/textures. An original-mesh restoration would require renderer and packaging work.

`ORIGINAL_ENEMY_ASSETS.md` describes the historical original-model pass. `artifacts/remake-models/README.md` and `artifacts/enemy-materials/README.md` describe later replacement stages, but their wasp/veilwing descriptions no longer describe the current flying skull anatomy. Use current source as implementation authority.

## Current diagnosis

Reviewed current anatomy code alongside the saved skull redesign and flight captures; these are existing captures, not freshly generated screenshots.

- Tiers I–III now use `src/skull-anatomy.ts`. The first is a clean, elongated skull; the second resembles a forged helmet; the third is a split mask with trailing tissue. They already have cavities, teeth and custom regions, so the next pass must change their dominant shapes instead of repeating the previous feature list.
- Rounded orbital rims and orderly teeth soften Skull I. The long open mandible produces an expressive screaming-mask read. Tiny surface cracks disappear at normal play distance.
- Broad metal plates, a horizontal light slit and tidy luminous inlays make Skull II read as equipment. Its fantasy helmet identity competes with the intended anatomical horror.
- Skull III's split plates, symmetrical horns, rib shapes and folded tissue create a supernatural identity, but can read as an ornamental mask or robed figure. Test a compact predatory skull direction against this incumbent.
- Skull IV uses authored head pieces with retained dragon wing geometry in `src/drake-anatomy.ts`. Its existing grounded presentation is a gameplay constraint.
- Spiders use authored eight-legged anatomy. Preserve their convincing articulation; focus review on face, body proportions and distinctions between tiers. Eggs remain stretched icosahedra with a luminous hoop and tip, giving them a constructed capsule read.
- Motion already has damped heading, banking, pitch and hit response. Keep that work. New anatomy must work through the real instanced combat renderer, not only cloned studio models.

## Proposed visual direction

**Ancient bone, torn flesh, deep darkness and sparse internal fire.** The focal point is a skull or maw that appears capable of tearing into the player. Build every design around one unmistakable silhouette and one dominant anatomical threat.

Study the original mesh from front, side, rear and three-quarter views before assigning exact new proportions. Measure cranium depth, orbital recess, jaw opening, horn span and overall bounds. Original part names alone are not enough to reconstruct anatomy; do not invent undocumented joint transforms and describe them as authentic.

| Kind | Proposed identity | Main shape decision | Avoid |
| --- | --- | --- | --- |
| Skull I | Small feral dead head | Compact cranial mass, recessed sockets, sharp cheek transitions, uneven biting jaw; stronger front-to-back depth | Rounded toy skull, evenly spaced cone teeth, oversized expressive eyebrows |
| Skull II | Horned impaling skull | Horns grow from a heavier cranial structure; swept piercing silhouette and compressed face distinguish it immediately | Helmet panels, light bars, decorative armor seams |
| Skull III | Apex flying jaw | Deep skull, dominant articulated-looking jaw and hooked bony projections; a more forceful predator silhouette | A tidy mask with a cloth skirt; adding spikes without changing the head mass |
| Skull IV | Heavy grounded demon | Reassess jaw depth, head/wing relationship and silhouette against original `boid4` components, retaining grounded scale/contact | Turning it into a new airborne boss or rebuilding its movement |
| Transmuted I–IV | The same creatures transformed | Retain the tier's silhouette and proportions; expose cold internal light through cavities, damaged bone or sparse fissures | An unrelated species, uniform cyan paint, bloom obscuring the face |
| Spider / Spider II | Gem-devouring brood predators | Emphasize mouth/fangs and a low threatening front; heavier tier gains a different mass distribution and armor silhouette | Generic realistic spider with only a new color; changing the functional gem/head placement |
| Spiderling | Fast biting juvenile | Preserve thin articulated legs while making the compact body and mouth identifiable in a moving swarm | Simply shrinking every detail on the adult |
| Egg I / II | Living brood sacs | Uneven shell, organic longitudinal tension and a restrained hatch split; armored version has stronger shell overlap | Manufactured capsule, perfect equatorial neon hoop |

Use dirty ivory, soot, dried blood and dark tissue as proposed material anchors. Give cavities genuine depth and a dark backing. Keep bone edges legible under the existing environmental light without washing the entire enemy white. Emission belongs inside eyes, throat and tissue breaks; remove decorative luminous linework where it weakens the anatomical read.

Asymmetry should be deliberate and stable: a broken tooth group, chipped orbital edge or damaged horn. It must not erase tier recognition or produce random geometry on every spawn. Fine procedural grain is the final layer, after the silhouette succeeds in flat shading.

## Delivery sequence

### 1. Establish a fair reference board

Build a development-only comparison of the retained original, current model and proposed model. Start with Skull I. Include front/side/three-quarter views under identical neutral light, a black silhouette view and actual arena views at proposed sample distances of 5, 15 and 30 world units. Use identical camera/FOV, apparent scale and pose when comparing variants. Label any manually reconstructed original assembly as approximate.

Keep this reference loader separate from the production enemy route. Reuse Three.js OBJ/texture loading; reconstruct modular placement only as needed for review. An image-generation mockup can support discussion but cannot substitute for playable mesh evidence.

### 2. Resolve Skull I in the real renderer

Author one convincing new Skull I and show a short pursuit/turn/near-contact sequence, tower ejection and a mixed-distance swarm. Verify it feels more threatening in motion and remains readable with bloom/mist at low quality. Present the concrete comparison for the user's art-direction decision before rebuilding the entire family. Do not treat passing tests as visual approval.

### 3. Complete the flying skull family

Extend the approved anatomical language to II and III with distinct mass distributions and horn/jaw silhouettes. Make each tier recognizable in monochrome at matched distance. Apply transmuted treatment after base forms work. Preserve the existing motion controller and tune cosmetic limits only if the new bounds demand it.

### 4. Bring the rest of the ordinary roster into the same world

Review Skull IV, then spider faces/body proportions, juveniles and eggs. Retain successful adult leg articulation and gem presentation. The goal is a coherent family of threats, with effort weighted toward the enemies seen most often. Leave completed excluded families untouched.

### 5. Validate combat presentation and hand off

Capture the completed family in the actual arena under storm, furnace and depths lighting, low/high quality, and close/mid/far views. Include a dense mixed swarm, real hits/deaths, transmutation, multiplayer guest rendering and replay seeking. Deliver a clickable comparison gallery and short gameplay clip, with unresolved visual choices clearly identified.

## Implementation constraints

- Main integration points: `src/skull-anatomy.ts`, `src/drake-anatomy.ts`, `src/spider-anatomy.ts`, scoped branches in `src/remake-enemies.ts`, and scoped profiles in `src/enemy-material-profiles.ts`. Add an egg anatomy module if its geometry warrants it.
- Keep simulation positions, collision radii, HP, damage, targeting, spawn cadence, movement paths, tower emission and replay/network formats intact. Decorative teeth/horns must not imply a radically different damaging volume.
- Preserve `creatureCoord`, `creatureRegion`, `motionWeight` and juvenile gait attributes, plus existing hit/death and instanced-motion behavior. If jaw movement is introduced, author a bounded deformation in the merged/instanced path; moving a studio child object does not animate combat instances.
- Preserve the current one-draw-per-kind path for flying tiers I–III and their transmuted variants. Use the existing under-2,400-triangle skull fixture ceiling as a maximum, and aim close to current tier costs rather than spending the entire ceiling by default. Establish separate current baselines for Drake and brood geometry.
- No per-enemy lights, transparent tissue layers or extra material passes for the dense swarm. Keep geometry shared and variant selection deterministic for replay and multiplayer presentation.
- Measure current code before and after on the same machine and scene. Proposed performance gate: no added swarm draw calls and no repeatable median/p95 total frame-time increase above 5% after warm-up across repeated runs. Investigate noise and GPU/CPU limits rather than treating one submission timing as a frame-time result. Treat this as a target to verify, not a current guarantee.
- Current workspace contains ongoing unrelated changes. Apply the eventual implementation incrementally; do not reset or overwrite work already in progress.

## Acceptance and verification

The art pass succeeds when the user judges the playable comparison substantially closer to the requested Devil Daggers inspiration, the three flying tiers retain distinct silhouettes without color, and mouths/sockets remain visible at practical engagement distance. A close-up asset gallery alone cannot meet that bar.

Reuse relevant fixtures: `tests/skull-redesign-browser.mjs`, `tests/skull-motion-browser.mjs`, `tests/remake-models-browser.mjs`, enemy lighting/hit/death fixtures and the existing contact, tower clearance, multiplayer presentation and replay checks. Run targeted checks for each edited family, then the production build and applicable project-required checks. Compare excluded-family captures when shared material/shader code changes. The initial planning pass ran no implementation tests; verification of the implemented Skulls I–III pass is recorded in `artifacts/skull-horror/README.md`.

Resolved art decision: newly authored meshes closely informed by the retained originals. Next visual decision: judge the concrete Skull I comparison before extending its anatomical language across the roster. Any original-reference assembly remains approximate where joint transforms are unavailable; do not claim the original engine's missing skeletal transforms have been recovered.
