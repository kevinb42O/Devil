# Models, materials, and sounds — asset preparation

Research date: **12 October 2026**  
Companion: [Gameplay research](DEVIL_DAGGERS_RESEARCH.md)  
Status: **research shortlist; free assets partly acquired; no game code or purchases**

Current acquisition status: [Asset preparation](ASSET_PREPARATION.md). The user requires a focused set of useful assets. Bulk Sonniss downloads were canceled; do not restart them or acquire full sound libraries. Account-only originals remain pending at the user's request. Paid candidates below are historical research, outside the current scope.

## 1. Recommended approach

Use licensed skull/hand bases and stone materials where they save time. Build the signature creatures as a consistent custom family: squids, skeletal spiders, segmented pedes, Leviathan, and Orb. Create gems, daggers, thorns, and eggs as simple custom meshes.

This is a production recommendation, not a claim that an exact off-the-shelf enemy set exists. A realistic spider or centipede may provide anatomy and rigging references, but its body, movement, and weak-point arrangement would need substantial adaptation. Purchasing several unrelated monsters would leave substantial work to unify their proportions, materials, and animation.

For audio, begin with free source recordings, then consider a creature construction kit if the free pool lacks enough dry, consistent variations. Design a recognizable audio identity for every threat instead of assigning interchangeable monster roars.

**Verification boundary:** technical specifications and license labels below were checked in publisher/model pages or search-indexed page content. The files themselves have not been imported, inspected, or auditioned. Recommendations are provisional until those checks are complete. Search snippets do not establish final visual or audible quality.

## 2. Model and material shortlist

The cost column distinguishes free listings from commercial candidates. Prices are not quotes or a purchasing decision. Fab's pages did not expose reliable prices/license selections through the research tool.

