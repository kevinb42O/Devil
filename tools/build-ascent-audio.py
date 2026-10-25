#!/usr/bin/env python3
"""Master the licensed rocket-booster recording into one replay-seekable ascent track."""
import argparse,array,hashlib,json,math,pathlib,subprocess
ROOT=pathlib.Path(__file__).resolve().parent.parent
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',default='ffmpeg');args=p.parse_args()
sr=44100;folder=ROOT/'assets/_sources/ascent-audio';proof=ROOT/'assets/provenance/ascent-audio';out=ROOT/'public/assets/audio/environment'
def decode(key):
 raw=subprocess.check_output([args.ffmpeg,'-v','error','-i',str(folder/f'{key}.mp3'),'-af','highpass=f=38,lowpass=f=10000','-f','f32le','-ac','2','-ar',str(sr),'pipe:1'])
 samples=array.array('f');samples.frombytes(raw)
 rms=math.sqrt(sum(v*v for v in samples)/len(samples));return samples,.15/max(.001,rms)
booster,bgain=decode('booster')
def smooth(a,b,v):
 x=max(0,min(1,(v-a)/(b-a)));return x*x*(3-2*x)
samples=array.array('f',[0])*(14*sr*2)
def sample(buf,t,ch):
 at=t*sr
 if at<0 or at>=len(buf)//2-1:return 0
 i=int(at);f=at-i;return buf[i*2+ch]*(1-f)+buf[(i+1)*2+ch]*f
for i in range(14*sr):
 t=i/sr;travel=max(0,t-2)
 thrust=(.65*travel+.035*travel*travel)%((len(booster)//2-1)/sr)
 envelope=smooth(2,2.7,t)*(1-smooth(10.3,14,t))
 for ch in [0,1]:
  roar=sample(booster,thrust,ch)*bgain*(.5+.65*smooth(2,9,t))*envelope
  samples[i*2+ch]=.68*math.tanh(roar/.68)
for i in range(round(.03*sr)):
 for ch in [0,1]:samples[-1-i*2-ch]*=i/(.03*sr)
raw=samples.tobytes();target=out/f'ascent-{hashlib.sha256(raw).hexdigest()[:10]}.m4a'
subprocess.run([args.ffmpeg,'-v','error','-y','-f','f32le','-ac','2','-ar',str(sr),'-i','pipe:0','-c:a','aac','-b:a','192k','-movflags','+faststart',str(target)],input=raw,check=True)
manifest={'file':target.name,'duration':14,'origin':480,'gain':.65,'rms':math.sqrt(sum(v*v for v in samples)/len(samples)),'peak':max(abs(v) for v in samples),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
(ROOT/'src/ascent-audio-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
sources=[s for s in json.loads((proof/'sources.json').read_text()) if s['key']=='booster']
for s in sources:s['sha256']=hashlib.sha256((folder/(s['key']+'.mp3')).read_bytes()).hexdigest();s['sourceFormat']='public HQ MP3 preview';s['retrieved']='2026-10-25'
(proof/'sources.json').write_text(json.dumps(sources,indent=2)+'\n')
(proof/'CREDITS.md').write_text('# Ascent sound design\n\nThe rocket-booster recording is CC0 1.0 Universal. The charge and launch whoosh were removed.\n\n'+''.join(f'- {s["key"]}: {s["author"]} — {s["page"]}\n' for s in sources)+'\nChanges: stereo filtering, loudness matching, accelerating booster resampling, envelope fades, soft peak limiting and AAC encoding. The mastered timeline runs from survival phase 480 to 494 seconds. Source hashes are in sources.json.\n\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n')
print(json.dumps(manifest,indent=2))
