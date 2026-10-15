# Prelobby emote previews

These GIFs capture the courtyard fixture directly through the current `GameRenderer`, using the game’s demon rig, courtyard, camera and emote animation.

- `first-person.gif`: seven seconds showing left arm, both arms and release at 90° FOV, then 145° FOV while looking down at the connected shoulders.
- `friend.gif`: seven seconds looking at a friend performing the same holds and releases, with both hands open and palms facing the observer.

The local body uses the player’s actual origin and the world camera projection. Its torso and shoulder joints are retained, and the head opening is capped. The same arm/hand pose runs on local and remote avatars.

Reproduce with `node tools/record-prelobby-emotes.mjs`, then run `tools/encode-prelobby-emotes.py` with a Python runtime containing Pillow. Run `npm run test:courtyard-emotes` for layout/controller, input transport, palm direction, finger pose and shoulder attachment checks at FOV 75/90/120/145.
