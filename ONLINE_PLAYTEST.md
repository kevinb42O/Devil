# Tonight's online playtest

Open https://patio-holdings-commander-recipe.trycloudflare.com/ on each player's computer.

**Friends → Create lobby / Join a listed lobby → everyone READY → host START RUN.**

Any player collecting a gem gives every player one gem. Homing reserves are personal.

This is a temporary HTTPS Cloudflare playtest URL. Keep this Mac awake and the game-file server and tunnel processes running. Friends can use the link from other internet connections; no LAN address or room code is needed.

The server serves this workspace's production `dist/` build on port 5180. Running another production build replaces the served files; reload the game after a rebuild. The leaderboard build passes all 73 tests and the production build. A real solo score was published from Chrome, read in a separate browser, and confirmed at the public HTTPS URL. Publishing a shorter score retained the best time. The previous multiplayer playtest results are documented in [MULTIPLAYER.md](MULTIPLAYER.md); multiplayer was not retested during this leaderboard change.

Serving process: `npm run serve:online` (equivalent to `PORT=5180 node tools/serve-online.mjs`).

Tunnel process: `/tmp/abyss-online-bin/cloudflared tunnel --url http://127.0.0.1:5180 --no-autoupdate --protocol http2`.

Restarting the quick tunnel produces a different public hostname. A permanent deployment should publish `dist/` to an HTTPS static host and configure relay credentials if needed for restrictive networks.

The October 13 build includes the public Supabase leaderboard. Choose **Public leaderboard** in the menu; choose your nickname before the first run and optionally publish new bests automatically. The death screen shows saved, pending, unchanged and unranked states. Scores remain in Supabase when the tunnel stops. See [LEADERBOARD.md](LEADERBOARD.md).
