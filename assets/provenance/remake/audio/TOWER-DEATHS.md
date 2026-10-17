# Tower death bellows — 18 October 2026

The three tower deaths use a sustained lion-like final bellow rather than the
shared short body-crunch/monster-death/ceramic recipe. Mono source gestures
preserve positional direction; the existing shared arena body/tail returns
supply space after HRTF and distance attenuation.

## Search and source selection

Searched lion dying/groaning, lion lament, and designed beast vocal recordings.
Considered [roman_cgr's Lion lament](https://freesound.org/people/roman_cgr/sounds/223978/),
[stratcat322's lion growls](https://freesound.org/people/stratcat322/sounds/270383/),
and the existing Podcapocalipsis lion source. Selected
[Beast Roar lvl2.wav by cylon8472](https://freesound.org/people/cylon8472/sounds/267454/)
for its strong sustained bellow and falling throaty decay. The publisher lists
it under CC0, tagged lion, growl and beast. This is a designed lion-like vocal,
not a recording of an animal dying.

Downloaded the MP3 provided by the
[SoundOfYouTube mirror](https://soundofyoutube.com/sfx/dark-beast-fierce-battle-roar-267454).
The source ledger records the exact URL, original publisher, author, hash,
license and retrieval date. Original publisher WAV specs are not the format
of the acquired MP3. New local source: `tower-beast-roar.mp3`.

A quiet recorded gasp and low stone settling from the already licensed
Sonniss bank complete the terminal breath and physical collapse. Source
recordings remain private working files; the preview is synchronized gameplay.

## Timing and mix

- `killminisquid`: lower-intensity groan from the earlier vocal gesture.
- `killsquid`: stronger final bellow from the central gesture.
- `killultrasquid`: the same central performance voiced lower for greater size.

`tools/tower_death_audio.py` builds the edits at the renderer's
`TOWER_DEATH_DURATION` from `src/enemy-presentation.ts` (currently 2 seconds).
The voice continues throughout the descent, with only a final 95ms release.
Runtime playback rate also fits the catalog duration to this shared animation
constant. Replay speed scales the vocal together with world time.

Catalog gain .68 and runtime tower trim .55 give fuller body than the generic
kill recipe; ordinary enemy kills keep their .25 trim. Tower death priority is
3, above swarm deaths at 2. Warm tower death files before general emergence
preloads and request the matching file on spawn, preventing a cold death cue
from depending on a last-second download. Death immediately stops that tower's
chatter. Pause/restart follows the existing audio lifecycle.

Rebuild: `python3 tools/build-remake-audio.py --only tower-deaths`.
Verify: `node tests/tower-death-audio-browser.mjs`.
Preview: `node tools/record-tower-death-audio.mjs` (old medium tower first, then
small/medium/large new bellows with real sinking animations).
