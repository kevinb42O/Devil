# ABYSS / Memory Trainer

A native macOS and Windows companion for memory-based aim assistance and ESP. There is no screen detector, screenshot preview, automatic firing, invincibility, damage modification, or modifier key to hold.

On Windows the ESP/HUD is drawn in a canvas inside the managed game page with `pointer-events: none`. The companion creates no desktop overlay window; only F7 settings uses a visible native window. Production connections use the game's stable trainer interface without pausing the JavaScript debugger.

Windows F7 settings has mouse-operated Aim, ESP, Targets and Connection tabs, with validated saving, staged presets/defaults, and JSON import/export. Press F7, Close, or the window close button to save your edits and return to the game; Apply saves while keeping the menu open. Invalid values or failed saves keep the menu open with an error. Saving preserves the custom values shown in the form. The ESP aim-cone indicator is enabled by default. Wide cones use a dashed screen-space indicator; 360° is labeled ALL DIRECTIONS because it also includes targets behind you.

## Launch and controls

On macOS, double-click **Start Trainer.command**. On Windows, double-click **Start Trainer.bat**. Play in the **Chrome window the trainer opens**; that is the session attached to memory. The default address is **https://devil-green.vercel.app**. Use F7 to switch to a local development address when needed.

The Windows launcher installs the trainer's browser bridge on its first run and leaves its console open if setup fails, so missing Node.js or Python is visible instead of looking like an immediate crash. Install Chrome, current Node.js LTS, and Python 3.9–3.12 with **Add Python to PATH** selected before launching it.

The trainer starts with aim enabled. Fire either weapon normally to aim. Homing must actually be unlocked and have reserve; pressing an unavailable secondary weapon does not turn the camera.

| Key | Action |
| --- | --- |
| F7 | Open/close settings |
| F8 | Toggle aim |
| F9 | Disable aim |
| F4 | Toggle ESP independently of aim |
| F3 | Toggle the HUD |
| F6 | Apply the next preset |
| F10 | Quit and close the managed browser |

Use Fn with these keys if your keyboard uses media controls. All trainer shortcuts are global on Windows; macOS keeps F7 and F10 global and scopes the others to the managed browser or settings. The native input handler consumes reserved function keys so Chrome does not also open Find, focus the address bar, or enable caret browsing. macOS may require Accessibility/Input Monitoring permission; Windows uses the built-in global-hotkey API. Escape remains available for the game's normal pause/menu behavior.

Screen Recording permission is **not used by the trainer**. The optional UI QA script captures only its own test windows.

## Presets

| Preset | Behavior |
| --- | --- |
| Precision | Instant snap, 360° aim cone, hittable tower crystals first, then nearest hittable enemy. |
| Smooth | Rate-limited tracking inside a 120° cone, with a visible cone indicator. |
| Survival | Prioritizes approaching threats instead of enforcing tower-first selection. |
| Minimal | Precision aim with a quieter overlay: fewer points and reduced visual detail. |

F6 applies a preset immediately. In F7 settings, choose a preset and click **Load preset** to review it, then **Apply**. A preset resets its options and target filters while preserving the game address. Manual changes become **Custom**. **Import** and **Export** save versioned JSON configurations locally. Imported files take effect only after Apply. Invalid values and failed saves leave the current runtime settings intact.

## Aim settings

- Instant snap or smooth tracking with an adjustable turn rate.
- Aim cone from 1° to 360° and maximum target distance. Actual weapon lifetime still limits reachable targets.
- Selection by crosshair proximity, distance, remaining target health, or estimated approaching threat.
- Tower-crystal priority, lock preference and minimum hold time. Dead/ineligible targets are dropped immediately; higher-priority targets break a lower-priority lock immediately. Nearest-distance mode ignores lock preference and hold time so a nearer eligible target takes over on the next aiming update.
- Prediction at normal/homing projectile speeds, with an adjustable prediction horizon.
- Individual inclusion filters for all 22 enemy kinds. Aim exclusions do not hide enemies in ESP.

