# ABYSS / DAGGERS — teaser production plan

Planning date: 18 October 2026. Scope: plan the complete teaser; video production has not started. Working creative title: **DESCEND**. Use the current game title, ABYSS / DAGGERS, on screen.

## Creative brief

Make a 75-second film that leaves friends wanting to step into the game. The central idea is that one small arena falls through worlds of increasing scale and menace, while the player fights to survive. Show the beauty, establish the actual combat, then make the environment feel enormous through sound and a moment of restraint.

The emotional sequence is invitation → wonder → danger → pressure → awe → violent release. Give each major reveal enough uninterrupted screen time to register. Camera movement should feel deliberate and physical. Combat should feel fast, controlled and readable.

Default decisions: landscape 16:9; real game rendering throughout; no narration; sparse typography; atmospheric audio drives the edit; no added music in the first cut. Include music later only if the cut clearly needs it. The signature sounds already provide a score: cosmic pressure, rain, fire, stone resonance, enemy voices and weapons.

## What the project supports today

This plan is grounded in the source, current production documents, recording scripts and selected saved review frames. The existing videos have been identified, but not watched end to end during this planning pass. A fresh visual and listening review is the first production step.

- `src/descent.ts` supplies the cosmic opening and six descent chapters. The 30-second cosmic introduction offsets environment chapters without shifting encounter timing.
- `src/environment-audio.ts` provides seven stereo environmental beds reconstructed from match time. Use this mixer rather than matching random ambience to each location.
- Rain includes actual wet-stone shading, sky reflections, ripples and splashes. The Furnace has footage-based flames, warm stone and heat distortion. Cathedral geometry, light and dust are implemented in `src/cathedral.ts`.
- The solo sanctuary supplies a moonlit approach and illuminated gate. Saved frames make this a useful opening composition.
- Existing storm, furnace, cathedral and sanctuary capture tools provide a starting point for clean camera shots and synchronized environmental audio.
- Solo replay preserves input-driven runs. Crew replay supports first-person, follow, free-flight and top-down cameras. Their suitability for trailer capture and complete sound reconstruction must be checked before relying on them.
- The proposed monumental Unlit Depth treatment is still a plan. Its existing dark atmosphere may support a brief closing image, but the proposed broken foundation crown must not appear in the shot list as an implemented feature.

Current reference films include `artifacts/storm-film/descent-storm-film.mp4`, `artifacts/furnace-film/furnace-polished.mp4`, `artifacts/cathedral-film/cathedral-polished.mp4` and `artifacts/solo-sanctuary/sanctuary.mp4`. Treat them as composition references. Verify the cathedral filename on disk before use. They are not final trailer source masters: existing environment tools burn in study labels, some include letterboxing, and preview audio levels differ from runtime levels.

## The 75-second edit

Times below are positions in the finished video. Match-clock values later in this document are separate capture references. The film is an edited journey; do not imply that all chapters happen within a single 75-second run.

