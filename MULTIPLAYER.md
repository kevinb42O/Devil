# Online friends mode

Open **Friends · up to 4 players**. Everyone loads the same public game URL.

1. Enter your player name.
2. Click **Create lobby**, or click **Join** on a visible lobby in **Open lobbies**.
3. Each player clicks **I'm ready**. Player cards show everyone's readiness.
4. When every connected player is ready, the host's **Start run** button becomes available.
5. The host starts a shared three-second countdown. All players enter the same run.

There are no room-code fields, copied connection offers, or LAN setup in the game interface. Lobby discovery and connection negotiation use public internet signaling. Gameplay uses WebRTC between the host browser and up to three guest browsers.

## Shared gems

Any player collecting one gem gives **every player +1 gem**. Gem progression is identical across the lobby. Each player has their own weapon cooldowns and homing reserve; spending homing ammunition does not spend another player's reserve. The same gem cannot be collected twice.

Living teammates use simple colored bodies with subtle names above their heads. Their daggers and muzzle particles are visible to the crew; teammate firing never recoils your own hand. The in-game roster uses player names. Button presses and releases travel over an ordered reliable input channel and are consumed one transition per simulation tick, preserving quick taps.

Players have individual lives. The shared arena continues after an individual death or guest disconnect. A team wipe ends the run. The host can return everyone to the lobby; readiness resets so everyone readies up again before the next run. If the host leaves, guests return to the lobby browser. Joining a running or full lobby is disabled.

Escape releases your controls while the crew continues. Keep the host browser visible and its computer awake. Browsers may require a click to recapture the mouse after switching windows, even though the game and timer start for everyone.

## Online hosting

`npm run build` produces the static game in `dist/`. `npm run serve:online` serves only that directory on localhost port 5180, with compression for scripts, meshes, styles and JSON. Publish this service through an HTTPS tunnel for a temporary playtest, or upload `dist/` to an HTTPS static host for a persistent URL. Everyone opens the resulting **internet URL**, then uses the lobby browser.

Lobby discovery uses public MQTT brokers with failover, separate room and lobby namespaces, heartbeat announcements and stale-room expiry. Ready state and start authority travel over reliable WebRTC channels; the host validates every readiness transition and will not start a public lobby with unready players. Guests cannot start the run.

Direct internet connections use Google and Cloudflare STUN. Deployments that need relay fallback can configure `VITE_WEBRTC_ICE_SERVERS` with their own ICE server JSON before building. This is deployment configuration; players never enter network settings in the game. A TURN relay account is not bundled. Different-home NAT traversal still depends on the participating networks; testing several browser profiles on one computer does not establish compatibility with every firewall.

## Validation

- `npm test`: solo regression tests plus crew movement/deaths, shared gem credit, independent homing reserves and snapshot application.
- `npm run test:multiplayer`: four-player public lobby discovery, one-click joining, ready/unready gate, shared start, guest movement/firing and disconnect (requires a running development build and internet access).
- `npm run test:multiplayer-transport`: real WebRTC input, large fragmented snapshots, epoch changes and a complete guest tap received before simulation.
- `npm run test:multiplayer-presentation`: teammate labels, remote muzzle particles without local recoil, local recoil, death visibility and cleanup.

Current scope: online cooperative survival for four players, public lobby browser, readiness, synchronized countdown, individual movement/weapons/deaths and shared gem rewards. No host migration, mid-run admission or multiplayer replay recording. Multiplayer scores remain separate from solo records.
