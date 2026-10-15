# Ash and Cloud Grave sky replacement

The two early atmospheric chapters now use generated full-sphere panoramas instead of the coarse procedural cloud-sheet backdrop. Both images are original assets in `public/assets/environment`, loaded before renderer preparation. They retain the existing volumetric mist, lighting timeline, chapter times and gameplay clocks.

- Ash / The Last Sky: actual run time 30–69 s; charcoal billows, broken upper ceiling, faint warm backlight.
- Cloud Grave: actual run time 69–144 s; cold slate storm shelves, silver upper rims and deep recesses.
- Ash blends into Cloud Grave during 51–69 s; Cloud Grave blends into Bruised Veil during 126–144 s. The later procedural chapters and their landmarks remain in place.

Texture sampling moves upward with the existing bounded travel parameter. Phase opacity never changes travel direction. A narrow overlap blend closes the panorama seam, and natural atmosphere caps prevent pole pinching. Reduced motion freezes the sampling coordinates while preserving chapter progression. Pure textured weather bypasses the procedural cloud noise; the sky still uses one mesh and one draw during crossfades.

## Verification

- `npm run build` passed. Vite reports the existing large-bundle advisory.
- `npm run test:weather-skies` runs both render checks. Both scripts passed individually after the replacements.
- `weather-sky-browser.mjs`: real enemies, hand and mist; forward/upward captures at 30, 45, 60, 69, 100, 135 and 144 s; Low quality; pause and backward seeking; both sides of every transition; wrap seam; pole samples; and one isolated sky draw through all phases. See `audit.json`.
- `weather-motion-browser.mjs`: image matching finds upward shifts of 8 pixels for ash and 16 pixels for Cloud Grave over the probe intervals. Reduced motion produces identical pixels within a chapter. See `motion.json`.

The tests use isolated fixture pages to avoid unrelated Vite live-reload navigation in the shared workspace. No performance timing claim is made for these asset replacements. They add two preloaded textures and no render targets or sky draws.

## Preview

Open `/artifacts/descent/preview.html?time=30` for ash or `?time=69` for Cloud Grave. The phase selector and **Ash passage · 1×**, **Cloud Grave · 1×**, and **Ash → cloud grave** controls use actual run time.

The PNGs in this directory are actual renderer captures, including the foreground volume and game assets. They are not concept mockups.