| Film time | Picture and camera | Sound and edit purpose |
| --- | --- | --- |
| 00–04 | Start on the moonlit sanctuary gate, visible in the first frame. Slow approach with warm lamps against cold stone. | Stone footsteps, small lamp/fire detail and distant air. Establish presence immediately. |
| 04–08 | Pass toward the seal; cut on its bright centre to the arena under the cosmic sky. Hold a grounded, upward-tilted view with arena edge in frame. | Gate resonance gives way to broad cosmic pressure. First large reveal; let it breathe. |
| 08–14 | First-person opening fight. Acquire one clear target, fire, dodge, release fire and collect gems. Keep the hands and target readable. | Real weapon attack, enemy response and gem return. Establish what playing feels like. |
| 14–19 | Cloud Grave: low lateral move over wet stone, then raise the view enough to connect rain, floor and sky. | Bring rain in before the cut. Hear droplets and a distant thunder roll; lower weapon density here. |
| 19–26 | First-person storm fight. A readable burst kill followed by a close but clearly avoided threat. End on forward movement. | Wet footfalls, localized enemy chatter, distinct burst impact. Maintain the player’s perspective. |
| 26–30 | Bruised Veil: short moving view across the arena with violet sky and moving mist. Keep a landmark for scale. | Electrical ambience and hollow wind take over. A brief uneasy bridge between storm and heat. |
| 30–35 | Furnace reveal. Cut from cold violet to warm copper stone, then expose flame beyond the arena rim. | Fire arrives slightly ahead of the image. One low impact on the reveal, then the actual burning bed. |
| 35–43 | Furnace combat: a complete tracking attack, an enemy breaking apart, then gem collection. Upgraded hands can appear here if the take is strong. | Clear projectile/impact detail over restrained fire. Escalate the threat without saturating the mix. |
| 43–47 | Large-creature silhouette or segment sweep across the view; cut from first-person to one short exterior angle if a replay provides it cleanly. | Creature voice moves across stereo. Select a take where its passage and sound agree. |
| 47–55 | Cathedral reveal. Start at player height under the ribs; use a slow lateral/upward move to connect architecture, shafts and limestone. Hold the strongest composition for at least three seconds. | Drop combat density abruptly. Let a distant bell decay into air through stone. This is the main sound-design showcase. |
| 55–59 | Low cathedral detail shot: grazing light, stone relief and dust, followed by a tiny moving player/creature for scale if available. | Quiet footsteps and environmental resonance. Preserve near/far contrast. |
| 59–67 | Final first-person combat sequence in the strongest available setting. Three purposeful cuts: attack → evade → decisive kill/collection or earned upgrade. Keep at least one continuous four-second action. | Build from weapons, movement and enemies. The last event gets one clean, strong transient. |
| 67–70 | Hard cut to near darkness; a brief existing Depth silhouette if legible, otherwise black after the last impact. | Leave the last combat tail, then geological air. A moment of release before the title. |
| 70–75 | ABYSS / DAGGERS. Optional single line: ENTER THE ABYSS. Hold long enough to read. | One low, restrained resonance and a decaying environmental tail. Finish cleanly. |

This allocation provides about half the film for action and half for atmosphere, reveals and title. Final timing should follow the strongest takes. Keep the cathedral pause even if other beats are shortened.

## Gameplay direction

Record convincing actions with beginnings and payoffs. Each selected passage should show where the player is looking, what threatens them and how they respond. Useful takes:

1. Tap burst into one visible target, then move through the opening.
2. Controlled stream tracking across a moving enemy.
3. Release fire so gems return visibly to the player.
4. One close dodge with enough context to read the distance.
5. Dual-hand firing after progression or in clearly staged practice footage.
6. A large creature crossing the environment with readable scale and trajectory.

Use real recorded play for combat. Practice starts can place the capture at late environments, but do not dress a staged test as a verified ranked achievement. Choose encounters independently of chapter names: the environment clock has a 30-second offset, while encounter timing does not. Reject stationary target-dummy combat and uncontrolled mouse whipping.

Keep essential aiming/feedback visible in action shots. Hide menus, cursor, practice notices, debug text, chat, timers and replay controls through a capture presentation layer. Any camera smoothing belongs to cinematic/replay shots; retain the player's decisive camera movement in gameplay. Use exterior shots sparingly, with most action in first person.

Co-op is optional. Include a two-player combat passage only if it reads immediately and a good recording exists. The courtyard games and broader feature catalogue belong in a separate trailer; this film's main subject is descent, survival and atmosphere.

## Capture windows and shot coverage

These are match-clock seconds, derived from the current descent and audio code. The windows select established environments, rather than chapter transitions, unless specified.

