# Tonight's online playtest

Open https://statistics-population-floors-strategies.trycloudflare.com/ on each player's computer.

**Friends → Create lobby / Join a listed lobby → everyone READY → host START RUN.**

Any player collecting a gem gives every player one gem. Homing reserves are personal.

This is a temporary HTTPS Cloudflare playtest URL. Keep this Mac awake and the game-file server and tunnel processes running. Friends can use the link from other internet connections; no LAN address or room code is needed.

The served build is frozen in `/tmp/abyss-online-playtest/dist` so other active chats editing this workspace cannot reload or break a match. The multiplayer source lives in this project. The workspace build and all 65 unit tests passed, including the latest shared-workspace game fixes. The published files are copied into the isolated serving directory so subsequent builds in other chats cannot replace them. The four-browser public-lobby test passed discovery, one-click join, readiness and unready gating, synchronized start, guest movement/firing, and disconnect. The public HTTPS URL was also checked for complete asset loading and lobby creation. Local changes made after that snapshot require a fresh build to reach the published game.

Serving process: `GAME_DIST=/tmp/abyss-online-playtest/dist PORT=5181 node tools/serve-online.mjs`.

Tunnel process: `/tmp/abyss-online-bin/cloudflared tunnel --url http://127.0.0.1:5181 --no-autoupdate --protocol http2`.

Restarting the quick tunnel produces a different public hostname. A permanent deployment should publish `dist/` to an HTTPS static host and configure relay credentials if needed for restrictive networks.
