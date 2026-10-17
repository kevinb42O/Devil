# Hand transformation recordings

17 October 2026. Six distinct full-length transformation designs, edited from
professional animal and monster recordings. No AI-generated audio, oscillator
layers, or re-use of a pitched earlier hand as a later hand's principal cue.

| Hand | Identity | Lead recording | Length |
| --- | --- | --- | --- |
| II | Serpent: skin splits, pressure hiss and brittle rupture | Gamemaster Audio: `snake_hiss_03.wav` | 2.7 s |
| III | Bear: close guttural snarl, chest impact and responding growl | Gamemaster Audio: `bear_pain_hurt_groan_01.wav` | 3.2 s |
| IV | Maw: sustained ripping roar and stone collapse | David Dumais Audio: `MonsterPack2_Monster09_Death02.wav` | 4.7 s |
| V | Hunter: sharp split-throat attack, followed by a deeper answering shriek | SoundMorph: `Monster Within - Hunter - Fley_Attack02.wav`, with Phase 4 Libraries' banshee vocal | 3.4 s |
| VI | Feral chorus: rising animal cries, grinding organic body and heavy debris | SoundBits: `Gibbons_02.wav` | 4.7 s |
| VII | Apex: descending enormous beast bellow, layered throat and chest rumble | SoundMorph: `Monster Within - Large Beast - Taunt2Stun03.wav` | 5.0 s |

Layered with the existing licensed physical impact, stone, skin and air recordings.
Vocal releases are shaped to avoid abrupt cuts. Gentle saturation thickens the
body; filtered stereo reflections add dark space while the direct attack stays
centered. Newer transformations fade the previous cue from that same player;
teammates retain independent positional voices. All six cues play at their
designed native pitch, including hands V–VII, and the next hand preloads in play.

Acquired six individual WAVs from the Sonniss GameAudioGDC collection through
the GameSounds mirror; source URLs, hashes and byte sizes are in
`pro/selected-sources.json`. Per-cue layers and lead identities are recorded in
`recipes.json`. No bulk libraries, torrents or paid purchases.

Sources: [Gamemaster Audio / Animal Sounds](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2018+-+Game+Audio+Bundle/Gamemaster+Audio+-+Animal+Sounds),
[SoundBits / Collected Animals](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2020+-+Game+Audio+Bundle/SoundBits+-+Collected+Animals),
[SoundMorph / Monster Within](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2018+-+Game+Audio+Bundle/SoundMorph+-+Monster+Within),
[Phase 4 Libraries / Monster Roars](https://gamesounds.xyz/?dir=Sonniss.com+-+GDC+2020+-+Game+Audio+Bundle/Phase+4+Libraries+-+Monster+Roars).
The [Sonniss license](https://sonniss.com/gdc-bundle-license/), version 2.0,
effective 27 August 2026, governs these recordings. Runtime edits and preview
footage are synchronized within this game; originals remain private.

Rebuild: `python3 tools/build-remake-audio.py --only upgrades`.
Regression: `node tests/hand-upgrade-audio-browser.mjs`.
In-game preview: `node tools/record-hand-upgrade-audio.mjs`.