| Environment | Capture references | Required coverage |
| --- | --- | --- |
| Solo sanctuary | Entrance scene, outside run clock | Approach, gate close view, one usable clean cut to arena. |
| Cosmic Expanse | 4–18; handover at 21–30 | Player-height reveal, restrained sky tilt, opening action. |
| Last Sky | 30–51 before incoming storm | Optional clean arena geography shot; useful fallback. |
| Cloud Grave | 85–115; incoming transition at 51–69 | Wet-stone tracking shot, player-height wide, combat. |
| Bruised Veil | 160–210 | Violet atmosphere with readable floor, short action alternative. |
| Furnace | 285–325; cathedral arrives at 362–380 | Grounded reveal, heat/material detail, action and large-creature option. |
| Cathedral Below | 400–435; departure into Depth at 454–472 | Player-height architectural reveal, lateral parallax, stone/light detail, combat option. |
| Existing Unlit Depth | 486–520 | Optional short silhouette; only if it survives small-screen compression. |

Record two or three alternatives per required shot. Give each take 2–3 seconds of handles before and after the action. Obtain at least one longer continuous take per action setting and 15–20 seconds of clean ambient sound per environment. Capture one uncut environmental handover as an alternative, but use only an excerpt if it earns its time.

## Image quality and camera rules

Target a genuine 1920×1080, 60 fps master if the renderer and capture pipeline sustain it. Run a short full-complexity capture benchmark first. Fall back to a consistent 30 fps master if necessary; smooth cadence matters more than the number in the filename. Avoid mixing repeated-frame 60 fps recordings with genuine 60 fps action.

The current renderer caps its drawing buffer at roughly 1.6 million pixels and can adapt resolution. A 1080p output canvas does not by itself establish native 1080p scene detail. Inspect `src/game-viewport.ts` and renderer sizing before promising the master resolution. If needed, add an isolated capture option for buffer size, fixed quality and resolution adaptation, benchmark it, and keep it outside normal gameplay settings. No 4K claim from an upscale.

Warm assets, shaders and the correct audio beds before recording. Use High quality with mist and full environment motion where performance permits. Compose cinematic shots around a moderate lens; test roughly 65–80 degrees and check the actual FOV convention. Keep gameplay near a comfortable player FOV rather than forcing the cinematic lens onto action.

Use one purposeful move per beauty shot: approach, lateral track, or restrained tilt. Preserve arena edge and landmarks for scale. Avoid repeated orbits, excessive bloom, fake lens dirt, arbitrary zooms and baked letterbox bars. Retain shadow texture and mist detail after encoding. Colour should move from cold space/storm through violet, warm furnace and cold cathedral using the game’s own lighting.

## Sound direction and capture

The main mix should feel intimate in its near details and enormous in its distant layers. Start the rough cut with environmental beds, footsteps, weapons and creature voices. Their rhythm should determine the first edit. No narration or generic trailer riser is required.

- Reserve exposed listening moments at the gate, storm surface and cathedral reveal. Avoid placing gunfire over every attractive environment shot.
- Introduce incoming ambience roughly 0.3–0.8 seconds before its picture cut when it helps continuity. Carry outgoing resonances briefly across cuts, without stacking whole beds indefinitely.
- Preserve stereo direction for creature passes, while checking every major cue in mono. The listener orientation must match the selected camera, including exterior replay shots.
- Separate ambience and action buses where feasible. Record a simultaneous combined reference to preserve synchronization. For separate passes, verify identical timing and camera paths before using them as stems.
- The existing environment films use `EnvironmentAudio` directly. A teaser recorder also needs the actual weapon, enemy, footstep, impact and gem/event paths. Audit `src/audio.ts` routing; routing only the environment bus would produce silent combat.
- Existing showcase scripts lift preview audio independently of gameplay. Establish trailer levels from clean captured sources rather than concatenating those differently boosted films.
- Suggested finishing target: roughly −16 to −14 LUFS integrated with true peaks no higher than −1 dBTP. These are working mix targets, not a guarantee of a platform's playback level. Preserve the cathedral dip and sharp weapon attacks; do not compress every moment to equal loudness.
- Test on stereo headphones, laptop speakers and a phone at ordinary volume. Large-scale atmosphere must remain audible without needing sub-bass reproduction.

