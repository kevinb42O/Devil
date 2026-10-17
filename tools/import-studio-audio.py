#!/usr/bin/env python3
"""Fetch only the selected Sonniss recordings/excerpts from their recorded URLs.
Private studio sources are ignored by Git. No bundles or torrents are fetched.
Running this accepts the publisher's game-use license; consult LICENSE-NOTES.md.
"""
import argparse,json,pathlib,subprocess,hashlib,struct,wave
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--download-missing',action='store_true');a=p.parse_args()
rows=json.loads((ROOT/'assets/provenance/remake/audio/pro/selected-sources.json').read_text())
def fetch(url,byteRange=None):
 cmd=['curl','--fail','-L','-sS','--max-time','90','--max-filesize','40000000']
 if byteRange:cmd+=['--range',f'{byteRange[0]}-{byteRange[1]}']
 return subprocess.check_output(cmd+[url])
for row in rows:
 target=ROOT/row['file']
 if not target.exists():
  if not a.download_missing:raise SystemExit('Missing private studio recording: '+row['name']+'; use --download-missing to retrieve the selected file.')
  target.parent.mkdir(parents=True,exist_ok=True)
  if row.get('sourceExcerpt'):
   header=fetch(row['url'],[0,65535]);at=12
   while at+8<len(header):
    size=struct.unpack_from('<I',header,at+4)[0]
    if header[at:at+4]==b'fmt ':_,channels,hz,_,_,bits=struct.unpack_from('<HHIIHH',header,at+8);break
    at+=8+size+size%2
   else:raise ValueError('Source PCM format not found')
   pcm=fetch(row['url'],row['sourceByteRange'])
   with wave.open(str(target),'wb') as w:w.setparams((channels,bits//8,hz,0,'NONE','not compressed'));w.writeframes(pcm)
  else:target.write_bytes(fetch(row['url']))
 digest=hashlib.sha256(target.read_bytes()).hexdigest()
 if digest!=row['sha256']:raise SystemExit('Source hash mismatch: '+row['name'])
print(f'Verified {len(rows)} selected private studio recordings; no bulk downloads.')
