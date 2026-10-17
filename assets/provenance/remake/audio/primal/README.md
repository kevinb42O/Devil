# Primal weapon vocal sources

Two additional CC0 sources were retrieved on 17 October 2026. Original MP3 previews remain in the ignored private studio source directory; edited vocal gestures are incorporated into the game's weapon cues.

- [LION ROAR — Podcapocalipsis](https://freesound.org/people/Podcapocalipsis/sounds/559600/): a designed lion-like roar, published under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Retrieved the publisher's HQ MP3 preview. Selected gestures begin near 4.9, 8.35 and 11.18 seconds. `podcapocalipsis-lion.html` preserves the source page.
- [Lion roaring.mp3 — Bidone](https://freesound.org/people/Bidone/sounds/69572/): field recording of a lion with surrounding wildlife/water, published under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Retrieved the publisher's HQ MP3 preview. Selected short gestures near 12.08, 14.57, 16.94 and 18.65 seconds emphasize the roar. `bidone-lion.html` preserves the source page.

Exact download URLs, original authors, MP3 byte counts and SHA-256 hashes are in `../pro/selected-sources.json`. The importer retrieves those exact MP3s. The weapon builder decodes them to temporary 48 kHz PCM with macOS `afconvert`, then isolates, filters, layers and masters them. It does not relabel these as original animal recordings.

The bear, gibbon, banshee, hunter, large-beast and other creature voices come from the existing licensed Sonniss source selection. Each finished cue records its actual source paths in `../recipes.json`; `../sources.json` records their provenance and hashes. The mixed cue retains the existing Sonniss license identifier where those recordings are incorporated.