## Production work packages

### 1. Source review and shot proof

Watch the existing environment films, listen to the current build and inspect the strongest shots at delivery size. Identify any visible shader, geometry or motion defects affecting those compositions. Make short test captures of cosmic, storm combat, furnace combat and cathedral. Confirm playback cadence, complete audio routing, scene loading and shadow detail. Keep game fixes scoped to actual capture blockers.

### 2. Dedicated clean capture tool

Use the existing `tools/record-*-film.mjs` patterns to build a teaser recorder with a shot manifest. Proposed manifest fields: shot ID, source type (live/replay/staged environment), seed or replay path, match start/end, camera path, FOV, quality, resolution, frame rate, sound bus settings and output filename. Record the source revision and relevant settings with each take.

Produce clean picture and synchronized sound without labels or baked fades. Separate shot capture from editorial titles and transitions. Reject a take when assets are incomplete, audio is missing or cadence is unstable. Test representative shots before spending time recording full coverage. MediaRecorder can support a first pass, but measure its actual timing; use another capture path if it cannot sustain the selected master specification.

### 3. Coverage and genuine play

Capture the planned beauty shots and record gameplay attempts in each selected setting. Save usable replay inputs alongside footage. Collect multiple action outcomes, then select for readable movement and satisfying payoff. Capture short reaction/scale inserts only when they serve the edit.

### 4. Rough cut

Build the complete 75-second sequence with reference sound, then adjust shot lengths around the best footage. Confirm the opening hooks within three seconds, combat is clear by fourteen seconds, Furnace changes the energy and Cathedral supplies a deliberate release. Review the full film before polishing individual transitions.

### 5. Picture and sound finish

Replace weak takes, refine sound bridges, balance ambience against action, add the title and check colour continuity. Prefer hard cuts and a few motivated fades. Use only modest sound reinforcement where a real event needs it. Any new music or sound source requires its own documented usage rights before inclusion.

### 6. Delivery and viewing check

Export, decode and watch the entire final file with sound. Check audio/video sync near the beginning and end, frame pacing in fast movement, missing audio on cuts, title readability and compression in dark fog, rain and sparks. Review the smaller share file independently. Save a poster from the strongest actual frame.

## Deliverables

- `abyss-daggers-teaser-master.mp4`: 75-second landscape H.264/AAC stereo master, 1080p at the verified frame rate; proposed video bitrate 20–30 Mbps and audio 256–320 kbps. Final rate depends on the fog/rain quality check.
- `abyss-daggers-teaser-share.mp4`: same edit with a smaller bitrate suitable for directly sending to friends. At 6 Mbps video plus 192 kbps audio, 75 seconds is about 58 MB before container overhead; adjust resolution/bitrate to the actual sending limit. Do not promise a particular app accepts it until checked.
- Poster image, shot manifest, selected replay inputs, edit timeline/project or reproducible assembly instructions, audio settings and a brief capture/QA report.
- Optional 20–25-second short cut after the main film works: cosmic hook → storm action → Furnace → cathedral → title. A vertical version requires deliberate reframing of hands and targets and is a separate finishing pass.

Keep output in a dedicated `artifacts/teaser/` directory so earlier studies remain available. This planning pass does not create that production output or modify gameplay.

## Completion criteria

The film is finished when it delivers a visible hook immediately, shows real combat with clear cause and effect, gives storm/fire/cathedral their own visual and sonic identities, and ends with a readable title. There must be no debug/study overlays, accidental silence, visible loading, camera clipping, persistent frame pacing problems or claims that outrun the footage. A clean 720p or 30 fps fallback is preferable to an unstable nominal specification.

The first production milestone is a short proof containing one beauty shot and one action shot with complete synchronized audio. Once that capture path is sound, build the complete rough cut before the final polish.
