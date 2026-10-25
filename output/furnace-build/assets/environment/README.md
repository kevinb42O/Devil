# Sky panoramas

`cosmic-galaxy-v1.png` is an original generated game environment asset, created with the built-in image generation tool for this project. Generated with the built-in ImageGen tool on 15 October 2026 and copied into the project before use.

The panorama supplies distant galactic structure and stars. `AbyssSky.ready` loads it before gameplay shaders are prepared. The shader samples it in world-oriented spherical coordinates, darkens the wrap seam and fades the zenith to black. It uses sRGB decoding, mipmaps and a restrained linear exposure.

The moving foreground nebula is not baked into this image: `OpeningMist` reconstructs it in world space with a 3D density field, metre-scale coordinates, upward motion, depth clipping and local emissive illumination. Keep the foreground volume independent when changing the panorama.

## Ash and Cloud Grave

`ash-sky-v1.png` and `cloud-grave-v1.png` are original generated 2:1 cloud panoramas created on 15 October 2026. Ash uses charcoal billows and faint warm backlighting; Cloud Grave uses immense cold slate storm shelves and silver upper rims. Both are preloaded through `AbyssSky.ready`.

The ash panorama covers the original opening (actual run time 30–69 s), blending into Cloud Grave during 51–69 s. Cloud Grave fades into the existing Bruised Veil during 126–144 s. All encounter clocks are unchanged.

Weather sampling rises monotonically with the existing travel parameter, independently of phase opacity. The wrap overlap is blended rather than darkened, and narrow polar caps merge into the chapter atmosphere to avoid pinching. Reduced motion holds the texture coordinates fixed while retaining chapter changes. Pure textured weather bypasses procedural cloud noise; later chapter landmarks retain their existing rendering.

## Furnace and Cathedral

`furnace-sky-v1.png` and `cathedral-sky-v1.png` are original generated 2:1 panoramas created on 15 October 2026. The Furnace uses layered charcoal smoke and broad copper backlighting. The Cathedral uses distant basalt vaults, eroded arches and a dark plum abyss. Both use the same overlap seam blend, polar treatment, sRGB decoding and mipmap filtering as the weather panoramas.

All panorama samplers use wrap-aware texture gradients so mip filtering stays continuous across the longitude boundary.

The Furnace fades in during actual run time 241–259 s, blends into the Cathedral during 362–380 s, and the Cathedral fades into Unlit Depth during 454–472 s. Their rise is measured from fixed chapter origins rather than from their fade weights. Reduced motion freezes it. Old cathedral rib silhouettes hand over to the generated architecture during arrival; furnace arcs remain as subdued accents. Scene lighting, volumetric mist, encounter timing and replay clocks are unchanged by this sky replacement.
