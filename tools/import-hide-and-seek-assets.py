"""Import a pinned selection of Kenney's CC0 Graveyard Kit, with local textures."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('courtyard_import', ROOT / 'tools/import-courtyard-assets.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
URL = 'https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip'
NAMES = ['crypt-a', 'crypt-b', 'crypt-small', 'crypt-small-roof', 'coffin', 'coffin-old',
         'hay-bale', 'hay-bale-bundled', 'column-large', 'pillar-obelisk', 'pillar-square',
         'stone-wall', 'stone-wall-column', 'altar-stone', 'rocks-tall', 'lantern-candle',
         'urn-square', 'candle-multiple']

def main():
    dest = ROOT / 'public/models/hide-and-seek'
    provenance = ROOT / 'assets/provenance/hide-and-seek'
    dest.mkdir(parents=True, exist_ok=True)
    provenance.mkdir(parents=True, exist_ok=True)
    raw = urllib.request.urlopen(URL, timeout=45).read()
    archive = zipfile.ZipFile(io.BytesIO(raw))
    license_text = archive.read('License.txt')
    (provenance / 'graveyard-license.txt').write_bytes(license_text)
    (dest / 'LICENSE.txt').write_bytes(license_text)
    manifest = []
    for name in NAMES:
        original = 'Models/GLB format/' + name + '.glb'
        source = archive.read(original)
        output = module.embed(source, archive, original)
        (dest / (name + '.glb')).write_bytes(output)
        manifest.append(dict(author='Kenney', license='CC0-1.0', version='5.0',
                             page='https://kenney.nl/assets/graveyard-kit', download=URL,
                             archive_sha256=hashlib.sha256(raw).hexdigest(), original=original,
                             file=name + '.glb', source_sha256=hashlib.sha256(source).hexdigest(),
                             sha256=hashlib.sha256(output).hexdigest(),
                             transforms='Embed supplied palette texture. Runtime instances use authored geometry.'))
    (provenance / 'models.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'Imported {len(manifest)} models; {sum(p.stat().st_size for p in dest.glob("*.glb")):,} bytes')

if __name__ == '__main__':
    main()
