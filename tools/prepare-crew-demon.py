"""Trim Quaternius Demon for third-person presentation; no geometry decimation.
Source: https://poly.pizza/m/LnfIziKv4o (CC0)
Usage: python3 tools/prepare-crew-demon.py source.glb public/assets/models/crew-demon.glb
"""
import json, struct, sys
from pathlib import Path

source = Path(sys.argv[1]).read_bytes()
size = struct.unpack_from('<I', source, 12)[0]
doc = json.loads(source[20:20 + size])
blob = source[28 + size:]
# Remove the separate trident and its skin. Keep the character rig unchanged.
assert doc['nodes'][-1]['name'] == 'Trident'
doc['nodes'][0]['children'].remove(len(doc['nodes']) - 1)
doc['nodes'].pop()
doc['meshes'] = doc['meshes'][:1]
doc['skins'] = doc['skins'][:1]
doc['animations'] = [a for a in doc['animations'] if a['name'].split('|')[-1] in ('Idle', 'Run', 'Jump_Idle')]
used = set()
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        used.update(primitive['attributes'].values())
        used.add(primitive['indices'])
for skin in doc['skins']:
    used.add(skin['inverseBindMatrices'])
for animation in doc['animations']:
    for sampler in animation['samplers']:
        used.update((sampler['input'], sampler['output']))
accessor_map = {old: new for new, old in enumerate(sorted(used))}
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        primitive['attributes'] = {key: accessor_map[value] for key, value in primitive['attributes'].items()}
        primitive['indices'] = accessor_map[primitive['indices']]
for skin in doc['skins']:
    skin['inverseBindMatrices'] = accessor_map[skin['inverseBindMatrices']]
for animation in doc['animations']:
    for sampler in animation['samplers']:
        for key in ('input', 'output'):
            sampler[key] = accessor_map[sampler[key]]
doc['accessors'] = [doc['accessors'][old] for old in sorted(used)]
views = sorted({a['bufferView'] for a in doc['accessors']})
view_map = {old: new for new, old in enumerate(views)}
new_blob = bytearray()
new_views = []
for old in views:
    view = doc['bufferViews'][old].copy()
    offset = view.get('byteOffset', 0)
    new_blob.extend(b'\0' * (-len(new_blob) % 4))
    view['byteOffset'] = len(new_blob)
    new_blob.extend(blob[offset:offset + view['byteLength']])
    new_views.append(view)
for accessor in doc['accessors']:
    accessor['bufferView'] = view_map[accessor['bufferView']]
doc['bufferViews'] = new_views
doc['buffers'] = [{'byteLength': len(new_blob)}]
doc['asset']['extras'] = {'source': 'https://poly.pizza/m/LnfIziKv4o', 'author': 'Quaternius', 'license': 'CC0-1.0', 'changes': 'Removed trident and unused animations; retained original character geometry.'}
payload = json.dumps(doc, separators=(',', ':')).encode()
payload += b' ' * (-len(payload) % 4)
new_blob.extend(b'\0' * (-len(new_blob) % 4))
output = struct.pack('<4sII', b'glTF', 2, 28 + len(payload) + len(new_blob))
output += struct.pack('<I4s', len(payload), b'JSON') + payload
output += struct.pack('<I4s', len(new_blob), b'BIN\0') + new_blob
Path(sys.argv[2]).write_bytes(output)
print(f'{len(source):,} → {len(output):,} bytes; {len(doc["animations"])} animations, no textures')
