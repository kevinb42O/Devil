#!/usr/bin/env python3
"""Rebuild the evil 3-2-1 and release laugh from credited internet recordings."""
import hashlib,json,pathlib,subprocess,tempfile,warnings
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt,resample_poly,fftconvolve
warnings.filterwarnings('ignore',category=wavfile.WavFileWarning)
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/_sources/crew-arrival';OUT=ROOT/'public/assets/audio/remake';P=ROOT/'assets/provenance/remake/audio';SR=48000

def read(path):
 if path.suffix=='.ogg':
  with tempfile.TemporaryDirectory() as tmp:
   decoded=pathlib.Path(tmp)/'decoded.wav'
   subprocess.run(['afconvert','-f','WAVE','-d','LEI16',str(path),str(decoded)],check=True)
   hz,x=wavfile.read(decoded)
 else:hz,x=wavfile.read(path)
 x=x.astype(float)/32768
 if x.ndim==2:x=x.mean(axis=1)
 x=resample_poly(x,SR,hz);x-=x.mean()
 active=np.flatnonzero(abs(x)>max(.002,abs(x).max()*.015))
 return x[max(0,active[0]-240):min(len(x),active[-1]+480)]

def fade(x,seconds=.012):
 x=x.copy();n=min(int(SR*seconds),len(x)//2)
 x[:n]*=np.linspace(0,1,n);x[-n:]*=np.linspace(1,0,n)
 return x

def demon(x,rate):
 x=resample_poly(x,1000,round(rate*1000))
 x=sosfilt(butter(2,[85,6200],btype='bandpass',fs=SR,output='sos'),x)
 x=np.tanh(x*2.2)/1.7
 # A quiet, deeper double adds throat without hiding the consonants.
 sub=resample_poly(x,1000,880);out=x.copy();n=min(len(x)-int(.018*SR),len(sub))
 out[int(.018*SR):int(.018*SR)+n]+=sub[:n]*.16
 return fade(out)

def hall(x,seconds,wet):
 rng=np.random.default_rng(731);n=int(seconds*SR);t=np.arange(n)/SR
 impulse=np.zeros((n,2))
 for c in range(2):
  noise=sosfilt(butter(2,3600,fs=SR,output='sos'),rng.normal(size=n))
  noise*=np.exp(-6.9*t/seconds);noise[:int(.047*SR)]=0
  noise/=np.sqrt(np.sum(noise**2));impulse[:,c]=noise*wet
  for delay,level in [(.071,.34),(.137,.24),(.229,.16),(.373,.11)]:
   impulse[int((delay+c*.009)*SR),c]+=level*wet
 result=np.column_stack([fftconvolve(x,impulse[:,c]) for c in range(2)])
 result[:len(x)]+=x[:,None]
 return result

voice=np.zeros((SR*3,2))
for i,word in enumerate(['three','two','one']):
 x=demon(read(SOURCE/(word+'.wav')),.80)
 x=x[:int(.88*SR)];x=fade(x,.02);x*=.19/max(.001,np.sqrt(np.mean(x*x)))
 y=hall(x,1.25,.32);at=i*SR;n=min(len(y),len(voice)-at);voice[at:at+n]+=y[:n]
voice[-int(.035*SR):]*=np.linspace(1,0,int(.035*SR))[:,None]
laugh=hall(demon(read(SOURCE/'antumdeluge-evil-laugh.ogg'),.83),3.8,1.1)
laugh[-int(.18*SR):]*=np.linspace(1,0,int(.18*SR))[:,None]

runtime=json.loads((ROOT/'src/remake-audio-manifest.json').read_text());manifest=json.loads((OUT/'manifest.json').read_text());recipes=json.loads((P/'recipes.json').read_text());sources=json.loads((P/'sources.json').read_text())
for path in [SOURCE/'three.wav',SOURCE/'two.wav',SOURCE/'one.wav',SOURCE/'antumdeluge-evil-laugh.ogg']:
 row={'file':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size,'retrieved':'2026-10-17','author':'AntumDeluge' if path.suffix=='.ogg' else 'nene','url':'https://opengameart.org/content/evil-laugh' if path.suffix=='.ogg' else 'https://opengameart.org/content/countdown-powerful-voice','license':'CC0-1.0' if path.suffix=='.ogg' else 'CC-BY-4.0'}
 sources=[s for s in sources if s['file']!=row['file']];sources.append(row)
for name,x,gain,role,license,paths in [('crew-countdown',voice,1,'countdown','CC-BY-4.0',['three.wav','two.wav','one.wav']),('crew-release-laugh',laugh,.65,'arrival-laugh','CC0-1.0',['antumdeluge-evil-laugh.ogg'])]:
 x*=.88/max(.001,abs(x).max());path=OUT/(name+'.wav');wavfile.write(path,SR,np.round(x*32767).astype(np.int16))
 item={'file':path.name,'gain':gain,'loop':False,'duration':round(len(x)/SR,6),'role':role}
 runtime[name]=item;manifest[name]={**item,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'peak':round(float(abs(x).max()),5),'rms':round(float(np.sqrt(np.mean(x*x))),5),'license':license}
 recipes[name]={'sources':[str((SOURCE/f).relative_to(ROOT)) for f in paths],'changes':'Trimmed real voice; lowered pitch, saturated throat double, dark stereo convolution reverb; countdown attacks at 0/1/2 seconds; release laugh has 3.8-second hall decay.'}
 print(name,manifest[name])
for path,data in [(ROOT/'src/remake-audio-manifest.json',runtime),(OUT/'manifest.json',manifest),(P/'recipes.json',recipes),(P/'sources.json',sources)]:path.write_text(json.dumps(data,indent=2)+'\n')
# Standalone audition exactly as sequenced in the game.
preview=np.zeros((3*SR+len(laugh),2));preview[:len(voice)]+=voice*.4;preview[3*SR:]+=laugh*.65
folder=ROOT/'artifacts/crew-arrival-audio';folder.mkdir(exist_ok=True)
wavfile.write(folder/'evil-countdown-preview.wav',SR,np.round(preview*32767).astype(np.int16))
