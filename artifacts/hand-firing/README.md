# Hand skin firing animation

The original game's v3 announcement confirms a dedicated flashing-hand effect:
https://store.steampowered.com/oldnews/?appgroupname=Devil+Daggers&appids=422970&enddate=1746082800&feed=steam_community_announcements

A contemporary player explanation describes the original flashing as homing-reserve feedback, starting at hand III:
https://steamcommunity.com/app/422970/discussions/0/343786746016665508/

The imported manifest and native hand shaders are the local asset reference. Hand III uses hand3/hand4; IV uses hand5/hand6. The additional V–VII tiers retain their existing colors and share the hand5/hand6 pair.

This implementation deliberately extends the original visual language for firing; these timings are design choices, not claimed reverse-engineered original values:

- Stream: a continuous 110 ms cycle, with 45 ms on the alternate skin. Shot events sustain the cycle without resetting its phase, including the slower homing stream.
- Shotgun: immediate alternate skin followed by a 180 ms blend back to idle. A separate envelope prevents stream events from freezing its recovery.
- Twin hands: native texture changes also drive the colored channels and rim. Both palms share the same phase.
- Remote effects leave local hands alone. Clear/menu reset firing state; upgrades do not inherit a previous tier's flash.

`skin-phases.png` shows III–VII in rows: idle, shotgun impact, shotgun fade, stream alternate, stream base. Existing shotgun recoil remains visible in the impact frames.

Validation: deterministic timing at 30/60/144 FPS and both firing cadences; browser checks of all seven tiers, primary/homing stream alternation, intermediate shotgun blends, release, remote isolation, upgrades, and rendered shaders.
