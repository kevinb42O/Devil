# DESCEND — The Worlds Below

An 81-second environment film for ABYSS / DAGGERS, replacing the combat-led teaser direction. Created on 18 October 2026.

The film uses only cinematic spectator cameras. There is no player shooting, combat, kill montage, first-person body or HUD. The creatures move within the existing game environments, with slow staged swarm drift and the game's actual Gigapede motion. Selected shots omit the serpent to leave space for the environment and architectural light.

## Picture

Every frame is rendered at native 1920×1080 with High quality. The renderer and creature clocks advance in fixed increments, and each frame is sent to the encoder. Source delivery is 30 distinct frames per second independent of render wall time. There is no realtime frame dropping or resolution scaling.

Camera positions and look targets follow smooth three-dimensional paths. Constant-distance curve sampling controls speed; soft entry and exit curves avoid abrupt acceleration. Paths include sweeping cosmic orbits, low wet-stone travel, a moving serpent view, descending fire reveals, cathedral ascent and architectural recession. Picture transitions use one-second dissolves.

## Sound

The soundtrack is assembled independently of the picture edit from the game's environmental recordings. Each environment uses one continuous source phase across its shots. Five-and-a-half-second equal-power handovers let incoming air, weather, fire and stone resonance arrive before the picture changes and decay after it. Quiet creature loops follow the camera's recorded bearing and distance, with long voice fades. No weapon, impact, spawn or action sounds are included.

The integrated loudness target is −18 LUFS, with conservative peak headroom and a long final fade. Actual measurements and full decode results are saved in `delivery-report.json`. The audio plan is in `edit/audio-plan.json`. Licensed source recordings remain incorporated into game footage.

## Files and rebuilding

- `abyss-daggers-environment-film-master.mp4`: quality master, native 1080p/30 source, H.264 with stereo AAC.
- `abyss-daggers-environment-film-share.mp4`: smaller version of the same finished edit.
- `index.html`: local video player and download links.
- `shot-manifest.json`: timing, camera paths, environment selection and lens choices.
- `shots/*-metadata.json`: per-frame camera-relative audio coordinates, camera travel, and confirmation of zero shots/kills.
- `contact-sheet.jpg`, `poster.jpg`, `delivery-report.json`: review and delivery artifacts.

With Vite running, `node tools/record-environment-teaser.mjs` regenerates every shot. Use `--only=01,07` to rerender selected shot IDs. `tools/finish-environment-teaser.py` builds the continuous sound mix, picture dissolves, master/share files and review artifacts. It uses the bundled Python, NumPy, Pillow and imageio-ffmpeg. Apple VideoToolbox performs H.264 encoding.

The previous combat version remains in `artifacts/teaser/`; its former preview page is preserved there as `combat-version.html` when the new player replaces the main preview.