| ID | Candidate and creator | Published details | Cost / license status | Proposed use and decision |
| --- | --- | --- | --- | --- |
| M01 | [Skull downloadable — martinjario](https://sketchfab.com/3d-models/skull-downloadable-1a9db900738d44298b0bc59f68123393) | 31k triangles, 15.6k vertices | Free; CC Attribution | **Primary detailed skull base candidate.** Needs horns, jaw work, optimized swarm LODs, and unified bone shading. |
| M02 | [Simple Skull — Matt LeMoine](https://sketchfab.com/3d-models/simple-skull-cba160e50086468cba3b44e04f5a5c8b) | 754 triangles; made in Blender, textured in Substance Painter | Free; CC Attribution; NoAI label | **Lightweight alternative.** Useful for distant swarm testing; stylization needs review. Keep outside generative-AI workflows. |
| M03 | [First Person hands rigged — David Fischer](https://sketchfab.com/3d-models/first-person-hands-rigged-547a45535f0c4fe787948f7a7a6a88db) | 8.2k triangles; Blender and FBX; material applied | Free; CC Attribution | **Primary hand base candidate.** Needs demonic skin/claws and custom firing/upgrade poses. Rigging is advertised; required animations are not established. |
| M04 | [Spider H4 — LianaTeslo](https://www.fab.com/listings/23c87b86-26d1-4357-bd10-3190f748ae66) | 17,176 triangles; 4K textures; 26 attack/death/hit/idle/walk animations; FBX and other formats | Commercial; selected license and price unresolved; page marks AI usage “No” | **Conditional anatomy/animation donor.** Does not establish fidelity to the game's skull-headed spiders. Adaptation cost may exceed custom creation. |
| M05 | [Spiders animation pack — Bestgameassets](https://www.fab.com/listings/cdcf8586-92b4-4401-891c-3bd1c6fc0870) | Multiple spider types; idle/run and vertical movement clips; FBX plus converted formats | Commercial candidate; selected license and price unresolved | **Alternative spiderling/locomotion candidate.** Head exposure, egg production, and gem attraction would still require custom animation. |
| M06 | [Centipede Riged — barismeral](https://www.cgtrader.com/3d-models/animal/insect/centipede-riged) | Rigged; 6,520 polygons, 6,794 vertices; 512px maps; Blender/FBX/OBJ and other exports | Page showed US$7; Royalty Free label, full terms to verify | **Reference or temporary base.** Old Blender source and low-resolution maps; no matching flight or independently removable gem segments established. |
| M07 | [Tentacle Kraken Octopus](https://www.fab.com/listings/5d35f88a-41e7-4844-9e52-52a2336ba0f5?lang=en) | Approximately 18,600 polygons; bone-chain rig; 4K maps; 17 animations; FBX listed | Commercial; price/license unresolved; page marks AI usage “No” | **Conditional squid component.** Useful deformation starting point, but too detailed to repeat freely without optimization; not a complete squid. |
| M08 | [Rock Tile Floor — Charlotte Baglioni / Poly Haven](https://polyhaven.com/a/rock_tile_floor) | Stone tile material; color, normal, roughness, AO, displacement; resolutions up to 8K | Free; CC0 | **Primary arena surface candidate.** Reduce moss, darken carefully, match the actual independent tile layout. |
| M09 | [Rock 01 — Rob Tuytel / Poly Haven](https://polyhaven.com/a/rock_01) | Rock surface material with normal, roughness and displacement maps | Free; CC0 | **Secondary tile-side/fracture material.** Test against M08 for a consistent stone palette. |
| M10 | [Animated Monster Pack — Quaternius](https://quaternius.com/packs/animatedmonster.html) | Four animated/textured monsters; FBX, OBJ, Blender | Free; CC0 | **Fallback test assets only.** Published style/content does not establish the desired detailed horror appearance. |

Model specifications above are seller/creator claims. Converted GLB availability does not prove that every animation or material survives conversion correctly. Polygon counts and triangle counts are different units.

### Coverage of the game's roster

| Required family | Proposed source strategy | Custom work required |
| --- | --- | --- |
| Skull I–IV and transmuted variants | M01 as detailed base; M02 as a lightweight alternative | Distinct horns/shapes, transformed materials, readable tiers, LODs |
| Squid I–III | Custom body; investigate M07 only as a component | Body silhouette, tentacle arrangement, 1/2/3 gem sockets, spawn/death animations |
| Spider I/II | Custom skeletal body; compare M04/M05 donor value | Skull/head exposure, appropriate leg/body proportions, consumption and egg emission |
| Spiderlings | Simplified custom spider family or heavily adapted M05 | Burst motion, scale/readability, shared materials |
| Centipede/Gigapede/Ghostpede | Custom reusable head, body segment, legs, and tail; M06 reference | Flexible lengths, independent gem sockets, empty segments, emergence, ghost variant |
| Leviathan | Custom model | Six weak points, rotation, beckoning, collapse and Orb transition |
| Orb | Custom sphere/body and surface details | Tracking/activation feedback, damage response, death fragments |
| Thorn, eggs, gems, daggers | Custom simple meshes | Matching dimensions, clear states, breakup effects |
| Player hand | Adapt M03 | Four hand states, shot/stream/homing poses, upgrade transition |
| Arena | Custom individual tiles with M08/M09 materials | Correct footprint, edge sinking, restrained surface detail |

This shares source geometry within families without making tiers look identical. The 22 gameplay entities in the mechanics document do not require 22 unrelated purchased character models.

## 3. Free audio shortlist

All roles are proposed assignments. **No sounds have been listened to in this pass.** Duration, channels, format, and licenses below come from the linked pages; audible fit must be evaluated later.

| ID | Source | Published format / license | Proposed role and limitation |
| --- | --- | --- | --- |
| S01 | [Impact Sounds — Kenney](https://kenney.nl/assets/impact-sounds) | 130 files; CC0 | General impact/foley pool. Select short stone/bone-like layers after audition; not a verified bone library. |
| S02 | [Digital Audio — Kenney](https://kenney.nl/assets/digital-audio) | 60 files; CC0; space/laser tags | Temporary projectile, gem, and interface layers. Requires treatment to fit organic horror. |
| S03 | [GDC 2026 Game Audio Bundle — Sonniss](https://gdc.sonniss.com/) | Advertised 347+ files / 7.47GB+; commercial media use | Broad pool for audition. Confirm actual creature/stone/movement coverage from its tracklist rather than assuming the whole bundle matches. |
| S04 | [Earlier GDC bundles — Sonniss](https://sonniss.com/gameaudiogdc/) | Large multi-year collection; dedicated bundle license | Search source recordings for missing categories. Do not download the entire archive just to find a few sounds. |
| S05 | [Bone Crunch.wav — GreatNate98, #355052](https://freesound.org/people/GreatNate98/sounds/355052/) | 1.801s; stereo WAV, 48kHz/16-bit; CC0 | Eggshell recording; candidate skull destruction or segmented-body break layer. Needs trimming and spatial conversion review. |
| S06 | [Monster Growl 01 — Ezcah, #188026](https://freesound.org/people/Ezcah/sounds/188026/) | 2.925s; mono WAV, 44.1kHz/16-bit; CC0 | Candidate creature vocal base; mono is convenient for a positioned emitter. Verify clean origin and audible fit. |
| S07 | [Monster Growl.wav — DylanTheFish, #449820](https://freesound.org/people/DylanTheFish/sounds/449820/) | 5.152s; stereo WAV, 48kHz/24-bit; CC0 | Candidate large-creature vocal layer. Not automatically appropriate for rapidly repeating skull chatter. |
| S08 | [Monster Growl — qubodup, #743336](https://freesound.org/people/qubodup/sounds/743336/) | 10s; stereo WAV, 48kHz/16-bit; CC BY 4.0 | Creator's processed voice; potential signature vocal source. Baked reverb may reduce positional clarity. |
| S09 | [Bone Crunch — Clearwavsound, #524609](https://freesound.org/people/Clearwavsound/sounds/524609/?page=1) | 0.650s; mono WAV, 48kHz/24-bit; CC BY 3.0 | Short candidate impact/death layer; compare with S05 for repeated combat use. |
| S10 | [Horror/Creepy atmosphere 01 — bolkmar, #417496](https://freesound.org/people/bolkmar/sounds/417496/) | 4m17.598s; stereo WAV, 48kHz/24-bit; CC BY 4.0 | Lobby/abyss ambience candidate. Loopability and threat masking are untested. |
| S11 | [Negative Magic Spell — qubodup, #211641](https://freesound.org/people/qubodup/sounds/211641/) | Creator lists CC BY 3.0 and attribution instructions | Candidate damage, transmutation, or magical feedback layer. Needs audition and file specification check. |

Prefer S06 over low-bitrate MP3 candidates when testing repeated creature processing. S08/S10 already contain processing or ambience; use selectively, since long reverberant tails may obscure nearby enemies.

## 4. Paid sound candidates

| ID | Library | Verified published coverage | Recommendation |
| --- | --- | --- | --- |
| P01 | [BOOM Library — Creatures](https://www.boomlibrary.com/sound-effects/creatures/) | Construction Kit: 1,036 files / 7,870 sounds; Designed: 75 files / 300 sounds; WAV 96kHz/24-bit | **First paid candidate to audition.** Construction Kit gives more control over coherent enemy identities; Designed is faster for initial tests. |
| P02 | [BOOM Library — Magic](https://www.boomlibrary.com/sound-effects/magic/) | Construction Kit and Designed editions; supernatural impacts, fire, whooshes, chimes and drones; WAV 96kHz/24-bit | **Conditional weapon/economy source.** Avoid long cinematic spells for sustained dagger fire. |
| P03 | [BOOM Library — Magic: Alchemy](https://www.boomlibrary.com/sound-effects/magic-alchemy/) | Short magical effects built from chemical/elemental recordings; Designed and Construction Kit editions | **Alternative to P02**, especially for short tactile casts and pickups. No reason to buy both before audition. |

For concrete creature coverage, the [Creatures Designed metadata sheet](https://www.boomlibrary.com/metadata/00_Creatures_DS_Metadata.pdf) lists Alien, Ant Warrior, Banshee, Beast, and Bug sets, including calm/attack/hurt/death states. These provide possible source families; none is a ready-made Devil Daggers enemy sound set.

No paid audio purchase is recommended yet. Budget, desired quality, audition results, and license scope should determine the edition. Publisher file counts distinguish multiple sounds in one file from separate files.

## 5. Proposed audio identities and required cues

The following is original sound-design planning, not a description of the original game's exact recordings.

| Family / action | Identity direction | Needed cues |
| --- | --- | --- |
| Skull I | Thin dry bone chatter | Approach/idle, hit, death |
| Skull II | More irregular, sharper articulation | Distinct approach, hit, death |
| Skull III/IV | Separate pitch/rhythm and stronger urgency | Tier recognition, nearby threat, destruction |
| Squids | Organic breath plus tentacle friction | Appearance, offspring release, weak-point hit, death |
| Spiders | Dry leg clicks plus gem suction | Head raise/exposure, feeding, egg ejection, death |
| Pedes | Articulated bone rattle and ground emergence | Emergence, movement, individual gem break, death |
| Ghostpede | Sparse spectral layer with separate consumption cue | Arrival, circling, homing attraction/consumption |
| Leviathan | Large low body layer plus clear beckon accent | Appearance, activation, beckoning, gem break, collapse |
| Orb | Controlled resonant pulse | Activation, tracking/beckoning, suppression, destruction |
| Thorn / eggs | Short distinct physical transients | Emergence, hatch, hit, destruction |
| Ordinary fire | Compact magical transient and controlled stream texture | Burst, sustained attack, impact/ricochet |
| Homing | Related but identifiable timbre | Launch, travel, hit/detonation, reserve feedback |
| Gems / upgrades | Brief positive tonal feedback | Pickup, each upgrade, transition |
| Player / arena | Minimal movement and restrained ambience | Jump/boost, death, directional abyss, tile sinking |

Do not make every larger enemy simply a lower-pitched version of the same sample. Recognition should also come from cadence, texture, and articulation. Keep ambience quieter than the sounds used to locate immediate threats.

Suggested starting production target: 4–8 variations for frequent short cues and 2–3 clean loop candidates for sustained creature/ambient sounds. These are planning targets, not fixed game rules. Each cue needs a clear attack and deliberate tail length.

## 6. Asset acceptance requirements

### Models

- Editable source plus engine-neutral mesh export; verify rig/animation survival after import.
- Consistent scale, forward/up axes, origins, normals, and UVs.
- Separate weak-point objects/sockets and explicit intact/destroyed states.
- LODs for skull swarms and repeated pede segments; shared materials where practical.
- In-place animation where simulation drives movement; no hidden root motion changing gameplay.
- Review silhouette at combat distance, in darkness, and with dozens of overlapping enemies.
- Keep decorative geometry separate from gameplay collision.

Proposed starting budgets, to revise after engine/hardware choice: approximately 1–3k triangles for a swarm skull at primary gameplay LOD, 10–25k for major isolated enemies, and 500–2k per repeated pede segment. These are provisional budgets, not specifications of the original game. Texture size should follow on-screen size and instance count rather than automatically using every supplied 4K/8K map.

### Audio

- Keep lossless source files; suggested working masters are WAV 48kHz/24-bit.
- Prefer dry mono sources for positioned enemy cues; stereo for appropriate non-positional beds.
- Check clipping, background noise, baked reverb, loop seams, and repetitive artifacts.
- Compare candidates at matched loudness before judging them.
- Avoid normalizing every cue to the same perceived loudness; priority and distance must remain readable.
- Validate with headphones and speakers; test off-screen enemy identification under simultaneous firing.

These requirements are proposed production criteria. Asset quality is not validated until imports and auditions occur.

## 7. Licensing and record keeping

Use an asset ledger at acquisition: ID, creator, original URL, acquisition date, filename, license/version, attribution text, receipt if paid, allowed sharing, modifications, and final in-game role. The shortlist itself is not a license record for downloaded files.

- **CC0:** Poly Haven explicitly allows commercial use and modification without required attribution. Kenney's selected packs and the listed CC0 Freesound files also carry CC0 labels. Keep provenance even when credits are optional. [Poly Haven asset license](https://polyhaven.com/license)
- **CC Attribution:** retain creator, source, applicable license, and modification information. The specific model/sound page is the source of its license version and credit details. Freesound is not uniformly CC0. [Freesound licensing FAQ](https://freesound.org/help/faq/)
- **Fab:** verify the selected license for each acquisition. Its Standard License permits use/modification inside projects with compatible tools and does not permit standalone asset redistribution. Reference-Only does not provide source-format access. M04/M07's AI restrictions need respecting if those candidates are used. [Fab license summary and EULA](https://www.fab.com/eula?lang=en)
- **Sonniss:** the GDC license inspected is v2.0, effective 27 August 2026. It allows commercial project use/modification without attribution; finished games and working-team sharing are covered, while distributing raw or redesigned sounds as an asset library/template is restricted. It prohibits AI training/development uses. Preserve the license in effect on download day. [GDC bundle license](https://sonniss.com/gdc-bundle-license/)
- **BOOM:** a published single-user EULA includes videogame production use. The PDF located is dated 2018, so verify current purchase/subscription and team terms before acquisition; do not treat that older PDF as a complete current clearance. [Published audio-content EULA](https://www.boomlibrary.com/metadata/00_BOOM-Library-EULA-2018.pdf)

No original Devil Daggers meshes, recordings, or extracted files are included in this plan.

## 8. Preparation sequence

1. **Review the visual candidates:** M01/M02 skulls, M03 hand, M08/M09 stone. Decide the level of detail and establish a single bone/stone/flesh palette. Use the acquisition status document to distinguish files on disk from account-only candidates.
2. **Audition a small audio pool:** S01, S02, S05, S06, S07, S09, and S10 first. Record suitability and missing categories. Avoid acquiring large libraries without a gap to fill.
3. **Assess donor versus custom cost:** compare M04/M05 spiders and M06/M07 components against the roster-specific requirements. Require editable rigs and suitable license selections.
4. **Prepare model briefs:** skull tier silhouettes; squid sockets/tentacles; spider head exposure; modular pede segments; Leviathan/Orb transition.
5. **Prepare sound briefs:** recognizable threat signatures, short feedback cues, ambience, variations, and priority rules.
6. **Acquire only selected assets**, saving provenance and licenses, then inspect/import and audition before calling them production-ready.

The most promising initial sourcing path is **M01 + M03 + M08/M09 for adaptable bases/materials, custom signature creatures, and the free audio pool before any paid library**. This remains pre-production and does not start game implementation.