With the default tower priority and nearest-distance selection enabled, hittable crystals attached to squid towers come first. Blocked crystals remain in ESP but yield to hittable enemies. All remaining enemies, exposed weak points and segments compete by distance, without a preference for a farther special enemy over a nearby ordinary enemy. A crystal regains priority on the next update when a clear damage path opens. Other selection modes remain available as custom preferences.

Health and weak-point positions come from the actual game objects. Transform and collision helpers account for tower rotation and emergence, spider crystals and segmented enemies. Both primary and homing targeting check the actual armor collision meshes of all active towers, including towers whose crystals are already gone. The solver samples shootable points inside a crystal's damage sphere when its center is hidden. Prediction is checked again against armor; a blocked lead ray falls back to the verified damage point. These are current-geometry checks; projectile spread, future tower movement and homing steering still affect flight after launch.

Loose pickups in `world.gems` are never scanned. A crystal's destroyed/released state removes it from the aim and ESP sets on the next update.

## ESP settings

- Corner or full boxes, enemy/crystal labels and live health bars.
- Distance, selected-target tracer and a predicted-intercept marker.
- Off-screen indicators, grouped per enemy to reduce segment clutter.
- Optional aim cone, custom colors, opacity, label size and a cap on rendered points.
- Compact or detailed HUD in any of four corners.

ESP displays live enemies that are currently outside the aim cone, excluded from aiming, armored or not yet active. Unavailable targets are dimmed. Selection runs separately from ESP projection so hiding or simplifying the overlay does not reduce aim-update speed.

Viewport coordinates account for browser page zoom, Retina density, display placement and fullscreen dimensions. The overlay updates its bounds when the monitor layout changes.

## Connection and recovery

The trainer launches a dedicated persistent Chrome profile in `.chrome-profile/`. It uses the browser debugger to access live JavaScript game objects and module variables rather than searching OS byte offsets. It installs a temporary runtime adapter and adjusts yaw/pitch/input aim while attached. No game files are patched.

This adapter uses the game's opt-in trainer diagnostic surface. Development builds expose it automatically; production builds expose it only when built with `VITE_TRAINER_ENABLED=true`. The repository's production environment enables that flag, so redeploy the current build before using the Vercel address. The normal browser profile, its tabs and its account state are separate from the managed profile.

**Reconnect memory** reattaches to the current browser session without restarting a run. If the managed browser was closed, reconnect opens it again. Changing the game address restarts the managed browser. A second launch is rejected while another trainer instance holds its lock.

Aim is disabled on loss of game focus/capture, menus, death, settings suspension or a missing heartbeat. Blur and pointer-lock changes clear physical fire latches. A new run clears motion history even if enemy IDs are reused. Trainer exceptions cannot suppress the original game frame callback. A latched aim fault is visible in the HUD; toggle aim off/on or use Reconnect after correcting its cause.

Normal shutdown removes the temporary frame wrapper and input listeners. Page reload also removes the attachment; the bridge reattaches automatically. Disconnections clear ESP so stale boxes do not remain on screen.

## Dependencies and validation

Requires macOS or Windows, Chrome, Node.js and Python 3.9–3.12. Windows uses the standard-library Tk and Win32 APIs; macOS uses the pinned native Python dependencies. Settings are in `settings.json`; exported configurations are versioned JSON.

```sh
npm test
npm run test:simulation
.venv/bin/python -m unittest -v test_trainer.py test_hotkeys.py
npm run test:live
npm run test:ui
npm run test:native-live
```

The simulation checks require the parent game's source and existing `tsx` dependency. They exercise real projectile damage and crystal release for all three tower types with primary and homing fire. The browser check attaches to the running development build, verifies a real enemy kill, reattachment, reload and removal. Preview encounters are unranked and do not publish scores. UI QA checks preset/form roundtrips and renders the native settings tabs and ESP.

The native live check uses a temporary browser profile and actual function-key events to verify memory connection, preset/ESP/aim/settings controls and preservation of Chrome's document focus. It does not start a gameplay run or save settings to your regular trainer profile.

The load test measures CPU time for 1,500 target entries; it is not a guarantee of game FPS. Projectile spread, occlusion and enemy motion still affect hits. This software does not alter those mechanics or guarantee a particular run result.
