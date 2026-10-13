# Original hands and weapon effects — 13 October 2026

The procedural hand and generic glowing point particles were removed at the user's request. The local build now loads the actual Devil Daggers hand, dagger, flame, ember, and blood meshes and textures.

## Acquisition and verification

A publicly accessible archived Linux game-data package supplied `game/res/dd` and `game/dd/particle`. The package was streamed and only those two rendering-data members were retained. No installer or game executable was run. The subsequent replica pass also extracted `game/res/audio` and imported 275 original WAV recordings; their source and file hashes are in the audio manifest and provenance record. `node tools/import-dd-audio.mjs /path/to/res/audio` recreates the sound import. The source URL, resource hashes, and four reference screenshot URLs/hashes are recorded in `assets/provenance/original-weapons.json`.

The asset table, vertex layout, texture layout, and shader packaging were checked against [ddinfo-core at the research revision](https://github.com/NoahStolk/ddinfo-core/tree/1d64444d9f31632a3c932657ad13d5b4693df729/src/DevilDaggersInfo.Core.Mod). The source hand meshes have the catalogued 296 / 396 / 396 / 396 triangles. Original assets remain Sorath's assets; no reuse license was established. They are stored locally under the Git-ignored `assets/original/devil-daggers/` directory, separate from the project's CC0 asset set.

The initial weapon import contained 102 render asset files. The expanded import now contains 439 rendering files including enemy and arena assets, together with the raw particle definitions and a decoded emitter table. The runtime loads only the needed subset. Four unmodified hand reference screenshots from [ddinfo-web](https://github.com/NoahStolk/ddinfo-web/tree/e3e8768f12b5240d4eaf70a9421965b5a83b1e39/src/DevilDaggersInfo.Web.Client/wwwroot/images/wiki/upgrades) are stored in `assets/references/devil-daggers/hands/`.

## Exact asset mapping

| Hand level | Mesh | Base texture | Flash texture | Regular dagger texture | Homing dagger texture |
| --- | --- | --- | --- | --- | --- |
| I | hand | hand | hand | dagger | — |
| II | hand2 | hand2 | hand2 | dagger2 | — |
| III | hand3 | hand3 | hand4 | dagger3 | dagger4 |
| IV | hand4 | hand5 | hand6 | dagger5 | dagger6 |

Texture numbering differs from mesh numbering. `hand4.png` is the Level III flash, while `hand5.png` is the Level IV base. The importer preserves these distinctions. All daggers use the original `dagger` mesh and their corresponding texture. A projectile remembers the hand level that fired it, so upgrades do not repaint daggers already in flight.

## Presentation changes

- Original meshes and UVs replace the constructed palm, cylinders, finger joints, and knuckle crystals.
- Original 256×256 hand textures use nearest-neighbor sampling. A separate hand pass keeps arena lights and bloom from washing them out.
- The original mesh's arm axis is converted into camera coordinates. Its corrected pose aims forward from the lower center, showing the back of the hand, with the wrist entering from below. The viewmodel uses a fixed horizontal 90° projection.
- Level III / IV firing uses the original flash textures. Higher hand levels select their actual distinct meshes, rather than recoloring one model.
- Original flame1–8, ember1–3, and blood1–4 geometry replaces the previous round point sprites. Effects use instanced geometry and adapted `particle2` shader math, including the texture modulation, rim colors, clipping, alpha, and world-coordinate quantization.
- Original particle records supply the per-level start/end/rim colors, alpha, clipping threshold, and candidate lifetime ranges, including orange/red regular fire, cyan Level III homing, and pink Level IV fire.

## Exactness limits

The mesh and texture data is original. The browser renderer is a port, not Sorath's engine. Model placement/projection, recoil, flash duration, emitter counts, velocity, scale, spin, damping, collision, and render ordering remain calibrated implementation values. The binary particle data was decoded as 111 fixed 187-byte version-four records; colors are directly recoverable, while some field semantics remain inferred. Original procedural floor decals and the complete particle simulation have not been ported. This change therefore does not certify pixel-perfect or frame-perfect matching.

## Reimport and inspect

```sh
npm run assets:import -- /path/to/res/dd /path/to/dd/particle
npm test
npm run test:weapon  # with the dev server running
```

The local production build copies the imported original asset directory into `dist/assets/original/devil-daggers/`. These files are not labelled CC0. Reimport is necessary in a fresh checkout because original assets are ignored by Git.

Development-only preview URLs `/?hand-preview=1` through `/?hand-preview=4` start a run with the chosen hand level. Production builds omit this override. The browser check verifies all four meshes load, fire, and compile their shaders without browser errors, and captures screenshots in `artifacts/`. Orientation was also checked visually against the reference screenshots.
