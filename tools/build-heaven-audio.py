#!/usr/bin/env python3
"""Import the CC0 Freesound choir; master a local stereo heaven bed. Pass --ffmpeg."""
import argparse,array,hashlib,json,math,pathlib,subprocess,urllib.request

ROOT=pathlib.Path(__file__).resolve().parent.parent
PAGE='https://freesound.org/people/deadrobotmusic/sounds/808032/'
MEDIA='https://cdn.freesound.org/previews/808/808032_11532701-hq.mp3'
parser=argparse.ArgumentParser();parser.add_argument('--ffmpeg',default='ffmpeg');args=parser.parse_args()
sources=ROOT/'assets/_sources/heaven-audio';proof=ROOT/'assets/provenance/heaven-audio';output=ROOT/'public/assets/audio/environment'
for folder in [sources,proof,output]:folder.mkdir(parents=True,exist_ok=True)
def fetch(url,path):
 if not path.exists():
  request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'})
  with urllib.request.urlopen(request,timeout=60) as response:path.write_bytes(response.read())
source=sources/'ethereal-choir-808032.mp3';fetch(MEDIA,source);fetch(PAGE,proof/'ethereal-choir-source.html')
pcm=subprocess.check_output([args.ffmpeg,'-v','error','-ss','25','-i',str(source),'-t','120','-af','highpass=f=70,lowpass=f=8500','-ar','44100','-ac','2','-f','f32le','pipe:1'])
samples=array.array('f');samples.frombytes(pcm)
rms=math.sqrt(sum(v*v for v in samples)/len(samples));gain=.08/rms
for i,v in enumerate(samples):samples[i]=.4*math.tanh(v*gain/.4)
edge=1102
for i in range(edge):
 for channel in range(2):samples[i*2+channel]*=i/edge;samples[-1-i*2-channel]*=i/edge
raw=samples.tobytes();stem=hashlib.sha256(raw).hexdigest()[:10];target=output/f'heaven-{stem}.m4a'
subprocess.run([args.ffmpeg,'-v','error','-y','-f','f32le','-ar','44100','-ac','2','-i','pipe:0','-c:a','aac','-b:a','192k','-movflags','+faststart',str(target)],input=raw,check=True)
window=3*44100*2
record={'file':target.name,'duration':len(samples)/(44100*2),'gain':.18,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rms':round(math.sqrt(sum(v*v for v in samples)/len(samples)),5),'peak':round(max(abs(v) for v in samples),5),'minWindowRms':round(min(math.sqrt(sum(v*v for v in samples[i:i+window])/len(samples[i:i+window])) for i in range(0,len(samples),window)),5),'layers':[{'source':'ethereal-choir-808032','weight':1,'highPass':70,'lowPass':8500}]}
manifestPath=ROOT/'src/environment-audio-manifest.json';manifest=json.loads(manifestPath.read_text());manifest['heaven']=record
for path in [manifestPath,output/'manifest.json']:path.write_text(json.dumps(manifest,indent=2)+'\n')
provenance={'title':'Ambient F Sharp Minor Ethereal Choir Pad 1','author':'deadrobotmusic','page':PAGE,'media':MEDIA,'sourceFormat':'public high-quality MP3 preview','license':'CC0-1.0','licenseURL':'https://creativecommons.org/publicdomain/zero/1.0/','retrieved':'2026-10-25','sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'source':str(source.relative_to(ROOT)),'excerptStart':25,'excerptDuration':120,'changes':'Stereo excerpt, high/low pass, sustained loudness match, soft peak limiting, 25 ms edge fades, AAC encoding. Runtime overlaps loop tails.','output':record}
(proof/'source.json').write_text(json.dumps(provenance,indent=2)+'\n')
(proof/'CREDITS.md').write_text(f'# Heaven soundscape\n\n“Ambient F Sharp Minor Ethereal Choir Pad 1” by deadrobotmusic.\n\nSource: {PAGE}\n\nLicense: CC0 1.0 Universal — {provenance["licenseURL"]}\n\nThe game uses a mastered 120-second excerpt of the public high-quality MP3 preview. Source, edits and hashes are recorded in source.json.\n')
print(json.dumps(record,indent=2))
