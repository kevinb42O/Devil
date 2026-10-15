# Twin Ascension implementation evidence

Implemented locally, 15 October 2026. These screenshots use the game's actual renderer and native hand4/hand4left models.

- [V desktop](hand-5-1280.png), [VI desktop](hand-6-1280.png), [VII desktop](hand-7-1280.png).
- [V portrait](hand-5-390.png), [VI portrait](hand-6-390.png), [VII portrait](hand-7-390.png).
- [VII in real test mode](test-mode-7.png).
- [Browser audit](audit.json): both model visibility, symmetric rest tips, 7,776 paired projectile alignment cases, unchanged physics and real top-row/numpad 5–7 switching into Practice.
- [Six-player CPU profile](simulation-profile.json): same seeded empty arena and six continuous primary streams at IV/V/VI/VII. This isolates projectile simulation and initial snapshot size; no GPU/mobile or long-soak performance claim.

Reproduce with the local dev server running:

```sh
npm run test:twin-hands
npx tsx tools/profile-twin-hands.ts
```

The SQL check uses an isolated PGlite database and the saved migrations. It does not apply migrations to the live service. The WebRTC test uses two local browser pages and actual data channels; it does not contact other players.

Natural unlock thresholds are 350/550/800 gems. Controls stay primary tap/hold and homing; each action fires both hands together. Test keys stay solo-only and unrank the run.
