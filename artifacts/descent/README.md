# Descent implementation and preview

The current implementation has full surrounding skies in every chapter. The opening uses a charcoal/slate ash ceiling, subdued grey clouds and a faint diffuse rust glow overhead, with no sun disk. Opening ambient fill is 18% of the previous daylight contribution, shared by native stone/enemy materials, the hand, scene lights and fog. There is no artificial combat-horizon mask. Ambient fill and the first sky transition fade together from 21 to 39 survival seconds.

Open the actual renderer at `http://127.0.0.1:5173/artifacts/descent/preview.html`. Drag to look around, scrub survival time, or use the transition buttons for their actual 18-second pace. “Fire daggers” and the four-hand selector exercise actual projectile creation, flight and rendering against the environment. This is a controlled combat fixture, not a recorded survival run.

## Captures

- `descent-full-tour.webm`: all chapters at 24× atmosphere speed, with actual firing/flight at normal pace.
- `daylight-to-storm-real-time.webm`: the first transition at 1×, including its coordinated lighting fade.
- `ash-opening.png`: the current ash opening and restrained scene lighting.
- `bright-opening.png`: historical bright opening, retained for comparison.
- `ash-shots-*.png`: current four hands, high/low quality, horizon/upper-sky aim.
- `daylight-shots-*.png` and the existing videos: historical bright-opening captures.
- `high-*.png`, `low-*.png`, `gallery.html`, `contact-sheet.png`: chapter captures using a common fixture/camera.

## Validation

Current ash opening: TypeScript and production build passed. All four descent unit tests and all 16 actual-shot probes (four hands × two qualities × two aim elevations) passed. The preview checks the dim sky in three directions, retained arena fill, real-time transition controls and stable pause. `preview.json` and `ash-shots-*.png` contain the current results. Older logs and performance measurements below describe the earlier descent implementation.

- Production build and TypeScript check passed (`build.log`). The build preserved existing output files because this workspace has concurrent development/build activity.
- The unit-suite run passed all 296 tests (`unit-tests.log`).
- Deterministic chapter reconstruction, blend continuity and terminal-stage stability passed (`descent.test.ts`).
- Renderer timing, practice starts, pause, restart, spectator coordinates and shader-program stability passed (`integration.json`, `browser.log`).
- Live practice → pause → milestone → death replay → saved replay seeking → menu/persistence passed (`play.json`, `play.log`).
- Multiplayer death/revival at 350 seconds retained the shared chapter on both peers; starting another match reset the chapter (`multiplayer.log`).
- Historical bright-opening measurement on the unlit arena texture: sampled RGB changed from `[30,30,30]` without the environment term to `[83,86,91]` with it. These are screen samples, not physical-light measurements.
- Sixteen actual-shot probes passed across all four hands, two quality settings and two aim elevations. They compare a local pixel region against the same rendered background with dagger meshes/glow hidden; `preview.json` includes the measurements. This guards against lost shots but does not replace visual playtesting.
- Existing enemy and projectile lighting regression tests passed (`enemy-lighting.log`, `projectile-lighting.log`). The scene retained its six existing lights.

## Performance

`performance.json` records Apple M1 / ANGLE Metal measurements at 1280×720, with GPU timer queries. The reference sky is the captured original `baseline-sky.ts`, matching Git blob `9cdb58123ea2daa17fc067f12f2b37d101100522`.

The isolated sky comparison passed the proposed 0.3 ms added-median-GPU-cost budget in all six chapters at both qualities. No sky draw calls or render passes were added. The gameplay cloud field uses four noise hash samples per octave instead of the original eight, and the deepest chapter fades out cloud detail entirely.

Full-frame ABBA samples are also retained. Their medians and p95 values vary substantially, including regressions in individual cases; they do not establish a universal FPS improvement or confirm the proposed 5% p95 limit on other devices. Further device testing is needed for that broader claim.

Reproduce with `npm run test:descent` and `npm run test:descent-performance` against the running development server. Record the preview clips with `node tests/descent-preview-browser.mjs --record`.
