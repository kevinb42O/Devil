"""Import authored CC0 props, embedding their supplied palette textures in GLBs."""
import base64
import hashlib
import io
import json
from pathlib import Path
import struct
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'public/models/courtyard'
PROVENANCE = ROOT / 'assets/provenance/courtyard'
PACKS = [
    ('graveyard', 'https://kenney.nl/assets/graveyard-kit',
     'https://kenney.nl/media/pages/assets/graveyard-kit/ba8d4b4517-1760691807/kenney_graveyard-kit_5.0.zip',
     ['fire-basket', 'altar-stone', 'candle-multiple', 'pillar-small', 'stone-wall', 'stone-wall-column', 'detail-bowl']),
    ('dungeon', 'https://kenney.nl/assets/modular-dungeon-kit',
     'https://kenney.nl/media/pages/assets/modular-dungeon-kit/7bed87605b-1771926065/kenney_modular-dungeon-kit_1.0.zip',
     ['gate-metal-bars', 'gate', 'template-floor', 'template-wall', 'stairs']),
]


def embed(data, archive, original):
    length, kind = struct.unpack_from('<II', data, 12)
    doc = json.loads(data[20:20 + length])
    for image in doc.get('images', []):
        uri = image.get('uri', '')
        if uri and not uri.startswith('data:'):
            path = str(Path(original).parent / uri)
            payload = archive.read(path)
            image['uri'] = 'data:image/png;base64,' + base64.b64encode(payload).decode('ascii')
    encoded = json.dumps(doc, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    tail = data[20 + length:]
    return struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(tail)) + struct.pack('<II', len(encoded), kind) + encoded + tail


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    PROVENANCE.mkdir(parents=True, exist_ok=True)
    manifest = []
    for pack, page, url, names in PACKS:
        raw = urllib.request.urlopen(url, timeout=40).read()
        archive = zipfile.ZipFile(io.BytesIO(raw))
        (PROVENANCE / (pack + '-license.txt')).write_bytes(archive.read('License.txt'))
        for name in names:
            original = 'Models/GLB format/' + name + '.glb'
            source = archive.read(original)
            output = embed(source, archive, original)
            (DEST / (name + '.glb')).write_bytes(output)
            manifest.append(dict(author='Kenney', license='CC0-1.0', page=page, download=url,
                                 original=original, file=name + '.glb',
                                 source_sha256=hashlib.sha256(source).hexdigest(),
                                 sha256=hashlib.sha256(output).hexdigest(),
                                 transforms='Embed supplied palette PNG; runtime placement, scale and rotation. Mesh geometry unchanged.'))
    (PROVENANCE / 'models.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('Imported', len(manifest), 'authored props with embedded textures.')


if __name__ == '__main__':
    main()
