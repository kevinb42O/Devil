#!/usr/bin/env python3
"""Master individually sliced CC0 field-recorded steps; requires numpy/scipy."""
import hashlib,json,pathlib,warnings
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt
ROOT=pathlib.Path(__file__).resolve().parent.parent
SOURCE=ROOT/'assets/_sources/footsteps/joseph-sardin-1318.wav'
OUT=ROOT/'public/assets/audio/remake';P=ROOT/'assets/provenance/remake/audio'
with warnings.catch_warnings():
 warnings.simplefilter('ignore');sr,x=wavfile.read(SOURCE)
x=x.astype(float)/2147483648
runtime=json.loads((ROOT/'src/remake-audio-manifest.json').read_text());manifest=json.loads((OUT/'manifest.json').read_text());recipes=json.loads((P/'recipes.json').read_text());sources=json.loads((P/'sources.json').read_text())
# Twelve distinct heel/toe gestures, with no adjacent step or ambience loop.
peaks=[.69,1.94,2.56,3.17,4.39,4.99,6.87,8.67,9.24,9.85,11.01,11.63]
for i,peak in enumerate(peaks,1):
 start=int((peak-.16)*sr);end=int((peak+.30)*sr)
 y=sosfilt(butter(2,[110,6500],btype='bandpass',fs=sr,output='sos'),x[start:end])
 # Align the main impact, not a quiet scrape before it. The former first-
 # activity trim left 5–160 ms of inconsistent delay across shuffled samples.
 envelope=np.convolve(y*y,np.ones(240)/240,mode='same')**.5
 offset=max(0,int(np.argmax(envelope))-384)
 y=y[offset:offset+int(.20*sr)];y-=y.mean()
 y*=min(.10/max(1e-6,np.sqrt(np.mean(y*y))),.70/max(1e-6,abs(y).max()))
 n=96;y[:n]*=np.linspace(0,1,n);n=1920;y[-n:]*=np.linspace(1,0,n)
 name=f'footstep-stone{i}';path=OUT/(name+'.wav');wavfile.write(path,sr,np.round(y*32767).astype(np.int16))
 item={'file':path.name,'gain':.015,'loop':False,'duration':round(len(y)/sr,6),'role':'footstep'}
 runtime[name]=item;manifest[name]={**item,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'peak':round(float(abs(y).max()),5),'rms':round(float(np.sqrt(np.mean(y*y))),5),'license':'CC0-1.0'}
 recipes[name]={'sources':[str(SOURCE.relative_to(ROOT))],'changes':'Individual real concrete shoe gesture; 110 Hz high-pass, 6.5 kHz low-pass, RMS/peak calibrated, main impact aligned at 8 ms, 200 ms gesture with 40 ms release fade, subdued gain. Dry mono for runtime HRTF and shared room sends.','sourcePeakSeconds':peak,'sourceStartSeconds':round(start/sr+offset/sr,6)}
row={'file':str(SOURCE.relative_to(ROOT)),'sha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'bytes':SOURCE.stat().st_size,'retrieved':'2026-10-18','author':'Joseph SARDIN','name':'Fast Steps on Concrete (1318)','url':'https://bigsoundbank.com/fast-steps-on-concrete-s1318.html','download':'https://bigsoundbank.com/UPLOAD/bwf-en/1318.wav','license':'CC0-1.0'}
sources=[s for s in sources if s['file']!=row['file']]+[row]
for path,data in [(ROOT/'src/remake-audio-manifest.json',runtime),(OUT/'manifest.json',manifest),(P/'recipes.json',recipes),(P/'sources.json',sources)]:path.write_text(json.dumps(data,indent=2)+'\n')
print('Mastered 12 mono stone footsteps:',sum(manifest[f'footstep-stone{i}']['bytes'] for i in range(1,13)),'bytes')
