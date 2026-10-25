#!/usr/bin/env python3
"""Fetch selected long recordings only; master stereo game ambience. Requires numpy/scipy, macOS afconvert."""
import concurrent.futures,hashlib,json,pathlib,struct,subprocess,warnings,wave
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt,resample_poly
from scipy.ndimage import gaussian_filter1d
ROOT=pathlib.Path(__file__).resolve().parent.parent
PRIVATE=ROOT/'assets/_sources/studio-audio/environment';PRIVATE.mkdir(parents=True,exist_ok=True)
PROV=ROOT/'assets/provenance/environment-audio';OUT=ROOT/'public/assets/audio/environment'
PROV.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
CAT=json.loads((ROOT/'assets/provenance/remake/audio/pro/catalog-select.json').read_text())
TERMS={'wind':'Strong Wind','rumble':'Super Low','electric':'Intensive Electric','space':'Deep Waves','bells':'Mystery Bells','pulse':'Slow Pulse'}
def fetch(url,span=None):
 cmd=['curl','--fail','-L','-sS','--retry','2','--max-time','120','--max-filesize','75000000']
 if span:cmd+=['--range',f'{span[0]}-{span[1]}']
 return subprocess.check_output(cmd+[url])
def source(item):
 key,term=item;r=next(r.copy() for r in CAT if term in r['name']);p=PRIVATE/(key+'.wav')
 header=fetch(r['url'],[0,65535]);at=12;fmt=None
 while at+8<=len(header):
  size=struct.unpack_from('<I',header,at+4)[0]
  if header[at:at+4]==b'fmt ':fmt=struct.unpack_from('<HHIIHH',header,at+8)
  if header[at:at+4]==b'data':offset=at+8;break
  at+=8+size+size%2
 else:raise ValueError('No PCM data header')
 format,ch,hz,bps,align,bits=fmt
 assert format==1
 # Preserve two minutes of actual evolution, not a short cue repeated to length.
 start=offset+int(4*hz)*align;end=start+int(120*hz)*align-1
 if not p.exists():
  pcm=fetch(r['url'],[start,end]);assert len(pcm)==end-start+1,(key,len(pcm))
  with wave.open(str(p),'wb') as w:w.setparams((ch,bits//8,hz,0,'NONE','not compressed'));w.writeframes(pcm)
 r.update(file=str(p.relative_to(ROOT)),sourceByteRange=[start,end],excerptOffsetSeconds=4,excerptDuration=120,license='Sonniss GDC bundle v2 (2026-08-27)',licenseURL='https://sonniss.com/gdc-bundle-license/',retrieved='2026-10-18',sha256=hashlib.sha256(p.read_bytes()).hexdigest())
 print('Source ready:',key,flush=True);return key,r
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=dict(pool.map(source,TERMS.items()))
for key,num,title,page in [('fire','0989','Big branching fire #3','big-branching-fire-3-s0989.html'),('thunder','0740','Rain and Thunder #2','rain-and-storm-2-s0740.html')]:
 p=PRIVATE/(key+'.wav');url=f'https://bigsoundbank.com/UPLOAD/bwf-en/{num}.wav'
 if not p.exists():p.write_bytes(fetch(url))
 rows[key]={'name':title,'author':'Joseph SARDIN','url':url,'page':'https://bigsoundbank.com/'+page,'license':'CC0-1.0','file':str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'retrieved':'2026-10-18'}
(PROV/'sources.json').write_text(json.dumps(list(rows.values()),indent=2)+'\n')
SR=44100;N=120*SR
cache={}
def audio(key,lo=35,hi=8000):
 if key not in cache:
  with warnings.catch_warnings():warnings.simplefilter('ignore');sr,x=wavfile.read(PRIVATE/(key+'.wav'))
  x=x.astype(np.float64)/(2**(np.iinfo(x.dtype).bits-1))
  if x.ndim==1:x=np.column_stack([x,x])
  x=resample_poly(x,SR,sr)[:N];assert len(x)==N
  x-=x.mean(axis=0);cache[key]=x
 y=sosfilt(butter(2,[lo,hi],btype='bandpass',fs=SR,output='sos'),cache[key],axis=0)
 if key=='wind':
  # This designed recording contains 18–20 second silent gaps between gusts.
  # Offset three long passes so at least one genuine wind performance stays present.
  edge=SR;y[:edge]*=np.linspace(0,1,edge)[:,None];y[-edge:]*=np.linspace(1,0,edge)[:,None]
  y=y+.7*np.roll(y,-32*SR,axis=0)+.55*np.roll(y,-67*SR,axis=0)
 y/=max(1e-8,np.sqrt(np.mean(y*y)))
 # Isolated fire/thunder transients must not set the gain for a whole two-minute bed.
 # Stereo-linked slow levelling preserves width and gusts without near-silent openings.
 y=4*np.tanh(y/4)
 block=SR//4;frames=len(y)//block
 envelope=np.sqrt(np.mean(y[:frames*block].reshape(frames,block,2)**2,axis=(1,2)))
 envelope=gaussian_filter1d(envelope,8,mode='nearest')
 levels=np.clip(.8/np.maximum(envelope,.001),.3,64)
 scale=np.interp(np.arange(len(y)),(np.arange(frames)+.5)*block,levels)
 y*=scale[:,None]
 return y/max(1e-8,np.sqrt(np.mean(y*y)))
# Every bed keeps 120 seconds of source evolution; overlapping playback handles the wrap.
recipes={
 'space': [('space',1,35,5000)],
 'ash': [('wind',1,70,7500),('rumble',.18,35,700)],
 'storm':[('wind',.7,60,8000),('thunder',.8,45,4500)],
 'veil':[('electric',.8,45,6000),('wind',.35,100,2200)],
 'furnace':[('fire',.85,65,6500),('rumble',.55,35,1200)],
 'cathedral':[('bells',.7,80,5000),('wind',.2,100,1300)],
 'depth':[('rumble',.65,35,1800),('pulse',.55,40,4000)],
}
manifestPath=ROOT/'src/environment-audio-manifest.json'
previous=json.loads(manifestPath.read_text()) if manifestPath.exists() else {}
manifest={'heaven':previous['heaven']} if 'heaven' in previous else {}
for name,layers in recipes.items():
 y=sum(audio(k,lo,hi)*gain for k,gain,lo,hi in layers)
 # Match the sustained bed level first; a soft peak ceiling keeps occasional
 # transients from forcing the rest of a chapter down into silence.
 y*=.08/max(1e-8,np.sqrt(np.mean(y*y)))
 y=.4*np.tanh(y/.4)
 n=int(.025*SR);y[:n]*=np.linspace(0,1,n)[:,None];y[-n:]*=np.linspace(1,0,n)[:,None]
 temp=PRIVATE/(name+'-master.wav');wavfile.write(temp,SR,(y*32767).astype(np.int16))
 target=OUT/(name+'-'+hashlib.sha256(temp.read_bytes()).hexdigest()[:10]+'.m4a');subprocess.run(['afconvert','-f','m4af','-d','aac','-b','192000',str(temp),str(target)],check=True)
 manifest[name]={'file':target.name,'duration':120,'gain':.095 if name=='storm' else .18,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'rms':round(float(np.sqrt(np.mean(y*y))),5),'peak':round(float(abs(y).max()),5),'minWindowRms':round(float(min(np.sqrt(np.mean(y[i:i+3*SR]**2)) for i in range(0,N,3*SR))),5),'layers':[{'source':k,'weight':g,'highPass':lo,'lowPass':hi} for k,g,lo,hi in layers]}
 print('Mastered:',name,target.stat().st_size,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
(ROOT/'src/environment-audio-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
