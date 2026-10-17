#!/usr/bin/env python3
"""Master the CC0 menu theme and generate a deterministic stereo UI room."""
import hashlib,json,pathlib,subprocess,tempfile
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter,sosfilt
ROOT=pathlib.Path(__file__).resolve().parent.parent
OUT=ROOT/'public/assets/audio/menu'
OUT.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/_sources/remake-audio/dark_place.ogg'
source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
assert source_hash=='c78a433139ace4a050b5d4a1b9b94bcf1f04d059345c849c7c234a2fe0eda102'
with tempfile.TemporaryDirectory() as folder:
 pcm=pathlib.Path(folder)/'theme.wav'
 subprocess.run(['afconvert',str(source),str(pcm),'-f','WAVE','-d','LEI16@48000'],check=True)
 sr,x=wavfile.read(pcm);x=x.astype(float)/32768
 x-=x.mean(axis=0)
 # Full musical arrangement, with headroom and a short fade at the loop boundary.
 x*=min(.16/np.sqrt(np.mean(x*x)),.85/np.max(abs(x)))
 n=round(.12*sr);x[:n]*=np.linspace(0,1,n)[:,None];x[-n:]*=np.linspace(1,0,n)[:,None]
 wavfile.write(pcm,sr,np.round(x*32767).astype('<i2'))
 dest=OUT/'abyss-theme.m4a'
 subprocess.run(['afconvert',str(pcm),str(dest),'-f','m4af','-d','aac','-b','192000'],check=True)
 item=dict(file=dest.name,title='Dark Place',author='SkyleTheFrench',duration=len(x)/sr,license='CC0-1.0',source='https://opengameart.org/content/dark-place-loop',sourceSha256=source_hash,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
 (ROOT/'src/menu-theme.json').write_text(json.dumps(item,indent=2)+'\n')
 (ROOT/'assets/provenance/menu-audio/theme.json').write_text(json.dumps(dict(**item,processing='Full recording; DC removal, RMS/peak mastering, 120 ms edge fades, AAC 192 kbit/s.'),indent=2)+'\n')
 (OUT/'THEME-LICENSE.md').write_text('# Menu theme\n\n[Dark Place](https://opengameart.org/content/dark-place-loop) by SkyleTheFrench.\n\nLicense: [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/).\n\nFull recording, level mastered with short boundary fades. Rebuild: python3 tools/build-menu-theme.py.\n\nroom-impulse.wav is a project-generated stereo room impulse, dedicated to CC0-1.0.\n')
# Dark, diffuse room: 22 ms predelay, early reflections and 850 ms decay.
sr=48000;length=round(.85*sr);t=np.arange(length)/sr
rng=np.random.default_rng(4917)
ir=rng.normal(size=(length,2))
ir=sosfilt(butter(2,[250,4200],btype='bandpass',fs=sr,output='sos'),ir,axis=0)
ir*=np.exp(-7*t/.85)[:,None];ir[:round(.022*sr)]=0
for ch in range(2):
 for delay,level in [(.029,.55),(.047,.32),(.071,.2)]:
  ir[round((delay+ch*.003)*sr),ch]+=level
 ir[:,ch]/=np.sqrt(np.sum(ir[:,ch]**2))
ir[-480:]*=np.linspace(1,0,480)[:,None]
wavfile.write(OUT/'room-impulse.wav',sr,np.round(ir*32767).astype('<i2'))
print(json.dumps(item,indent=2))
