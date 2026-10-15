# Twin Ascension planning evidence

Isolated planning artifacts, 15 October 2026. These do not modify gameplay or establish final balance, production lighting, multiplayer correctness or player preference.

- [Desktop material ladder](material-ladder.png): existing IV mesh/skin reference plus proposed V–VII materials on the native paired meshes. This is a reference study, not an exact reproduction of the production IV lighting shader.
- [Spacing study](spacing-study.png): tight ±.105, preferred ±.125 and wide ±.185 overlay pose X positions at 16:9.
- [Portrait material ladder](portrait-ladder.png): conservative responsive framing at 9:19.5. The pair currently looks small in portrait; final integration should review presence against actual touch controls and threats before treating this framing as final.
- [Interactive preview source](preview.html): load through the local Vite dev server. `?ladder=1` selects the 2×2 material board; append `&aspect=0.46153846153846156` for tall portrait framing.
- [Asset measurements](asset-audit.json): exact reflected positions/normals/UVs for hand4/hand4left; raw left/right crew rig node inventory.
- [Framing measurements](framing-audit.json): 168 matrix probes, seven aspect ratios, three spacings and eight individual motion/recoil configurations. This does not cover combined motion, all fingertip markers or real HUD/touch masks.
- [Pixel measurements](spacing-audit.json): six rest previews at their native canvas resolution. The original whole-mesh `bounds` field is measured before responsive portrait adjustments; the canonical aspect/motion matrix data is in `framing-audit.json`.

Reproduce from the repository root:

```sh
node artifacts/twin-ascension-plan/audit.mjs
node artifacts/twin-ascension-plan/framing-audit.mjs
node artifacts/twin-ascension-plan/capture.mjs
```

The capture script uses the existing local dev server at `http://127.0.0.1:5173` and the installed Google Chrome binary. No runtime source, imported model or texture is changed by these probes.

Existing production-path check run during this planning pass:

```sh
node tests/weapon-launch-fov-browser.mjs
```

Result: 396 socket checks passed, maximum NDC error approximately `9.10e-15`; mesh/glow path agreement, unchanged physics and remote/spectator projection checks passed. This covers current I–IV only.
