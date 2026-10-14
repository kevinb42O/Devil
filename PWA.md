# Install Abyss on a phone

Production builds include a web app manifest, opaque PNG icons (including an Android maskable icon and an Apple touch icon), a versioned service worker, installation help, and an optional complete offline download.

## Installation

Serve the contents of `dist/` at the root of a stable HTTPS origin. The current runtime asset paths and service worker scope assume root hosting. Localhost is also supported for development testing. Changing the hostname creates a separate app and separate browser storage.

- **Android:** open the HTTPS game in Chrome. Choose **Install app** in the menu, or **INSTALL APP** inside Abyss when Chrome makes its native prompt available. Launch the new Abyss icon.
- **iPhone / iPad:** open the game in Safari, choose **Share → Add to Home Screen**, keep **Open as Web App** enabled when shown, and tap **Add**. Launch the new Abyss icon.

The manifest requests fullscreen and landscape. Android can honor both; iPhone opens as a Home Screen web app without Safari toolbars, while iOS retains control of its status bar and home indicator. The existing CSS landscape fallback handles platforms that cannot lock orientation. Physical device verification is still needed for device-specific rendering and OS chrome.

Abyss detects standalone launches and hides its redundant browser fullscreen control. Touch controls remain automatic on touch phones. The screen wake lock is requested during gameplay on supported platforms; hiding the app releases it and the existing game lifecycle pauses play.

## Offline play and updates

The worker installs the app shell, models, textures, fonts and UI with bounded concurrency. Audio is cached as used. **INSTALL APP → SAVE GAME FOR OFFLINE PLAY** explicitly saves all original WAV effects and music; the dialog shows the build's actual download size (currently about 505 MiB). Keep the game open until it reports completion. The download resumes from already cached files after a failure. Browser storage limits and eviction still apply, and persistent storage is requested after a complete download.

Solo gameplay and local recordings work offline after the complete download. Leaderboards, cooperative play and shared replay downloads require internet. Same-origin static game files are the only intercepted requests; remote backend traffic is untouched. Cached audio supports byte-range responses for Safari streaming.

Each build hashes the shipped files and creates a separate cache. Downloaded updates activate without closing every window; no automatic reload interrupts a run. Online navigation fetches the current deployed page, falling back to the cached page when offline. Reload after a run to display a newly installed release. The next activation deletes older Abyss caches. Reopen the offline panel to save the new release's audio for full offline play.

## Build and validation

```sh
npm run build
npm run serve:online
# In a second terminal:
npm run test:pwa
```

The browser test checks Chrome's installability diagnostics and PNG sizes, the install button, the complete download, cold offline startup, cached audio ranges, a mobile game launch, and WebKit iPhone guidance / standalone detection. It downloads roughly 505 MiB into its disposable browser cache. Existing `npm run test:mobile` and `npm run test:fullscreen` cover touch controls and fullscreen behavior.

`tools/serve-online.mjs` serves the manifest MIME type and uses revalidation for the HTML, worker, manifest and offline file list. Configure equivalent headers on other hosts. Deploy all build files together and avoid serving an HTML fallback for missing assets. A phone cannot install from another computer's plain-HTTP LAN address; use HTTPS.
