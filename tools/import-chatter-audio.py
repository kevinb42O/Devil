#!/usr/bin/env python3
"""Restore/verify the eight selected CC0 chatter recordings, never a bulk pack."""
import argparse,hashlib,json,pathlib,urllib.request
ROOT=pathlib.Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser();parser.add_argument('--download-missing',action='store_true');args=parser.parse_args()
rows=json.loads((ROOT/'assets/provenance/remake/audio/chatter/sources.json').read_text())
for row in rows:
 target=ROOT/row['file']
 if not target.exists():
  if not args.download_missing:raise SystemExit(f'Missing {target}; use --download-missing.')
  target.parent.mkdir(parents=True,exist_ok=True)
  with urllib.request.urlopen(row['url'],timeout=90) as response:data=response.read(20000000)
  if hashlib.sha256(data).hexdigest()!=row['sha256']:raise SystemExit('Downloaded hash mismatch: '+row['name'])
  target.write_bytes(data)
 if hashlib.sha256(target.read_bytes()).hexdigest()!=row['sha256']:raise SystemExit('Source hash mismatch: '+row['name'])
print(f'Verified {len(rows)} selected CC0 chatter recordings.')
