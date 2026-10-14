# Multiplayer final check — 14 October 2026

The final isolated checks reproduced no additional blocking bug in the current four-player cooperative-survival implementation. This is a record of the tested behavior, not a guarantee for every device, firewall or internet connection. Network protocol: **7**; all players need the same build.

## Results from this pass

| Check | Result |
| --- | --- |
| TypeScript and production build | Passed |
| Full automated suite | 296 tests passed, zero failures |
| Public internet signaling and simultaneous joins | Three guest WebRTC joins; matching four-player rosters; readiness, shared gem state, return to lobby and host disconnect passed |
| Four-player game UI | Readiness/unready gate, shared countdown/start, guest movement/fire and guest disconnect passed on isolated rerun |
| Spectator control schemes | AZERTY, controller and mobile passed death with held controls, flight, no spectator firing, revival, fresh movement/fire, team wipe and restart |
| Four-player transport stress | 15 seconds of sustained level-IV fire, movement and jumps with artificial latency, loss, reordering and a brief outage passed |
| Patch formatting | `git diff --check` passed |

The stress test used real WebRTC connections, 120 ms added round-trip latency, 20% dropped input datagrams, input reordering, one missing state chunk per eight-chunk repair group, and a 250 ms input blackout during sustained fire. The host recorded **2,352 shots**. Guest pending-input peaks were **63, 63 and 62 commands** against a 240-command limit; host command queue peaked at 39. The guests received 313, 311 and 309 snapshots. Every accepted command was acknowledged, weapon streams stopped, and final guest positions matched the host within 0.1 world unit. Measured RTT at completion was 122–134 ms.

One initial four-player UI run timed out at guest movement while another graphical browser suite was running concurrently. The isolated rerun passed. This remains useful evidence for further device/load testing; the isolated pass does not prove the concurrent timeout was harmless.

The earlier fix verification also passed physical primary/homing hold timing under backlog recovery, grid-rounding boundary updates with loss/keyframes, budgeted medium/large state transfer, reliable effects independent of state congestion, early frame ACKs, reserved peer identities, unified stall status, real WebRTC transfer of 6,000 projectiles, transport, respawning and next-frame keyboard/camera response with 1,000 ms added RTT.

## Remaining validation boundary

All browser peers in these tests ran on one computer. Public MQTT signaling was exercised over the internet, but gameplay peers were not located in separate homes or behind distinct physical firewalls. No TURN relay is configured in the checked local production environment files. Cross-network connectivity and a longer session on representative player devices remain unverified. Host migration and admission during a running match remain outside the current multiplayer scope.

## Reproduce

Run the development server with `npm run dev`, then use:

- `npm test` and `npm run build`
- `npm run test:multiplayer-rooms` and `npm run test:multiplayer`
- `node tests/multiplayer-spectator-controls-browser.mjs`
- `npm run test:multiplayer-soak`
- `npm run test:multiplayer-network-regressions`

The new stress test is saved in `tests/multiplayer-soak-browser.mjs`.
