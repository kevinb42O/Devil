#!/usr/bin/env python3
"""Master locally archived CC0 SFXMint soft UI sounds. Requires numpy/scipy."""
import hashlib
import json
import pathlib

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, resample_poly, sosfilt

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/audio/menu'
ARCHIVE = ROOT / 'assets/_sources/menu-audio/sfxmint'
SR = 48000
OUT.mkdir(parents=True, exist_ok=True)
# One close, restrained family: no glass accents, melodic confirms or fanfares.
# role: original, maximum duration, low-pass cutoff, target RMS, playback gain
RECIPES = {
    'uihover': ('ui-hover-15', .055, 2200, .045, .16),
    'uiclick': ('ui-click-56', .105, 3400, .075, .32),
    'uiback': ('ui-click-56', .075, 2100, .065, .24),
    'uislider': ('ui-pop-57', .035, 1800, .040, .12),
    'uitoggle': ('ui-toggle-54', .110, 2800, .065, .28),
    'uicrown': ('ui-click-56', .125, 3000, .075, .32),
}
manifest, selections = {}, {}
for name, (slug, limit, cutoff, target, gain) in RECIPES.items():
    original = ARCHIVE / (slug + '.wav')
    metadata = json.loads((ARCHIVE / (slug + '.json')).read_text())
    assert hashlib.sha256(original.read_bytes()).hexdigest() == metadata['format_metadata']['wav']['sha256']
    sr, raw = wavfile.read(original)
    x = raw.astype(np.float64) / 32768
    if x.ndim == 1:
        x = np.repeat(x[:, None], 2, axis=1)
    x = resample_poly(x, SR, sr, axis=0)
    x -= x.mean(axis=0)
    x = sosfilt(butter(2, 100, 'highpass', fs=SR, output='sos'), x, axis=0)
    x = sosfilt(butter(2, cutoff, fs=SR, output='sos'), x, axis=0)
    # Discard the source's silent padding; keep the onset and a short soft tail.
    envelope = np.max(abs(x), axis=1)
    active = np.flatnonzero(envelope > envelope.max() * .008)
    start = max(0, active[0] - round(.002 * SR))
    end = min(active[-1] + round(.004 * SR), start + round(limit * SR))
    x = x[start:end]
    attack, release = min(round(.003 * SR), len(x)//4), min(round(.018 * SR), len(x)//3)
    x[:attack] *= np.linspace(0, 1, attack)[:, None]
    x[-release:] *= np.linspace(1, 0, release)[:, None] ** 2
    x *= min(target / max(np.sqrt(np.mean(x*x)), 1e-9), .45 / max(np.max(abs(x)), 1e-9))
    dest = OUT / (name + '-soft.wav')
    wavfile.write(dest, SR, np.round(x * 32767).astype('<i2'))
    manifest[name] = dict(file=dest.name, gain=gain, duration=round(len(x)/SR, 6),
                          sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
    selections[name] = dict(source=metadata['wav_url'], title=metadata['title'],
                            sourceSha256=metadata['format_metadata']['wav']['sha256'],
                            maxDuration=limit, lowpassHz=cutoff, targetRms=target)
(ROOT / 'src/menu-audio-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
provenance = dict(author='SFXMint', source='https://sfxmint.com/sets/ui-soft', license='CC0-1.0',
                  licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',
                  processing='100 Hz high-pass, role-specific low-pass, silence trim, short decay, 3 ms attack, 18 ms fade, RMS/peak mastering; 48 kHz stereo. No synthesized layers.',
                  selections=selections, output=manifest)
(ROOT / 'assets/provenance/menu-audio/sources.json').write_text(json.dumps(provenance, indent=2) + '\n')
(OUT / 'LICENSE.md').write_text('# Menu audio\n\nSource: [SFXMint Soft UI](https://sfxmint.com/sets/ui-soft).\n\n'
    'License: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).\n\n'
    'Original WAVs and publisher metadata: assets/_sources/menu-audio/sfxmint/.\n'
    'Selected, trimmed, filtered and mastered for this game. Recipes and hashes: assets/provenance/menu-audio/sources.json.\n'
    'Rebuild: python3 tools/build-menu-audio.py.\n')
print(json.dumps(manifest, indent=2))
