# DESCEND — ABYSS / DAGGERS

A 75-second environment and combat teaser, produced from the local game on 18 October 2026.

Open `index.html` through the project development server to watch the master and download either finished MP4. The player is at `http://127.0.0.1:5173/artifacts/teaser/` while Vite is running.

## Files

- `abyss-daggers-teaser-master.mp4`: finished landscape 1920×1080, 30 fps, H.264 with stereo AAC; quality master.
- `abyss-daggers-teaser-share.mp4`: same finished edit with smaller video/audio bitrates for sending to friends.
- `poster.jpg` and `contact-sheet.jpg`: frames from the finished video.
- `shot-manifest.json`, `edit/timeline.json`, `capture-report.json`, `retake-report-*.json` and `delivery-report.json`: source recipe, edit decisions, capture diagnostics and output checks.
- `shots/`: clean takes and capture input logs. Logs require the capture fixture and scripted spawn waves; they are not standalone Survival replays.

## Production

Every environment and combat image is rendered by the actual game. Combat uses scripted input, selected weapon tiers, deliberately spawned encounters and invulnerability to obtain repeatable unranked takes. Enemy AI, movement, projectile collision, kills, gems, hands and presentation run through the game simulation. Cinematic cameras supply the environment shots. This is a staged game teaser rather than a continuous ranked run.

Source captures mix native 1080p with 720p retakes for the heavier environments and combat, scaled to the 1080p edit. Lower-resolution retakes were selected to improve motion rather than retain badly stuttering 1080p takes. The exported 30 fps timeline does not imply every original capture frame arrived at exactly that cadence. Consult the capture reports for measured performance.

Audio comes from the game's licensed cue bank and environmental beds, recorded with the actual positional mixer. It includes rain, wind, fire, bell air, creature voices, weapons, impacts, movement and pickups. The edit uses modest boundary fades, a quieter cathedral passage, integrated loudness mastering and a final tail. There is no added music or narration. Third-party sound recordings remain incorporated in game footage.

## Rebuild

With Vite running, use `node tools/record-teaser.mjs` for the original capture pass. Use `--only=09,10` to retake specific numbered shots and `--width=1280` for lower-resolution capture; the composited source file remains 1080p. Capture files are overwritten by matching shot ID. The reports preserve the capture settings.

Run `tools/finish-teaser.py` with Python containing `imageio_ffmpeg`, Pillow and NumPy. It conforms each shot, assembles the timeline, measures integrated audio loudness, renders the master/share copies, decodes both finished files, and exports review frames. Encoding logs and the exact timeline are retained under `edit/`.

The capture code intentionally accesses renderer and mixer internals from JavaScript to avoid introducing trailer-specific options into normal game code. It may need updating when those internals change.
