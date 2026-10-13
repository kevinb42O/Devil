# Focused asset preparation

Date: 12 October 2026. No game code written; no purchases.

**Download rule: free assets only, acquired for a concrete game need. No bulk sound libraries.** All four started Sonniss downloads were canceled in Chrome, their partial files are gone, and the fifth part never started. Do not resume those downloads. Older bundles are excluded.

## Prepared locally

| Asset | Location | Verification / readiness |
| --- | --- | --- |
| 17 selected sound candidates | `assets/audio/selected/` | Valid audio headers; role mapping and SHA-256 hashes in `manifest.json`. Audition and art-direction approval still needed. |
| Rock Tile Floor, 2K | `assets/materials/rock_tile_floor/2k/` | Creator-supplied maps, Blender, glTF and MaterialX material files. Download sizes and MD5 checked against publisher metadata. |
| Rock 01, 2K | `assets/materials/rock_01/2k/` | Same checks; intended for stone sides/fractures. |
| Quaternius Animated Monster Pack | `assets/models/quaternius/animated-monster/files/Animated Monster Pack by @Quaternius/` | Four models, each in Blender/FBX/OBJ. ZIP CRC passed; mesh counts and file headers checked. CC0 license included. |

The material downloads total 33 files, all matched to published sizes/checksums. glTF/Blender/MaterialX dependencies are stored beside the supplied material files. Engine import and rendered appearance are untested. The Quaternius pack is a fallback for animation and temporary model work; its cartoon style is not the final Devil Daggers horror direction.

## Small working audio set

Only these 17 files are in the selected audio folder. Names ending in `candidate` denote provisional use, not final approved sounds.

| Need | Selected candidates |
| --- | --- |
| Stone/ground impact | `stone_impact_01`–`03` |
| Crystal weak-point hit | `crystal_hit_01`–`02` |
| Flesh hit | `flesh_hit_01`–`02` |
| Break/destruction | `break_death_01`–`02` |
| Ordinary dagger stream / burst | `dagger_stream_candidate`, `dagger_burst_candidate` |
| Homing launch | `homing_candidate` |
| Gem pickup / hand upgrade | `gem_pickup_candidate`, `upgrade_candidate` |
| Player death | `player_death_candidate` |
| Menu confirmation | `menu_confirm_candidate` |
| Jump / boost feedback | `jump_boost_candidate` |

The selected audio occupies about 135 KB; see the manifest for exact sizes. The two already-downloaded Kenney packs are kept under `assets/_sources/kenney/` for provenance and possible replacement of individual selections. Each original ZIP is under 1 MB. Their complete libraries are not the working game sound set. No additional audio is downloading.

Kenney files were inspected with macOS `afinfo`; all 193 audio files in the source packs passed header inspection. This includes the digital pack's preview track and does not imply 193 game cues. No subjective listening evaluation was performed, so these selected files remain audition candidates.

## Pending or missing

- **M01 detailed skull, M02 simple skull, M03 rigged hands:** Sketchfab download sign-in required. Left pending at the user's request. Source pages and license links recorded.
- **Individual Freesound originals S05–S11:** download sign-in required. Left pending at the user's request. Do not substitute compressed previews and label them as originals.
- **Enemy vocal signatures:** still needed. Acquire a few individual dry vocal/chatter/organic recordings for explicit enemy roles, after checking their license and listening to them. Do not acquire a large bundle to fill this gap.
- **Signature creatures:** squids, skeletal spiders, modular pedes, Leviathan, and Orb still require custom/adapted models. The fallback pack does not fulfill the full enemy roster.
- **Paid assets:** excluded. Nothing purchased.

## Provenance and checks

- `assets/licenses/`: original Kenney and Quaternius license texts.
- `assets/provenance/materials-downloads.json`: successful publisher size/MD5 validation for 33 files.
- `assets/provenance/prepared-files.json`: SHA-256 inventory of prepared assets and license files.
- `assets/provenance/source-snapshots.json`: source-page acquisition results, including unsuccessful fetches.
- `assets/provenance/audio-inspection.json`: audio header inspection results. Paths reflect the initial download locations; originals now reside under `assets/_sources/kenney/`.
- `assets/audio/selected/manifest.json`: current source-to-role map, original filenames, licensing, sizes, hashes, and audition status.

The Quaternius Google Drive downloads hit quota errors. The successfully acquired pack is from [the creator's OpenGameArt upload](https://opengameart.org/content/lowpoly-animated-monsters), which labels it CC0 and contains the original license text. The unsuccessful Google Drive attempts remain recorded for transparency.

## Next preparation work

Audition the small selected set, replace generic electronic placeholders where needed, and obtain only the missing individual creature sounds. Measure the reference silhouettes and produce model briefs before custom asset work. Continue to keep gameplay code out of this preparation stage.
