# Orb transmutation attack

Replaces the fixed-height scaled torus with a pressure curtain, a reflected leading edge/wake on the actual tile material and a short source discharge around the Orb. The curtain follows sampled arena heights and maintains a fixed world-space height while expanding. Its foot is positioned at the real Ring.radius. Emission and fade derive from ring age/radius, supporting pause and replay seeks. The floor shader has twelve fixed slots; the curtain does not introduce scene lights. The common beckon presentation also applies to Leviathan's gameplay rings.

Gameplay timing, wave speed, collision and transmutation rules are unchanged. tests/transmutation-waves-browser.mjs steps a real world with one Orb and six Iron Wasps: all six transmute. It verifies visible leading radius within 0.0001 units, unchanged simulation checkpoints during rendering, identical restored wave geometry after seek, low-quality visibility without bloom, unchanged light count, source discharge lifetime and full cleanup. Browser/shader errors: none.

Validation: npm run build; node tests/transmutation-waves-browser.mjs. Build retains the existing bundle-size advisory. Mechanical design check returned no findings.

orb-attack.mp4: 16-second 1280x720 H.264 game-renderer recording, with live fixed-step gameplay and repeated attacks. Decoded frames at 2, 5 and 12 seconds are included. motion-report.json confirms video decoding and metadata. The movie uses an elevated camera for the expanding attack; player-view.png verifies the ordinary viewpoint. high.png / low.png compare quality settings. source-discharge.png shows the start of the attack.

Recreate with Vite on port 5173: node tests/transmutation-waves-browser.mjs; node tools/record-orb-attack.mjs.
