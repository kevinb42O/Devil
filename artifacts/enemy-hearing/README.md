# Enemy approach audio — 20 October 2026

Open [the audition](http://127.0.0.1:5173/artifacts/enemy-hearing/audition.html) while the Vite development server is running. It covers all 22 enemy signatures, with previous/corrected dry spatial mixes, distance, bearing, and the nearest-voice contribution in a 28-enemy encounter. The 11 free alternative recordings are source auditions, not installed replacements. Their perceived quality still needs a headphone/gameplay judgement.

## Confirmed problems and implemented corrections

- Authored chatter effective RMS was roughly .008–.018 before master volume and distance. Runtime threat trim is now 3 (+9.54 dB); other effects are unchanged.
- Enemy reference distance changes from 3 to 6 world units. At distance 12 the inverse attenuation changes from .2174 to .4545. Maximum hearing boundaries stay finite.
- Uniform same-kind scaling previously reduced each of 28 voices to .2268. The nearest now retains 1.05 (versus 1.2 alone); the other voices share the remaining power. The sum of squared voice scales stays 1.44, avoiding multiplying the same-kind noise budget. At 12 units, the nearest cue is approximately 29.3 dB stronger than before in a full same-kind selection, or 15.9 dB for a solo enemy. These are calculated dry gains, not perceived loudness measurements.
- New enemy loops start at their first recorded articulation instead of a random offset that can land in a rest. Existing loops continue normally.
- Chatter early-room send falls from .12 to .045 and long-tail send from .095 to .015, keeping the directional attack more prominent.

This corrects audibility and prioritization; it does not establish that the existing recordings have the best character, or that all nearby voices remain separately identifiable in dense combat. Headphone playtesting with sustained weapons remains the subjective acceptance check.

## Online replacement shortlist

These are candidates selected by available sound lists and source descriptions. Premium library recordings were not acquired or installed. They require licensed acquisition and an actual audition before a final sound assignment.

| Enemies covered | Proposed audible identity | Source to audition |
| --- | --- | --- |
| skull, skull2, skull3, skull4 | Four separate jaw/rasp identities with a steady presence and increasingly heavy articulation | SoundMorph **Monster Within**: small-creature idle/shuffle families; BOOM **Creature Foley** for physical articulation |
| transmuted1, transmuted2, transmuted3, transmuted4 | Four sharper, more urgent identities distinguishable from normal skulls, not just the same loop slowed down | **Monster Within** small-creature performances, separately selected takes; dry foley layer |
| spiderling | Fast fine scuttling with crisp transients | **Creature Foley** small movement materials; **Mutant Insects** for an optional restrained texture, avoiding a wing sound on a crawling enemy |
| spider, spider2 | Distinct light/heavy shell movement and short jaw signatures | **Creature Foley** movement materials; **Monster Within** creature idles |
| centipede, gigapede, ghostpede | Three continuous travel identities: rolling rattle, heavy grinding, airy rasp | **Monster Within** Sicarius rolling movement loops; **Creature Foley** movement layers. Keep positional source on nearest living segment |
| squid, squid2, squid3 | Three wet cavity/pulsation signatures, larger without becoming only sub-bass | Bluezone **Organic Lifeform Textures** for the sustained body; separate recorded throat articulation |
| leviathan | Large rough breathing with enough midrange to localize | **Monster Within** larger-creature families plus movement articulation; reject long cinematic tails for travel loops |
| orb | Stable, recognizable searching/wet texture distinct from squid | **Organic Lifeform Textures**, short edited cycle |
| thorn | Dry scratch/tear articulation with a small sustained presence | **Creature Foley** dry movement textures |
| egg, egg2 | Two shell-creak/wet-stirring signatures, lower priority than moving killers | **Creature Foley** and **Organic Lifeform Textures**, separate takes |

Sources verified online:

- [Monster Within product listing](https://www.asoundeffect.com/sound-library/monster-within-2/) and [full sound list](https://portal.sound-ideas.com/Files/SpecificationFile/Monster_Within_by_SoundMorph.pdf): includes small creature idles/shuffles, leech footsteps loops, and Sicarius rolling movement. Strongest broad candidate for the next audition; suitability is an inference from this catalog, not a claim based on hearing the full library.
- [BOOM Creature Foley](https://www.boomlibrary.com/sound-effects/creature-foley/): movement toolkit; likely the most relevant addition for physical approach detail.
- [Bluezone Organic Lifeform Textures](https://www.bluezone-corporation.com/sound-effects-packs/horror/organic-lifeform-textures): biological textures and mutation material; likely useful for squid/orb body layers, with transient articulation added for localization.
- [SoundMorph Mutant Insects](https://www.asoundeffect.com/sound-library/mutant-insects/): oversized flying-insect/wing material. Specialized option, not a complete solution for ground creatures.

## Free audition sources acquired

- [Monster Sound Effects Pack](https://opengameart.org/content/monster-sound-effects-pack), **Ogrebane**, CC0: ten WAVs.
- [Monster SFX](https://opengameart.org/content/monster-sfx), **marcelofg55**, CC0: one WAV.

Original recordings are in `candidates/`; hashes, author, source URL and license are recorded in `candidates.json`. Downloaded 20 October 2026. These packs lean toward vocal events, so they are alternatives to evaluate rather than assumed travel-loop upgrades. No files from these packs are referenced by gameplay.

The [80 CC0 creature SFX pack](https://opengameart.org/content/80-cc0-creature-sfx) was also researched, but its recordings are already present in `assets/_sources/remake-audio/creatures`; reintroducing that pack would not provide new material.
