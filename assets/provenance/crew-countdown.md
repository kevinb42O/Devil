# Retired multiplayer countdown recording

- Source requested by the user: https://www.myinstants.com/en/instant/5-second-countdown-5302/
- Page title: 5 Second Countdown
- Uploader listed on the page: AcePrestige
- Original download: https://www.myinstants.com/media/sounds/5-second-countdown.mp3
- Retrieved: 2026-10-15
- Runtime file: public/assets/audio/crew-countdown.mp3 (original MP3 bytes)
- Decoded duration: 5.007551 seconds. Spoken number attacks occur at approximately 0, 1, 2, 3 and 4 seconds.
- Playback preserves the recording's speed and pitch, seeks forward for late guest arrivals, and ends at the authoritative start gate. Both modes allow one silent settling second before the five-second voice and visual countdown.

The page provides a downloadable recording; no explicit redistribution license was identified on the source page. This file records provenance, not a license grant.

## Retired during free-audio migration

The MP3 is preserved only at `assets/_sources/retired/crew-countdown.mp3`. It is no longer shipped or requested. The replacement is a five-second assembly of Kenney CC0 Voiceover Pack numbers at `public/assets/audio/remake/crew-countdown.wav`; see `assets/provenance/remake/audio/recipes.json`.

## Evil three-second replacement

The current runtime countdown uses the newly downloaded “Countdown [Powerful Voice]” by nene, https://opengameart.org/content/countdown-powerful-voice (CC BY 4.0). Three separate words are pitched down, given a quiet throat double, saturated and reverberated, with attacks at 0, 1 and 2 seconds. Both solo and multiplayer use the same three-second gate after one silent settling second.

At release, “Evil Laugh” by AntumDeluge, https://opengameart.org/content/evil-laugh (CC0), plays as `crew-release-laugh.wav`. It has a dark stereo hall with 3.8-second decay and is allowed to finish into gameplay. Explicit audio cleanup cancels it. Late guests seek into the countdown without replaying earlier numbers. New source files, hashes and recipes are recorded in the remake bank manifests. Rebuild with `python3 tools/build-crew-arrival-audio.py`; audition `artifacts/crew-arrival-audio/evil-countdown-preview.wav`.

Runtime attribution ships at `public/assets/audio/remake/CREW-VOICE-CREDITS.md`.
