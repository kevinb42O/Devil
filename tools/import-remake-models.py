"""Verify or restore the focused CC0 creature set from its recorded provenance.

python3 tools/import-remake-models.py --check
python3 tools/import-remake-models.py --download-missing
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true', help='Verify source and runtime files without changes')
parser.add_argument('--download-missing', action='store_true', help='Fetch only missing, explicitly listed source files')
args = parser.parse_args()
records = json.loads((root / 'assets/provenance/remake/models.json').read_text())
for record in records:
    source = root / record['file']
    runtime = root / record['runtimeFile']
    if not source.exists() and args.download_missing and not args.check:
        request = urllib.request.Request(record['url'], headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read()
        if payload[:4] != b'glTF' or hashlib.sha256(payload).hexdigest() != record['sha256']:
            raise RuntimeError(f"Unexpected download contents: {record['name']}")
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(payload)
    if not source.exists() or hashlib.sha256(source.read_bytes()).hexdigest() != record['sha256']:
        raise RuntimeError(f"Missing or modified source: {source}")
    if not args.check:
        runtime.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, runtime)
    if not runtime.exists() or hashlib.sha256(runtime.read_bytes()).hexdigest() != record['sha256']:
        raise RuntimeError(f"Missing or modified runtime model: {runtime}")
print(f"Verified {len(records)} CC0 models: source/runtime SHA-256 hashes agree.")
