#!/usr/bin/env python3
"""Master quiet wet steps from the CC0 Shoes in the Water recording (NumPy/SciPy)."""
import hashlib,json,pathlib,warnings
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/_sources/footsteps/joseph-sardin-0690.wav'
OUT=ROOT/'public/assets/audio/remake';P=ROOT/'assets/provenance/remake/audio'
with warnings.catch_warnings():
 warnings.simplefilter('ignore');sr,x=wavfile.read(SOURCE)
x=x.astype(float)/32768
runtime=json.loads((ROOT/'src/remake-audio-manifest.json').read_text());manifest=json.loads((OUT/'manifest.json').read_text());recipes=json.loads((P/'recipes.json').read_text());sources=json.loads((P/'sources.json').read_text())
# Discrete shoe contacts with water displacement; exclude quiet recovery scuffs.
peaks=[.155,.83,1.815,2.64,3.55,4.405,5.435,6.37,7.245,8.205,9.245,10.01]
for i,peak in enumerate(peaks,1):
 start=max(0,int((peak-.12)*sr));end=int((peak+.32)*sr)
 y=sosfilt(butter(2,[110,6500],btype='bandpass',fs=sr,output='sos'),x[start:end])
 envelope=np.convolve(y*y,np.ones(240)/240,mode='same')**.5
 offset=max(0,int(np.argmax(envelope))-384)
 y=y[offset:offset+int(.20*sr)];y-=y.mean()
 # Match both the short dry bank's RMS and its maximum amplitude. Water
 # supplies texture, never an excuse to raise the approved footstep level.
 y*=min(.10/max(1e-6,np.sqrt(np.mean(y*y))),.70/max(1e-6,abs(y).max()))
 n=96;y[:n]*=np.linspace(0,1,n);n=1920;y[-n:]*=np.linspace(1,0,n)
 name=f'footstep-wet{i}';path=OUT/(name+'.wav');wavfile.write(path,sr,np.round(y*32767).astype(np.int16))
 item={'file':path.name,'gain':.015,'loop':False,'duration':round(len(y)/sr,6),'role':'footstep'}
 runtime[name]=item;manifest[name]={**item,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'peak':round(float(abs(y).max()),5),'rms':round(float(np.sqrt(np.mean(y*y))),5),'license':'CC0-1.0'}
 recipes[name]={'sources':[str(SOURCE.relative_to(ROOT))],'changes':'Real shoe/water gesture; 110 Hz high-pass and 6.5 kHz low-pass; main impact aligned at 8 ms; 200 ms gesture with 40 ms fade; RMS and peak bounded to approved dry footstep level; no baked room reverb.','sourcePeakSeconds':peak,'sourceStartSeconds':round(start/sr+offset/sr,6)}
row={'file':str(SOURCE.relative_to(ROOT)),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':SOURCE.stat().st_size,'retrieved':'2026-10-18','author':'Joseph SARDIN','name':'Shoes in the Water (690)','url':'https://bigsoundbank.com/shoes-in-the-water-s0690.html','download':'https://bigsoundbank.com/UPLOAD/bwf-en/0690.wav','license':'CC0-1.0'}
sources=[s for s in sources if s['file']!=row['file']]+[row]
for path,data in [(ROOT/'src/remake-audio-manifest.json',runtime),(OUT/'manifest.json',manifest),(P/'recipes.json',recipes),(P/'sources.json',sources)]:path.write_text(json.dumps(data,indent=2)+'\n')
print('Mastered 12 quiet mono wet footsteps:',sum(manifest[f'footstep-wet{i}']['bytes'] for i in range(1,13)),'bytes')
